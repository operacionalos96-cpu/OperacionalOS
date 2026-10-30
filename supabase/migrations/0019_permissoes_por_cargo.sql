-- =====================================================================
-- OperacionalOS — Permissões por cargo NO BANCO (ADR 0005)
-- Rodar depois do 0018 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Antes: qualquer membro ativo criava, editava e apagava tudo (a tela era a única barreira).
-- Agora (menor privilégio, Saltzer & Schroeder 1975):
--   viewer   → só lê
--   operator → lê e grava os dados do negócio
--   admin    → + configurações (financeiro, cargos, membros)
--   owner    → + conceder/remover owner (trava da 0018)
-- A mesma matriz está em src/lib/domain/org.ts (PERMISSIONS); a tela só esconde botões.
-- Nada é apagado: só as regras de escrita mudam.
-- =====================================================================

-- 1. Regras com nome (um lugar só para mudar no futuro).
create or replace function private.can_write()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_at_least('operator');
$$;

create or replace function private.can_configure()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_at_least('admin');
$$;

revoke all on function private.can_write() from public, anon;
revoke all on function private.can_configure() from public, anon;
grant execute on function private.can_write() to authenticated;
grant execute on function private.can_configure() to authenticated;

-- 2. Dados do negócio: ler = membro ativo; gravar = operator ou acima.
do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'activities', 'tasks', 'notes', 'transactions', 'mind_maps',
    'products', 'content_accounts', 'content_items', 'relations', 'entity_context',
    'map_nodes', 'map_edges', 'goals', 'agents', 'learnings', 'hypotheses'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format($f$
      drop policy if exists "membros criam" on public.%1$I;
      create policy "membros criam" on public.%1$I
        for insert to authenticated with check ((select private.can_write()));

      drop policy if exists "membros editam" on public.%1$I;
      create policy "membros editam" on public.%1$I
        for update to authenticated using ((select private.can_write())) with check ((select private.can_write()));

      drop policy if exists "membros apagam" on public.%1$I;
      create policy "membros apagam" on public.%1$I
        for delete to authenticated using ((select private.can_write()));
    $f$, t);
  end loop;
end;
$$;

-- 3. Configuração financeira (saldo inicial, metas da empresa): admin ou acima.
drop policy if exists "membros criam" on public.finance_settings;
create policy "membros criam" on public.finance_settings
  for insert to authenticated with check ((select private.can_configure()));

drop policy if exists "membros editam" on public.finance_settings;
create policy "membros editam" on public.finance_settings
  for update to authenticated using ((select private.can_configure())) with check ((select private.can_configure()));

drop policy if exists "membros apagam" on public.finance_settings;
create policy "membros apagam" on public.finance_settings
  for delete to authenticated using ((select private.can_configure()));

-- 4. Histórico de eventos: só quem age registra (viewer não age).
drop policy if exists "membros registram eventos" on public.events;
create policy "membros registram eventos" on public.events
  for insert to authenticated with check ((select private.can_write()));

-- 5. Arquivos dos conteúdos: ler = membro; enviar/trocar/apagar = operator (mantém a cota da 0009).
drop policy if exists "membros enviam arquivos de conteudo" on storage.objects;
create policy "membros enviam arquivos de conteudo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'conteudos' and (select private.can_write()) and (select private.upload_quota_ok()));

drop policy if exists "membros atualizam arquivos de conteudo" on storage.objects;
create policy "membros atualizam arquivos de conteudo" on storage.objects
  for update to authenticated
  using (bucket_id = 'conteudos' and (select private.can_write()))
  with check (bucket_id = 'conteudos' and (select private.can_write()));

drop policy if exists "membros apagam arquivos de conteudo" on storage.objects;
create policy "membros apagam arquivos de conteudo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'conteudos' and (select private.can_write()));
