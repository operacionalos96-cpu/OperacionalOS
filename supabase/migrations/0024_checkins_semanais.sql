-- =====================================================================
-- HZK OS — Check-in semanal (ADR 0011)
-- Rodar depois do 0023 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- checkins: uma linha por pessoa, semana e tipo (id = "<team_id>:<segunda yyyy-mm-dd>:<segunda|sexta>").
--   Segunda: foco da semana. Sexta: o que saiu, travou e precisa de alguém.
--   Todos leem (página Semana do time); cada um grava SÓ o próprio, inclusive quem só visualiza
--   (mesma regra do check-in do dia, 0022).
-- =====================================================================

create table if not exists public.checkins (
  id         text primary key check (char_length(id) between 1 and 80),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 16000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.checkins enable row level security;
revoke all on public.checkins from anon;
grant select, insert, update, delete on public.checkins to authenticated;

drop policy if exists "membros leem" on public.checkins;
create policy "membros leem" on public.checkins for select to authenticated using ((select private.is_member()));
drop policy if exists "cada um grava o seu" on public.checkins;
create policy "cada um grava o seu" on public.checkins for insert to authenticated
  with check ((select private.is_member()) and data->>'memberId' = (select private.my_team_id()) and id like (select private.my_team_id()) || ':%');
drop policy if exists "cada um edita o seu" on public.checkins;
create policy "cada um edita o seu" on public.checkins for update to authenticated
  using (data->>'memberId' = (select private.my_team_id()))
  with check (data->>'memberId' = (select private.my_team_id()) and id like (select private.my_team_id()) || ':%');
drop policy if exists "cada um apaga o seu" on public.checkins;
create policy "cada um apaga o seu" on public.checkins for delete to authenticated
  using (data->>'memberId' = (select private.my_team_id()));

drop trigger if exists stamp on public.checkins;
create trigger stamp before insert or update on public.checkins for each row execute function private.stamp();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkins') then
    alter publication supabase_realtime add table public.checkins;
  end if;
end;
$$;
