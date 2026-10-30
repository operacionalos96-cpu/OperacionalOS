-- =====================================================================
-- OperacionalOS — Estrutura Organizacional V1: travas de segurança
-- Rodar depois do 0017 no SQL Editor do Supabase.
-- Só endurece regras. Nenhum dado é alterado ou apagado.
-- =====================================================================

-- 1. Membro desativado perde o acesso no BANCO, não só na tela.
--    is_member() libera todas as tabelas via RLS; antes ignorava `active`.
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
      and m.active = true
  );
$$;

revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

-- 2. Ninguém sobe de nível sozinho nem mexe em owner sem ser owner.
--    Vale para qualquer escrita em members feita por usuário logado.
--    Service role (rota /api/equipe/convites) e SQL Editor não passam pela trava.
create or replace function private.guard_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       text := lower(coalesce(auth.jwt() ->> 'email', ''));
  my_level text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  my_level := coalesce(private.my_role(), '');

  -- Ninguém altera o próprio nível, status ou e-mail, nem apaga a si mesmo.
  if tg_op = 'DELETE' then
    if old.email = me then
      raise exception 'Você não pode remover a si mesmo da equipe.' using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.email = me and (new.role_level is distinct from old.role_level
                           or new.active is distinct from old.active
                           or new.email is distinct from old.email) then
      raise exception 'Você não pode alterar o próprio nível, status ou e-mail.' using errcode = '42501';
    end if;
  end if;

  -- Só owner cria, promove, rebaixa, desativa ou remove um owner.
  if my_level <> 'owner' then
    if tg_op in ('UPDATE', 'DELETE') and old.role_level = 'owner' then
      raise exception 'Somente owners podem alterar ou remover outro owner.' using errcode = '42501';
    end if;
    if tg_op in ('INSERT', 'UPDATE') and new.role_level = 'owner' then
      raise exception 'Somente owners podem conceder o nível owner.' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.guard_members() from public, anon, authenticated;

drop trigger if exists guard on public.members;
create trigger guard before insert or update or delete on public.members
  for each row execute function private.guard_members();
