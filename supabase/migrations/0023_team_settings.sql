-- =====================================================================
-- HZK OS — Configuração do time (ADR 0010)
-- Rodar depois do 0022 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- team_settings: um documento por assunto (id "time"): horário e link da reunião diária e, mais
--   adiante, a agenda combinada do dia por sessão (comercial, conteúdo…).
--   Todos leem; admin ou acima edita (mesma regra das áreas, 0021).
-- O "fazendo agora", o "pronto para a daily" e o fechar o dia NÃO precisam de tabela nova:
--   ficam na linha do dia de cada pessoa (daily_plans, 0022), que só ela grava.
-- =====================================================================

create table if not exists public.team_settings (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.team_settings enable row level security;
revoke all on public.team_settings from anon;
grant select, insert, update, delete on public.team_settings to authenticated;

drop policy if exists "membros leem" on public.team_settings;
create policy "membros leem" on public.team_settings for select to authenticated using ((select private.is_member()));
drop policy if exists "admin cria" on public.team_settings;
create policy "admin cria" on public.team_settings for insert to authenticated with check ((select private.can_configure()));
drop policy if exists "admin edita" on public.team_settings;
create policy "admin edita" on public.team_settings for update to authenticated using ((select private.can_configure())) with check ((select private.can_configure()));
drop policy if exists "admin apaga" on public.team_settings;
create policy "admin apaga" on public.team_settings for delete to authenticated using ((select private.can_configure()));

drop trigger if exists stamp on public.team_settings;
create trigger stamp before insert or update on public.team_settings for each row execute function private.stamp();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'team_settings') then
    alter publication supabase_realtime add table public.team_settings;
  end if;
end;
$$;
