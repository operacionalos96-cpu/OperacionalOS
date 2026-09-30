-- =====================================================================
-- Operacional OS — escala (índices)
-- Rodar depois do 0006 (SQL Editor → New query → colar → Run). Pode rodar de novo.
--
-- 1) Todas as tabelas carregam em páginas ordenadas por (updated_at, id):
--    índice nessa ordem deixa cada página rápida mesmo com muitos registros.
-- 2) Conexões são buscadas pelos dois lados (de / para).
-- Não muda dados nem permissões.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'leads', 'activities', 'tasks', 'notes', 'transactions', 'mind_maps',
    'products', 'content_accounts', 'content_items', 'relations', 'entity_context',
    'map_nodes', 'map_edges', 'goals'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('create index if not exists %1$s_updated_idx on public.%1$I (updated_at, id)', t);
    end if;
  end loop;
end;
$$;

create index if not exists relations_from_idx on public.relations ((data->'from'->>'id'));
create index if not exists relations_to_idx on public.relations ((data->'to'->>'id'));
