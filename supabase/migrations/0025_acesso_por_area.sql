-- =====================================================================
-- OperacionalOS — Acesso por área NO BANCO (ADR 0020)
-- Rodar depois do 0024 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Nada muda até um owner marcar uma área como restrita (areas.data.restricted = true).
-- Área restrita: só owner e quem tem concessão (area_access) recebem os dados; os demais
-- ficam na "vitrine" (veem a área em public.areas, mas nenhum dado dela).
-- Níveis: vitrine < ver < operar < aprovar < gerir. A mesma regra está em
-- src/lib/domain/area-access.ts e é conferida por src/lib/server/area-access.rls.test.ts.
-- =====================================================================

-- 1. Concessões: pessoa × área × nível, com validade opcional.
create table if not exists public.area_access (
  id          text primary key default private.ulid('acc'),
  member_id   text not null references public.members(team_id) on delete cascade,
  area_id     text not null references public.areas(id) on delete cascade,
  level       text not null check (level in ('vitrine', 'ver', 'operar', 'aprovar', 'gerir')),
  expires_at  timestamptz,
  granted_by  text not null,
  granted_at  timestamptz not null default now(),
  unique (member_id, area_id)
);
create index if not exists area_access_member on public.area_access (member_id, area_id);

alter table public.area_access enable row level security;
revoke all on public.area_access from anon;
grant select, insert, update, delete on public.area_access to authenticated;

-- 2. Funções de regra (um lugar só para mudar no futuro).
create or replace function private.area_rank(p_level text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_level when 'vitrine' then 0 when 'ver' then 1 when 'operar' then 2
                      when 'aprovar' then 3 when 'gerir' then 4 else -1 end;
$$;

create or replace function private.area_restricted(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (a.data ->> 'restricted')::boolean from public.areas a where a.id = p_area), false);
$$;

-- Nível efetivo de quem está logado na área (null = não é membro ativo).
create or replace function private.area_level(p_area text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select m.team_id, m.role_level from public.members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', '')) and m.active = true
    limit 1
  ), g as (
    select aa.level from public.area_access aa, me
    where aa.member_id = me.team_id and aa.area_id = p_area
      and (aa.expires_at is null or aa.expires_at > now())
  )
  select case
    when me.role_level = 'owner' then 'gerir'
    when private.area_restricted(p_area) then coalesce((select level from g), 'vitrine')
    else (
      select case when private.area_rank(base) >= private.area_rank(coalesce((select level from g), 'vitrine'))
                  then base else (select level from g) end
      from (select case me.role_level when 'admin' then 'aprovar' when 'operator' then 'operar' else 'ver' end as base) b
    )
  end
  from me;
$$;

