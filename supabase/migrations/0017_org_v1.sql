-- =====================================================================
-- OperacionalOS — Estrutura Organizacional V1 (Hierarquia e Gestão de Cargos)
-- Rodar depois do 0016 no SQL Editor do Supabase.
-- Só ADICIONA e flexibiliza. Nada existente é destruído.
-- =====================================================================

-- 1. Expandir members: remover constraint hardcoded e adicionar dados cadastrais e nível
alter table public.members
  drop constraint if exists members_team_id_check;

alter table public.members
  add column if not exists display_name text check (char_length(display_name) between 1 and 80),
  add column if not exists avatar_url   text,
  add column if not exists role_level   text not null default 'operator'
                           check (role_level in ('owner','admin','operator','viewer')),
  add column if not exists active       boolean not null default true,
  add column if not exists joined_at    timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();

-- Preencher display_name inicial para membros u1 e u2 se ainda estiver nulo
update public.members set display_name = 'Gabriel', role_level = 'owner' where team_id = 'u1' and display_name is null;
update public.members set display_name = 'Igor', role_level = 'owner' where team_id = 'u2' and display_name is null;
update public.members set role_level = 'owner' where team_id in ('u1', 'u2');

-- 2. Funções de verificação de nível e cargo atual (schema privado)
create or replace function private.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role_level
  from public.members
  where email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and active = true
  limit 1;
$$;

create or replace function private.is_at_least(p_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case role_level
      when 'owner'    then 4
      when 'admin'    then 3
      when 'operator' then 2
      when 'viewer'   then 1
      else 0
    end >= case p_level
      when 'owner'    then 4
      when 'admin'    then 3
      when 'operator' then 2
      when 'viewer'   then 1
      else 0
    end
    from public.members
    where email = lower(coalesce(auth.jwt() ->> 'email', '')) and active = true
    limit 1
  ), false);
$$;

revoke all on function private.my_role() from public, anon;
revoke all on function private.is_at_least(text) from public, anon;
grant execute on function private.my_role() to authenticated;
grant execute on function private.is_at_least(text) to authenticated;

-- Permitir que membros autenticados leiam todos os membros da equipe (necessário para organograma e gestão)
drop policy if exists "membro ve a propria linha" on public.members;
create policy "membros leem membros ativos" on public.members
  for select to authenticated
  using ((select private.is_member()));

drop policy if exists "owners e admins gerenciam membros" on public.members;
create policy "owners e admins gerenciam membros" on public.members
  for all to authenticated
  using ((select private.is_at_least('admin')))
  with check ((select private.is_at_least('admin')));

-- 3. Cargos dinâmicos (org_roles): cargos da empresa (ex.: Founder, CEO, CFO, etc.)
create table if not exists public.org_roles (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 64000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.org_roles enable row level security;
revoke all on public.org_roles from anon;
grant select, insert, update, delete on public.org_roles to authenticated;

drop policy if exists "membros leem cargos" on public.org_roles;
create policy "membros leem cargos" on public.org_roles
  for select to authenticated using ((select private.is_member()));

drop policy if exists "owners e admins gerenciam cargos" on public.org_roles;
create policy "owners e admins gerenciam cargos" on public.org_roles
  for all to authenticated
  using ((select private.is_at_least('admin')))
  with check ((select private.is_at_least('admin')));

drop trigger if exists stamp on public.org_roles;
create trigger stamp before insert or update on public.org_roles
  for each row execute function private.stamp();

-- 4. Atribuições de cargo (member_roles): relação N:N permitindo múltiplos cargos e superior imediato
create table if not exists public.member_roles (
  id         text primary key check (char_length(id) between 1 and 64),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 32000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.member_roles enable row level security;
revoke all on public.member_roles from anon;
grant select, insert, update, delete on public.member_roles to authenticated;

drop policy if exists "membros leem atribuicoes" on public.member_roles;
create policy "membros leem atribuicoes" on public.member_roles
  for select to authenticated using ((select private.is_member()));

drop policy if exists "owners e admins gerenciam atribuicoes" on public.member_roles;
create policy "owners e admins gerenciam atribuicoes" on public.member_roles
  for all to authenticated
  using ((select private.is_at_least('admin')))
  with check ((select private.is_at_least('admin')));

drop trigger if exists stamp on public.member_roles;
create trigger stamp before insert or update on public.member_roles
  for each row execute function private.stamp();

-- 5. Realtime para as tabelas organizacionais
do $$
declare t text;
begin
  foreach t in array array['org_roles', 'member_roles', 'members'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- 6. Cargos Padrão da HZK (V1)
insert into public.org_roles (id, data) values
  ('founder', '{"id":"founder","title":"Founder","description":"Sócio fundador. Governança e decisões societárias.","level":"owner","color":"#7c3aed","icon":"Crown","active":true}'),
  ('ceo',     '{"id":"ceo","title":"CEO","description":"Chief Executive Officer. Gestão executiva e geral da empresa.","level":"admin","color":"#2563eb","icon":"Briefcase","active":true}'),
  ('cfo',     '{"id":"cfo","title":"CFO","description":"Chief Financial Officer. Gestão e administração financeira.","level":"admin","color":"#059669","icon":"BarChart","active":true}'),
  ('dev',     '{"id":"dev","title":"Desenvolvedor","description":"Desenvolvimento de produtos e sistemas de software.","level":"operator","color":"#d97706","icon":"Code","active":true}'),
  ('colab',   '{"id":"colab","title":"Colaborador","description":"Execução operacional de atividades e projetos.","level":"operator","color":"#64748b","icon":"User","active":true}')
on conflict (id) do update set data = excluded.data;

-- Atribuições iniciais para os founders existentes (u1 e u2)
insert into public.member_roles (id, data) values
  ('mr_u1_founder', '{"id":"mr_u1_founder","memberId":"u1","roleId":"founder","isPrimary":true,"assignedAt":"2026-01-01T00:00:00.000Z","assignedBy":"system"}'),
  ('mr_u1_ceo',     '{"id":"mr_u1_ceo","memberId":"u1","roleId":"ceo","isPrimary":false,"assignedAt":"2026-01-01T00:00:00.000Z","assignedBy":"system"}'),
  ('mr_u1_cfo',     '{"id":"mr_u1_cfo","memberId":"u1","roleId":"cfo","isPrimary":false,"assignedAt":"2026-01-01T00:00:00.000Z","assignedBy":"system"}'),
  ('mr_u2_founder', '{"id":"mr_u2_founder","memberId":"u2","roleId":"founder","isPrimary":true,"assignedAt":"2026-01-01T00:00:00.000Z","assignedBy":"system"}')
on conflict (id) do nothing;
