-- =====================================================================
-- Operacional OS — banco de dados + segurança
-- Rodar UMA vez no Supabase: Dashboard → SQL Editor → New query → colar → Run.
--
-- Modelo de segurança (defesa em camadas):
--  1. Cadastro público desligado no painel (ninguém cria conta sozinho).
--  2. Lista de e-mails autorizados (public.members). Mesmo que alguém
--     consiga uma conta, sem estar na lista o banco não entrega NADA.
--  3. RLS em todas as tabelas: só membros leem/escrevem; anônimo não tem acesso.
--  4. A lista de membros só é editável pelo SQL Editor (não pela API).
--  5. Limites de tamanho nos dados para impedir abuso/lotação.
-- =====================================================================

-- ---------- membros autorizados ----------
create table if not exists public.members (
  email      text primary key check (email = lower(email) and email like '%@%'),
  team_id    text not null unique check (team_id in ('u1', 'u2')),  -- u1 = Gabriel, u2 = Igor (src/config/team.ts)
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select on public.members to authenticated;

-- Cada pessoa só consegue ver a própria linha (para o app saber quem ela é).
drop policy if exists "membro ve a propria linha" on public.members;
create policy "membro ve a propria linha" on public.members
  for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));
-- Sem políticas de insert/update/delete: a lista só muda pelo SQL Editor.

-- ---------- função de checagem (schema privado, fora da API) ----------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

-- ---------- quem alterou e quando (preenchido pelo banco, não pelo app) ----------
create or replace function private.stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- ---------- coleções (1 tabela por tipo; o conteúdo vai em jsonb) ----------
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'activities', 'tasks', 'notes', 'transactions', 'mind_maps', 'finance_settings']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key check (char_length(id) between 1 and 64),
        data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 256000),
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
  end loop;
end;
$$;

-- Configuração financeira é uma linha só.
alter table public.finance_settings drop constraint if exists finance_settings_single_row;
alter table public.finance_settings add constraint finance_settings_single_row check (id = 'default');

-- ---------- tempo real: um vê a mudança do outro na hora (RLS vale aqui também) ----------
do $$
declare
  t text;
begin
  foreach t in array array['leads', 'activities', 'tasks', 'notes', 'transactions', 'mind_maps', 'finance_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- PASSO FINAL: coloque aqui os DOIS e-mails autorizados (minúsculo) e rode.
-- =====================================================================
-- insert into public.members (email, team_id) values
--   ('email-do-gabriel@exemplo.com', 'u1'),
--   ('email-do-igor@exemplo.com',    'u2')
-- on conflict (email) do update set team_id = excluded.team_id;