create or replace function private.can_read_area(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_area is null or private.area_rank(private.area_level(p_area)) >= private.area_rank('ver');
$$;

create or replace function private.can_write_area(p_area text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_write()
     and (p_area is null or private.area_rank(private.area_level(p_area)) >= private.area_rank('operar'));
$$;

-- Owner concede qualquer nível; quem tem gerir na área (construtor) concede até operar.
create or replace function private.can_grant(p_area text, p_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_at_least('owner')
      or (private.area_level(p_area) = 'gerir' and private.area_rank(p_level) <= private.area_rank('operar'));
$$;

-- A tarefa é do logado (responsável ou colaborador)?
create or replace function private.is_my_task(p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_data ->> 'ownerId' = private.my_team_id(), false)
      or coalesce((p_data -> 'collaborators') ? private.my_team_id(), false);
$$;

do $$
declare f text;
begin
  foreach f in array array['area_rank(text)', 'area_restricted(text)', 'area_level(text)', 'can_read_area(text)',
                           'can_write_area(text)', 'can_grant(text, text)', 'is_my_task(jsonb)']
  loop
    execute format('revoke all on function private.%s from public, anon', f);
    execute format('grant execute on function private.%s to authenticated', f);
  end loop;
end;
$$;

-- 3. Quem vê e quem mexe nas concessões.
drop policy if exists "ver concessoes" on public.area_access;
create policy "ver concessoes" on public.area_access for select to authenticated
  using ((select private.is_member()) and (
    member_id = (select private.my_team_id())
    or (select private.is_at_least('owner'))
    or private.area_level(area_id) = 'gerir'));

drop policy if exists "conceder" on public.area_access;
create policy "conceder" on public.area_access for insert to authenticated
  with check (private.can_grant(area_id, level) and granted_by = (select private.my_team_id()));

drop policy if exists "alterar concessao" on public.area_access;
create policy "alterar concessao" on public.area_access for update to authenticated
  using (private.can_grant(area_id, level))
  with check (private.can_grant(area_id, level) and granted_by = (select private.my_team_id()));

drop policy if exists "retirar concessao" on public.area_access;
create policy "retirar concessao" on public.area_access for delete to authenticated
  using (private.can_grant(area_id, level));

-- 4. Só owner marca ou desmarca uma área como restrita (admin edita o resto da área).
create or replace function private.guard_area_restricted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes boolean := coalesce((old.data ->> 'restricted')::boolean, false);
  depois boolean := coalesce((new.data ->> 'restricted')::boolean, false);
begin
  if antes is distinct from depois then
    -- Fora de uma sessão de usuário (SQL Editor / servidor) a mudança passa.
    if auth.jwt() ->> 'email' is not null and not private.is_at_least('owner') then
      raise exception 'Só um owner restringe ou libera uma área' using errcode = '42501';
    end if;
    insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata)
    values (private.ulid('evt'), case when depois then 'area.restricted' else 'area.unrestricted' end,
            'area', new.id, case when auth.jwt() ->> 'email' is null then 'system' else 'human' end,
            coalesce(private.my_team_id(), 'sistema'), '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists guard_restricted on public.areas;
create trigger guard_restricted before update of data on public.areas
  for each row execute function private.guard_area_restricted();

-- 5. Histórico de cada concessão.
create or replace function private.log_area_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.area_access;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata)
  values (private.ulid('evt'),
          case tg_op when 'INSERT' then 'access.granted' when 'UPDATE' then 'access.changed' else 'access.revoked' end,
          'area', r.area_id,
          case when auth.jwt() ->> 'email' is null then 'system' else 'human' end,
          coalesce(private.my_team_id(), 'sistema'),
          jsonb_build_object('memberId', r.member_id, 'level', r.level, 'expiresAt', r.expires_at,
                             'previousLevel', case when tg_op = 'UPDATE' then old.level end));
  return null;
end;
$$;

drop trigger if exists log_access on public.area_access;
create trigger log_access after insert or update or delete on public.area_access
  for each row execute function private.log_area_access();

-- 6. Dados que pertencem a uma área inteira: ler e gravar passam pela área.
do $$
declare
  par text[];
  t text;
  a text;
  escrever text;
begin
  foreach par slice 1 in array array[['transactions', 'financeiro'], ['finance_settings', 'financeiro'],
                                     ['leads', 'comercial'], ['activities', 'comercial']]
  loop
    t := par[1];
    a := par[2];
    if to_regclass('public.' || t) is null then continue; end if;
    -- finance_settings continua exigindo admin+ (ADR 0005); os demais, operator+.
    escrever := case when t = 'finance_settings'
                     then format('(select private.can_configure()) and (select private.can_write_area(%L))', a)
                     else format('(select private.can_write_area(%L))', a) end;
    execute format($f$
      drop policy if exists "membros leem" on public.%1$I;
      create policy "membros leem" on public.%1$I
        for select to authenticated using ((select private.is_member()) and (select private.can_read_area(%2$L)));

      drop policy if exists "membros criam" on public.%1$I;
      create policy "membros criam" on public.%1$I
        for insert to authenticated with check (%3$s);

      drop policy if exists "membros editam" on public.%1$I;
      create policy "membros editam" on public.%1$I
        for update to authenticated using (%3$s) with check (%3$s);

      drop policy if exists "membros apagam" on public.%1$I;
      create policy "membros apagam" on public.%1$I
        for delete to authenticated using (%3$s);
    $f$, t, a, escrever);
  end loop;
end;
$$;

-- 7. Tarefas: vale a área do próprio item; responsável e colaboradores sempre veem a sua.
drop policy if exists "membros leem" on public.tasks;
create policy "membros leem" on public.tasks for select to authenticated
  using ((select private.is_member()) and (private.can_read_area(data ->> 'areaId') or private.is_my_task(data)));

drop policy if exists "membros criam" on public.tasks;
create policy "membros criam" on public.tasks for insert to authenticated
  with check (private.can_write_area(data ->> 'areaId'));

drop policy if exists "membros editam" on public.tasks;
create policy "membros editam" on public.tasks for update to authenticated
  using (private.can_write_area(data ->> 'areaId') or ((select private.can_write()) and private.is_my_task(data)))
  with check (private.can_write_area(data ->> 'areaId') or ((select private.can_write()) and private.is_my_task(data)));

drop policy if exists "membros apagam" on public.tasks;
create policy "membros apagam" on public.tasks for delete to authenticated
  using (private.can_write_area(data ->> 'areaId'));

-- 8. Tempo real: concessões também chegam na hora (a RLS vale aqui também).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'area_access') then
    alter publication supabase_realtime add table public.area_access;
  end if;
end;
$$;
