-- =====================================================================
-- OperacionalOS — HZK Dock: motor na nuvem (ADR 0026, proposta)
-- Rodar depois do 0029 no SQL Editor do Supabase, DEPOIS do deploy. Pode rodar mais de uma vez.
--
-- O que entra:
--   1. Um trabalhador "nuvem" por pessoa (workers.kind = 'nuvem'), com dono, como o PC liberado da 0028.
--      Quem liga é a própria pessoa, para os bots DELA. Ele não tem token: o hash é de um valor
--      aleatório que ninguém recebe, então não autentica em /api/workers (o servidor recusa 'nuvem'
--      lá também). Quem o usa é só o servidor, por dentro (src/lib/server/dock-cloud.ts).
--   2. Como ele tem dono, as regras da 0028 valem sem mudar nada: claim_next_job só entrega o que é do
--      mesmo dono e office_engine_job confere lease, trabalhador ligado e mesmo dono.
--   3. Ele só pega respostas (office_reply). Ação aprovada (office_action) continua com o PC: no
--      servidor não há executor de conector nesta versão.
--   4. OpenRouter classificado como "padrao": o motor sempre pede provider.data_collection = "deny"
--      (só provedores que não guardam os dados). Founder pode trocar a classificação.
-- Nenhuma coluna guarda chave, token ou senha. Nenhum dado existente é alterado.
-- =====================================================================

-- ---------- 1. tipo "nuvem" ----------
alter table public.workers drop constraint if exists workers_kind_check;
alter table public.workers add constraint workers_kind_check check (kind in ('servico', 'pc', 'nuvem'));
-- motor na nuvem é sempre de alguém (nunca um trabalhador da empresa que pegaria entregas de todos)
alter table public.workers drop constraint if exists workers_nuvem_shape_check;
alter table public.workers add constraint workers_nuvem_shape_check
  check (kind <> 'nuvem' or owner_team_id is not null);
-- um por pessoa
create unique index if not exists workers_nuvem_one_per_owner on public.workers (owner_team_id) where kind = 'nuvem';

-- ---------- 2. a pessoa liga e desliga ----------
-- Ligar: cria (ou religa) o motor na nuvem DELA. Desligar: vale na hora, e as entregas que ele segurava
-- voltam para a fila sem contar tentativa (igual a office_disable_pc).
create or replace function public.office_set_cloud_engine(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_id text;
begin
  select w.id into v_id from public.workers w where w.owner_team_id = v_me and w.kind = 'nuvem';
  if coalesce(p_on, false) then
    if v_id is null then
      insert into public.workers (id, name, engine, capabilities, scopes, token_hash, token_hint, enabled, created_by, owner_team_id, kind)
      values (private.ulid('wrk'), 'Motor na nuvem', 'hzk-nuvem', array['office_reply'],
              array['queue:read', 'jobs:claim', 'jobs:execute', 'office:engine'],
              -- hash de um valor aleatório que ninguém recebe: não existe token que autentique como ele
              encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'),
              'nuvm', true, v_me, v_me, 'nuvem');
    else
      update public.workers set enabled = true where id = v_id;
    end if;
    return true;
  end if;
  if v_id is not null then
    update public.workers set enabled = false where id = v_id;
    update public.ai_jobs set status = 'queued', attempt_count = greatest(0, attempt_count - 1), claimed_by = null,
      lease_id = null, lease_expires_at = null, started_at = null, available_at = now(), updated_at = now()
    where claimed_by = v_id and status in ('claimed', 'running');
  end if;
  return false;
end;
$$;
revoke all on function public.office_set_cloud_engine(boolean) from public, anon;
grant execute on function public.office_set_cloud_engine(boolean) to authenticated;

-- ---------- 3. OpenRouter: o que faz com os dados ----------
insert into public.dock_provider_policies (provider, data_class, note, source_url, checked_on, set_by, hosts) values
  ('openrouter', 'padrao',
   'O motor sempre pede provider.data_collection = "deny": só vão provedores que não guardam os dados. Sem esse pedido, alguns modelos grátis treinam com o conteúdo.',
   'https://openrouter.ai/docs/guides/routing/provider-selection', '2026-11-26', 'sistema', array['openrouter.ai'])
on conflict (provider) do nothing;
