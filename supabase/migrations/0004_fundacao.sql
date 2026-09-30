-- =====================================================================
-- Operacional OS — fundação integrada (relações + contexto comum)
-- Rodar depois do 0003 (SQL Editor → New query → colar → Run).
--
-- relations:      liga QUALQUER entidade a qualquer outra (tarefa ↔ lead,
--                 produto ↔ conteúdo, balão ↔ meta…), com tipo e legenda.
-- entity_context: notas, links, anexos e comentários de qualquer entidade.
-- Mesmo padrão de segurança: RLS só para membros, anônimo sem acesso.
-- Anexos usam o bucket privado "conteudos" (já protegido no 0002).
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['relations', 'entity_context']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key check (char_length(id) between 1 and 96),
        data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 512000),
        updated_at timestamptz not null default now(),
        updated_by uuid
      );
      alter table public.%1$I enable row level security;
      revoke all on public.%1$I from anon;
      grant select, insert, update, delete on public.%1$I to authenticated;

      drop policy if exists "membros leem" on public.%1$I;
      create policy "membros leem" on public.%1$I
        for select to authenticated using ((select private.is_member()));

      drop policy if exists "membros criam" on public.%1$I;
      create policy "membros criam" on public.%1$I
        for insert to authenticated with check ((select private.is_member()));

      drop policy if exists "membros editam" on public.%1$I;
      create policy "membros editam" on public.%1$I
        for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));

      drop policy if exists "membros apagam" on public.%1$I;
      create policy "membros apagam" on public.%1$I
        for delete to authenticated using ((select private.is_member()));

      drop trigger if exists stamp on public.%1$I;
      create trigger stamp before insert or update on public.%1$I
        for each row execute function private.stamp();
    $f$, t);

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
