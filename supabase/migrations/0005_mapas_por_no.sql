-- =====================================================================
-- Operacional OS — mapa com 1 registro por balão
-- Rodar depois do 0004 (SQL Editor → New query → colar → Run).
--
-- map_nodes: um balão por linha (id = "<mapa>~<balão>", data.mapId)
-- map_edges: uma ligação por linha
-- Assim cada sócio grava só o balão que mexeu: um não sobrescreve o outro.
-- Os mapas antigos são copiados pelo app ao abrir; o conteúdo antigo em
-- mind_maps continua guardado como backup (nada é apagado).
-- Mesmo padrão de segurança: RLS só para membros, anônimo sem acesso.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['map_nodes', 'map_edges']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key check (char_length(id) between 1 and 160),
        data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 64000),
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

      create index if not exists %1$s_map_idx on public.%1$I ((data->>'mapId'));
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
