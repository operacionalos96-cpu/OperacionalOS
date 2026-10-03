-- =====================================================================
-- Operacional OS — AI Office (eventos, agentes, aprendizados, hipóteses)
-- Rodar depois do 0009 (SQL Editor → New query → colar → Run). Pode rodar de novo.
--
-- events: o histórico do negócio ("lead.approved", "lead.contacted"…).
--   Só GRAVAR e LER: ninguém edita nem apaga (é o registro de verdade, base para
--   aprendizado, webhooks, MCP e workers no futuro).
-- agents / learnings / hypotheses: mesmo padrão das outras coleções (id + data JSON),
--   só membros, tempo real.
-- Nenhuma IA paga: agentes são cadastro + status; quem "executa" virá por MCP/webhooks.
-- =====================================================================

create table if not exists public.events (
  id          text primary key check (char_length(id) between 8 and 64),
  event_type  text not null check (event_type ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id   text not null check (char_length(entity_id) <= 120),
  actor_type  text not null check (actor_type in ('human', 'agent', 'system')),
  actor_id    text not null check (char_length(actor_id) <= 80),
  metadata    jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) < 32000),
  created_at  timestamptz not null default now()
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_entity_idx on public.events (entity_type, entity_id);
create index if not exists events_type_idx on public.events (event_type, created_at desc);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert on public.events to authenticated;

drop policy if exists "membros leem eventos" on public.events;
create policy "membros leem eventos" on public.events
  for select to authenticated using ((select private.is_member()));

drop policy if exists "membros registram eventos" on public.events;
create policy "membros registram eventos" on public.events
  for insert to authenticated with check ((select private.is_member()));
-- (sem update/delete: o histórico não se altera)

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events') then
    alter publication supabase_realtime add table public.events;
  end if;
end;
$$;

-- ---------- agentes, aprendizados e hipóteses (padrão id + data) ----------
do $$
declare
  t text;
begin
  foreach t in array array['agents', 'learnings', 'hypotheses']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key check (char_length(id) between 1 and 96),
        data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 256000),
        updated_at timestamptz not null default now(),
        updated_by uuid
      );
      alter table public.%1$I enable row level security;
      revoke all on public.%1$I from anon;
      grant select, insert, update, delete on public.%1$I to authenticated;

      drop policy if exists "membros leem" on public.%1$I;
      create policy "membros leem" on public.%1$I for select to authenticated using ((select private.is_member()));
      drop policy if exists "membros criam" on public.%1$I;
      create policy "membros criam" on public.%1$I for insert to authenticated with check ((select private.is_member()));
      drop policy if exists "membros editam" on public.%1$I;
      create policy "membros editam" on public.%1$I for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));
      drop policy if exists "membros apagam" on public.%1$I;
      create policy "membros apagam" on public.%1$I for delete to authenticated using ((select private.is_member()));

      drop trigger if exists stamp on public.%1$I;
      create trigger stamp before insert or update on public.%1$I for each row execute function private.stamp();
      create index if not exists %1$s_updated_idx on public.%1$I (updated_at, id);
    $f$, t);

    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
