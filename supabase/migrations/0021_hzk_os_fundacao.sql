-- =====================================================================
-- HZK OS — Fase 1: áreas e notificações (docs/hzk-os-blueprint.md)
-- Rodar depois do 0020 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Reaproveita o que existe (docs/plano-implementacao.md):
--  - pessoas = members (+ cargos em member_roles), sem mudança;
--  - item único = tabela tasks (campo `kind` no jsonb; nenhuma tabela nova de itens);
--  - decisões = item com kind "decision" (campo `decision` no jsonb).
-- Novo: areas (dono de cada área) e notifications (avisos por pessoa).
-- =====================================================================

-- team_id de quem está logado (para "cada um vê os próprios avisos").
create or replace function private.my_team_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select team_id from public.members
  where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active = true
  limit 1;
$$;
revoke all on function private.my_team_id() from public, anon;
grant execute on function private.my_team_id() to authenticated;

-- 1. Áreas: todos leem; só gestão (admin+) muda dono, apoio e aprovador.
create table if not exists public.areas (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.areas enable row level security;
revoke all on public.areas from anon;
grant select, insert, update, delete on public.areas to authenticated;

drop policy if exists "membros leem" on public.areas;
create policy "membros leem" on public.areas for select to authenticated using ((select private.is_member()));
drop policy if exists "membros criam" on public.areas;
create policy "membros criam" on public.areas for insert to authenticated with check ((select private.can_configure()));
drop policy if exists "membros editam" on public.areas;
create policy "membros editam" on public.areas for update to authenticated using ((select private.can_configure())) with check ((select private.can_configure()));
drop policy if exists "membros apagam" on public.areas;
create policy "membros apagam" on public.areas for delete to authenticated using ((select private.can_configure()));

drop trigger if exists stamp on public.areas;
create trigger stamp before insert or update on public.areas for each row execute function private.stamp();

-- Proposta do blueprint com as respostas de 31/10/2026 (Founder A = Gabriel/u1, Founder B = Igor/u2).
-- Mesmo conjunto de src/lib/domain/areas.ts (DEFAULT_AREAS). Não sobrescreve o que já foi editado.
insert into public.areas (id, data) values
  ('financeiro', '{"id":"financeiro","name":"Financeiro","description":"Caixa, pagamentos, repasses de coprodução","owner":{"role":"ceo"},"approver":{"role":"ceo"},"order":1}'),
  ('contratos', '{"id":"contratos","name":"Contratos e jurídico","description":"Contratos com parceiros e coprodutores","owner":{"role":"ceo"},"approver":{"role":"ceo"},"approvalNote":"Apoio do founder do parceiro","order":2}'),
  ('estrategia', '{"id":"estrategia","name":"Estratégia e metas","description":"Metas e prioridades do trimestre","owner":{"role":"ceo"},"supportIds":["u1","u2"],"approver":{"role":"ceo"},"order":3}'),
  ('pessoas', '{"id":"pessoas","name":"Pessoas","description":"Contratação e rotina do time","owner":{"role":"ceo"},"supportIds":["u1","u2"],"approver":{"role":"ceo"},"order":4}'),
  ('conteudo', '{"id":"conteudo","name":"Conteúdo HZK e marca","description":"Instagram e marca da HZK","owner":{"memberId":"u1"},"approver":{"memberId":"u1"},"order":5}'),
  ('roteiros', '{"id":"roteiros","name":"Roteiros e posicionamento","description":"Roteiros, falas e posicionamento","owner":{"memberId":"u1"},"supportIds":["u2"],"approver":{"memberId":"u1"},"approvalNote":"Com revisão do outro founder","order":6}'),
  ('comercial', '{"id":"comercial","name":"Comercial e coprodutores","description":"Vendas e novos coprodutores","owner":{"memberId":"u2"},"supportIds":["u1"],"approver":{"memberId":"u2"},"approvalNote":"Contrato vai para a CEO","order":7}'),
  ('lancamentos', '{"id":"lancamentos","name":"Lançamentos e coproduzidos","description":"Operação dos produtos coproduzidos","owner":{"memberId":"u2"},"approver":{"memberId":"u2"},"order":8}'),
  ('trafego', '{"id":"trafego","name":"Tráfego, funis e dados","description":"Anúncios, funis e métricas","owner":{"memberId":"u2"},"approver":{"memberId":"u2"},"approvalNote":"Verba vai para a CEO","order":9}')
on conflict (id) do nothing;

-- 2. Avisos por pessoa ("Esperando por você"): cada um lê e marca os seus; quem age cria para os outros.
create table if not exists public.notifications (
  id         text primary key check (char_length(id) between 1 and 64),
  user_id    text not null check (char_length(user_id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8000),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from anon;
grant select, insert, update, delete on public.notifications to authenticated;

drop policy if exists "cada um le os seus avisos" on public.notifications;
create policy "cada um le os seus avisos" on public.notifications
  for select to authenticated using (user_id = (select private.my_team_id()));
drop policy if exists "quem age cria avisos" on public.notifications;
create policy "quem age cria avisos" on public.notifications
  for insert to authenticated with check ((select private.can_write()));
drop policy if exists "cada um marca os seus como lidos" on public.notifications;
create policy "cada um marca os seus como lidos" on public.notifications
  for update to authenticated using (user_id = (select private.my_team_id())) with check (user_id = (select private.my_team_id()));
drop policy if exists "cada um apaga os seus" on public.notifications;
create policy "cada um apaga os seus" on public.notifications
  for delete to authenticated using (user_id = (select private.my_team_id()));

-- 3. Tempo real para as duas tabelas novas.
do $$
declare t text;
begin
  foreach t in array array['areas', 'notifications'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- 4. A CEO ainda não está no sistema (resposta de 31/10/2026): Gabriel é Founder A, não CEO.
--    A seed da 0017 tinha dado o cargo CEO a ele; sem isso, as decisões da CEO cairiam só nele.
--    Quando a CEO entrar, basta dar o cargo CEO a ela em Equipe › Cargos.
delete from public.member_roles where id = 'mr_u1_ceo';
