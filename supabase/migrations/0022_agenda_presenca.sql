-- =====================================================================
-- HZK OS — Agenda do time e check-in do dia (ADR 0009)
-- Rodar depois do 0021 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- calendar_events: reuniões, compromissos, foco e ausências (fonte da presença automática).
--   Todos leem; operator ou acima agenda (mesma regra dos dados do negócio, 0019).
-- daily_plans: check-in do dia (horário e foco) e, na fase 2, o fechamento do dia.
--   Todos leem (para o "Time agora"); cada um grava SÓ o próprio, inclusive quem só visualiza.
-- O "online" (app aberto agora) não usa tabela: é presença em tempo real do Supabase.
-- =====================================================================

-- 1. Agenda
create table if not exists public.calendar_events (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists calendar_events_start_idx on public.calendar_events ((data->>'start'));
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon;
grant select, insert, update, delete on public.calendar_events to authenticated;

drop policy if exists "membros leem" on public.calendar_events;
create policy "membros leem" on public.calendar_events for select to authenticated using ((select private.is_member()));
drop policy if exists "membros criam" on public.calendar_events;
create policy "membros criam" on public.calendar_events for insert to authenticated with check ((select private.can_write()));
drop policy if exists "membros editam" on public.calendar_events;
create policy "membros editam" on public.calendar_events for update to authenticated using ((select private.can_write())) with check ((select private.can_write()));
drop policy if exists "membros apagam" on public.calendar_events;
create policy "membros apagam" on public.calendar_events for delete to authenticated using ((select private.can_write()));

drop trigger if exists stamp on public.calendar_events;
create trigger stamp before insert or update on public.calendar_events for each row execute function private.stamp();

-- 2. Check-in do dia (uma linha por pessoa por dia: id = "<team_id>:<yyyy-mm-dd>")
create table if not exists public.daily_plans (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.daily_plans enable row level security;
revoke all on public.daily_plans from anon;
grant select, insert, update, delete on public.daily_plans to authenticated;

drop policy if exists "membros leem" on public.daily_plans;
create policy "membros leem" on public.daily_plans for select to authenticated using ((select private.is_member()));
drop policy if exists "cada um grava o seu" on public.daily_plans;
create policy "cada um grava o seu" on public.daily_plans for insert to authenticated
  with check ((select private.is_member()) and data->>'memberId' = (select private.my_team_id()) and id like (select private.my_team_id()) || ':%');
drop policy if exists "cada um edita o seu" on public.daily_plans;
create policy "cada um edita o seu" on public.daily_plans for update to authenticated
  using (data->>'memberId' = (select private.my_team_id()))
  with check (data->>'memberId' = (select private.my_team_id()) and id like (select private.my_team_id()) || ':%');
drop policy if exists "cada um apaga o seu" on public.daily_plans;
create policy "cada um apaga o seu" on public.daily_plans for delete to authenticated
  using (data->>'memberId' = (select private.my_team_id()));

drop trigger if exists stamp on public.daily_plans;
create trigger stamp before insert or update on public.daily_plans for each row execute function private.stamp();

-- 3. Tempo real
do $$
declare t text;
begin
  foreach t in array array['calendar_events', 'daily_plans'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
