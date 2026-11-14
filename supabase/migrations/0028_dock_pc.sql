-- =====================================================================
-- OperacionalOS — HZK Dock v3: PC liberado e funções do motor (fatias 4 e 5 da nota 32)
-- Contrato: nota 42 do vault, F5.2 (office-delivery/v1, hzk-skill/v1, reservas). Segurança: notas 26 e 27.
-- Rodar depois do 0027 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- O que entra:
--   1. PC liberado: o PC vira um trabalhador PESSOAL (workers com dono, como na 0026).
--      A pessoa pede (com a sessão dela, pela tela), um founder aprova, a pessoa ou um founder desliga.
--      O token oos_ nasce no PC; ao servidor só chega o hash. Desligar vale na hora: o token deixa
--      de autenticar e as entregas em andamento voltam para a fila.
--   2. Funções "servidor" que o motor chama por /api/workers (token oos_ do PC), sempre com o lease:
--      contexto da entrega, pacote da skill, estado da conexão (sem cota) e uso.
--   3. claim_next_job passa a respeitar o escritório suspenso e o bot pausado também em office_action
--      (lacuna listada na nota 42, "o que esta migration não cobre").
-- As pastas liberadas NÃO entram aqui, de propósito: ficam só no PC (o servidor não precisa saber os caminhos).
-- Nenhuma coluna guarda chave, token ou senha. Nenhum dado existente é alterado.
-- =====================================================================

-- ---------- 1. PC liberado ----------
alter table public.workers add column if not exists kind text not null default 'servico';
alter table public.workers drop constraint if exists workers_kind_check;
alter table public.workers add constraint workers_kind_check check (kind in ('servico', 'pc'));
alter table public.workers add column if not exists pc_status text;
alter table public.workers drop constraint if exists workers_pc_status_check;
alter table public.workers add constraint workers_pc_status_check
  check (pc_status is null or pc_status in ('pedido', 'aprovado', 'recusado', 'desligado'));
alter table public.workers add column if not exists requested_at timestamptz;
alter table public.workers add column if not exists decided_by text;
alter table public.workers add column if not exists decided_at timestamptz;
alter table public.workers add column if not exists disabled_by text;
alter table public.workers add column if not exists disabled_at timestamptz;
-- PC é sempre de alguém, tem estado e só fica ligado depois de aprovado
alter table public.workers drop constraint if exists workers_pc_shape_check;
alter table public.workers add constraint workers_pc_shape_check
  check (kind <> 'pc' or (owner_team_id is not null and pc_status is not null and (not enabled or pc_status = 'aprovado')));

grant select (kind, pc_status, requested_at, decided_at, disabled_at) on public.workers to authenticated;
-- o founder vê os PCs de todo mundo (para aprovar e desligar); vê só o cadastro, nunca o hash (fora do grant)
drop policy if exists "founders leem PCs" on public.workers;
create policy "founders leem PCs" on public.workers for select to authenticated
  using (kind = 'pc' and (select private.is_at_least('owner')));

-- A pessoa pede para liberar este PC. Quem chama é a tela do app (sessão da pessoa), com o hash
-- do token que o motor criou no PC. O token em si nunca sai do PC.
create or replace function public.office_request_pc(p_name text, p_token_hash text, p_token_hint text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_id text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'office_invalid_token_hash'; end if;
  if p_token_hint is null or p_token_hint !~ '^[A-Za-z0-9_-]{4}$' then raise exception 'office_invalid_token_hint'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 80 then raise exception 'office_invalid_name'; end if;
  if exists (select 1 from public.workers w where w.token_hash = p_token_hash) then raise exception 'office_token_reused'; end if;
  if (select count(*) from public.workers w where w.owner_team_id = v_me and w.kind = 'pc' and w.pc_status in ('pedido', 'aprovado')) >= 5 then
    raise exception 'office_limit_pcs';
  end if;
  v_id := private.ulid('wrk');
  insert into public.workers (id, name, engine, capabilities, scopes, token_hash, token_hint, enabled, created_by,
                              owner_team_id, kind, pc_status, requested_at)
  values (v_id, trim(p_name), 'hzk-pc', array['office_reply', 'office_action'],
          array['queue:read', 'jobs:claim', 'jobs:execute', 'office:engine'],
          p_token_hash, p_token_hint, false, v_me, v_me, 'pc', 'pedido', now());
  return v_id;
end;
$$;

-- Founder decide o pedido ("PC da Maria pediu acesso").
create or replace function public.dock_decide_pc(p_worker text, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null or not private.is_at_least('owner') then raise exception 'dock_founder_only' using errcode = '42501'; end if;
  update public.workers set
    enabled = coalesce(p_approve, false),
    pc_status = case when coalesce(p_approve, false) then 'aprovado' else 'recusado' end,
    decided_by = v_me, decided_at = now()
  where id = p_worker and kind = 'pc' and pc_status = 'pedido';
  if not found then raise exception 'office_pc_not_found'; end if;
end;
$$;

-- Desligar um PC: o dono ou um founder. Vale na hora. Não tem volta: para ligar de novo, o PC pede outra vez
-- (com token novo). As entregas que ele segurava voltam para a fila sem contar tentativa.
create or replace function public.office_disable_pc(p_worker text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.my_team_id();
  v_n int;
begin
  if v_me is null then raise exception 'office_not_member'; end if;
  update public.workers set enabled = false, pc_status = 'desligado', disabled_by = v_me, disabled_at = now()
  where id = p_worker and kind = 'pc' and pc_status in ('pedido', 'aprovado')
    and (owner_team_id = v_me or private.is_at_least('owner'));
  if not found then raise exception 'office_pc_not_found'; end if;
  update public.ai_jobs set status = 'queued', attempt_count = greatest(0, attempt_count - 1), claimed_by = null,
    lease_id = null, lease_expires_at = null, started_at = null, available_at = now(), updated_at = now()
  where claimed_by = p_worker and status in ('claimed', 'running');
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------- 2. fila: escritório suspenso e bot pausado valem para as duas entregas do Dock ----------
create or replace function public.claim_next_job(p_worker_id text, p_capabilities text[], p_agent_id text default null, p_lease_seconds int default 600)
returns setof public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  v_owner text;
begin
  perform public.reap_expired_leases();
  select w.owner_team_id into v_owner from public.workers w where w.id = p_worker_id;

  update public.ai_jobs j set
    status = 'claimed', claimed_by = p_worker_id, claimed_at = now(), started_at = null,
    lease_id = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds)),
    attempt_count = j.attempt_count + 1, updated_at = now()
  where j.id = (
    select c.id from public.ai_jobs c
    where c.status in ('queued', 'retry_scheduled') and c.available_at <= now()
      and (p_agent_id is null or c.agent_id = p_agent_id)
      and c.required_capabilities <@ coalesce(p_capabilities, '{}')
      and c.owner_team_id is not distinct from v_owner
      -- escritório suspenso por um founder: nada do Dock sai da fila
      and (c.owner_team_id is null or not exists (select 1 from public.office o where o.owner_team_id = c.owner_team_id and o.suspended_at is not null))
      and (c.job_type not in ('office_reply', 'office_action')
           or not exists (select 1 from public.office_agents a where a.id = c.agent_id and a.paused))
      and (c.job_type <> 'office_reply' or (
        (select count(*) from public.ai_jobs x
             where x.owner_team_id = c.owner_team_id and x.agent_id = c.agent_id and x.status in ('claimed', 'running')) < 2
        and not exists (select 1 from public.ai_jobs x
             where x.owner_team_id = c.owner_team_id and x.job_type = 'office_reply' and x.entity_id = c.entity_id
               and x.status in ('claimed', 'running'))
      ))
    order by c.priority desc, c.available_at, c.created_at
    for update skip locked
    limit 1
  )
  returning j.* into r;

  update public.workers set last_seen_at = now(),
    last_job_at = case when r.id is not null then now() else last_job_at end,
    idle_since = case when r.id is not null then null else coalesce(idle_since, now()) end
  where id = p_worker_id;

  if r.id is null then return; end if;
  perform private.job_event(r, 'job.claimed', 'agent', p_worker_id, jsonb_build_object('lease_expires_at', r.lease_expires_at));
  return next r;
end;
$$;

-- ---------- 3. funções do motor (servidor) ----------
-- Confere lease, PC ligado e mesmo dono. Toda função do motor começa por aqui.
create or replace function private.office_engine_job(p_worker_id text, p_job_public_id text, p_lease_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  r := private.lock_leased(p_job_public_id, p_lease_id);
  if r.owner_team_id is null or r.job_type not in ('office_reply', 'office_action') or r.claimed_by is distinct from p_worker_id then
    raise exception 'office_job_mismatch' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workers w where w.id = p_worker_id and w.enabled and w.owner_team_id = r.owner_team_id) then
    raise exception 'office_worker_mismatch' using errcode = '42501';
  end if;
  return r;
end;
$$;

-- A mesma conferência, para a rota chamar antes das funções da 0027 que só recebem o lease
-- (office_post_agent_message, office_take_approval, office_finish_action).
create or replace function public.office_engine_check(p_worker_id text, p_job_public_id text, p_lease_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  r := private.office_engine_job(p_worker_id, p_job_public_id, p_lease_id);
  return r.job_type;
end;
$$;

-- Origem do pedido, calculada pelo servidor (a mesma regra do porteiro, office_request_action).
create or replace function private.office_job_origin(r public.ai_jobs)
returns text
language sql
stable
set search_path = ''
as $$
  select case when r.parent_job_id is not null then 'bot'
              when r.payload ->> 'origin' = 'rotina' then 'rotina'
              else 'humano' end;
$$;

-- Tudo o que o motor precisa para a entrega (office-delivery/v1, nota 42 F5.2 §1).
-- O que o bot não pode usar não vem: skill fora do nível ou da área, skill com script (primeira leva),
-- conector fora do catálogo, não instalado ou acima do nível.
create or replace function public.office_delivery(p_worker_id text, p_job_public_id text, p_lease_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  a public.office_agents;
  t public.office_threads;
  v_level int;
  v_trigger text;
begin
  r := private.office_engine_job(p_worker_id, p_job_public_id, p_lease_id);
  select * into a from public.office_agents x where x.id = r.agent_id and x.owner_team_id = r.owner_team_id;
  if a.id is null then raise exception 'office_agent_not_found'; end if;
  select * into t from public.office_threads x where x.id = r.entity_id and x.owner_team_id = r.owner_team_id;
  -- teto da primeira leva vale também aqui, mesmo que o banco tenha um nível maior por engano
  v_level := least(a.access_level, private.office_limit('nivel_maximo'));
  v_trigger := r.payload ->> 'message_id';

  return jsonb_build_object(
    'schema', 'office-delivery/v1',
    'job', jsonb_build_object('public_id', r.public_id, 'lease_id', r.lease_id, 'type', r.job_type,
                              'origin', private.office_job_origin(r), 'attempt', r.attempt_count,
                              'approval_id', r.payload ->> 'approval_id', 'trigger_message_id', v_trigger),
    'owner_team_id', r.owner_team_id,
    'agent', jsonb_build_object('id', a.id, 'name', a.name, 'title', a.title, 'access_level', v_level,
                                'instructions', a.instructions, 'effort', a.effort, 'paused', a.paused),
    'thread', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'kind', t.kind, 'title', t.title, 'continued_from', t.continued_from_thread_id,
      'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author_type', m.author_type, 'author_id', m.author_id,
                                                                'kind', m.kind, 'body', m.body, 'created_at', m.created_at,
                                                                'is_trigger', m.id = v_trigger) order by m.created_at, m.id)
                            from (select * from public.office_messages m0 where m0.thread_id = t.id and m0.kind <> 'progresso'
                                  order by m0.created_at desc, m0.id desc limit 40) m), '[]'::jsonb),
      -- histórico da conversa de origem ("continuar com outro bot"): vai como informação, nunca como pedido
      'continued_messages', case when t.continued_from_thread_id is null then '[]'::jsonb else coalesce(
        (select jsonb_agg(jsonb_build_object('author_type', m.author_type, 'body', m.body) order by m.created_at, m.id)
         from (select * from public.office_messages m0 where m0.thread_id = t.continued_from_thread_id
                 and m0.owner_team_id = r.owner_team_id and m0.kind <> 'progresso'
               order by m0.created_at desc, m0.id desc limit 20) m), '[]'::jsonb) end
    ) end,
    -- ordem de uso: troca feita na conversa, a IA do bot, depois as reservas (nota 42 F5.2 §7)
    'ia', coalesce((
      select jsonb_agg(jsonb_build_object('connection_id', c.id, 'kind', c.kind, 'provider', c.provider, 'label', c.label,
                                          'status', c.status, 'quota_resets_at', c.quota_resets_at, 'endpoint', c.endpoint,
                                          'model', l.model, 'why', l.why,
                                          'data_class', private.office_data_class(c.kind, c.provider)) order by l.ord)
      from (
        select tm.connection_id, tm.model, 'conversa'::text why, 0 ord from public.office_thread_models tm
          where tm.thread_id = r.entity_id and tm.agent_id = a.id
        union all
        select a.connection_id, a.model, 'bot', 1 where a.connection_id is not null
        union all
        select b.value ->> 'connection_id', b.value ->> 'model', 'reserva ' || b.ordinality, 1 + b.ordinality
          from jsonb_array_elements(a.backup_models) with ordinality b
      ) l
      join public.office_connections c on c.id = l.connection_id and c.owner_team_id = r.owner_team_id), '[]'::jsonb),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'version', v.version, 'label', v.label, 'sha256', v.content_sha256,
                                          'min_level', v.min_level, 'has_scripts', v.has_scripts,
                                          'name', s.name, 'description', s.description) order by s.name)
      from public.office_agent_skills i
      join public.dock_skills s on s.id = i.skill_id
      join public.dock_skill_versions v on v.skill_id = s.id and v.version = private.office_skill_version_for(a.id, s.id)
      where i.agent_id = a.id and v.min_level <= v_level
        and (not v.has_scripts or private.office_limit('scripts_liberados') = 1)), '[]'::jsonb),
    'connectors', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'runs_at', c.runs_at, 'transport', c.transport,
                                          'server_host', c.server_host, 'tools_sha256', c.tools_sha256, 'read_only', i.read_only,
                                          'min_level', c.min_level,
                                          'actions', coalesce((select jsonb_agg(jsonb_build_object('key', x.action_key, 'tool', x.tool_name,
                                                                  'label', x.label, 'class', x.action_class, 'max_items', x.max_items) order by x.action_key)
                                                               from public.dock_connector_actions x where x.connector_id = c.id and x.enabled), '[]'::jsonb))
                       order by c.id)
      from public.office_agent_connectors i
      join public.dock_connectors c on c.id = i.connector_id
      where i.agent_id = a.id and c.status = 'aprovado' and c.wave between 1 and 1 and c.min_level <= v_level), '[]'::jsonb)
  );
end;
$$;

-- Corpo da skill (hzk-skill/v1). Só a versão que a entrega usa. files_text é o texto exato que entrou
-- no hash: o motor confere sha256(body + "\n" + files_text) sem precisar imitar o formato do jsonb.
create or replace function public.office_skill_package(p_worker_id text, p_job_public_id text, p_lease_id uuid, p_skill text, p_version int)
returns table (skill_id text, version int, label text, name text, area text, body text, files_text text,
               examples jsonb, min_level int, required_connectors text[], has_scripts boolean, sha256 text)
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  r := private.office_engine_job(p_worker_id, p_job_public_id, p_lease_id);
  if private.office_skill_version_for(r.agent_id, p_skill) is distinct from p_version then raise exception 'office_skill_not_delivered'; end if;
  return query
    select v.skill_id, v.version, v.label, s.name, s.area_id, v.body, v.files::text, v.examples, v.min_level::int,
           v.required_connectors, v.has_scripts, v.content_sha256
    from public.dock_skill_versions v join public.dock_skills s on s.id = v.skill_id
    where v.skill_id = p_skill and v.version = p_version
      and v.min_level <= least((select a.access_level from public.office_agents a where a.id = r.agent_id), private.office_limit('nivel_maximo'))
      and (not v.has_scripts or private.office_limit('scripts_liberados') = 1);
  if not found then raise exception 'office_skill_not_delivered'; end if;
end;
$$;

-- O motor relata o estado de uma IA da entrega: conectada, sem_cota (com quando volta) ou erro.
create or replace function public.office_report_connection(
  p_worker_id text, p_job_public_id text, p_lease_id uuid, p_connection text, p_status text, p_resets_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  r := private.office_engine_job(p_worker_id, p_job_public_id, p_lease_id);
  if p_status not in ('conectada', 'sem_cota', 'erro') then raise exception 'office_invalid_status'; end if;
  if r.job_type = 'office_reply' and not private.office_connection_allowed(r.agent_id, r.entity_id, p_connection) then
    raise exception 'office_connection_not_allowed' using errcode = '42501';
  end if;
  update public.office_connections set status = p_status, checked_at = now(),
    quota_resets_at = case when p_status = 'sem_cota' then coalesce(p_resets_at, now() + interval '1 hour') else null end
  where id = p_connection and owner_team_id = r.owner_team_id and status <> 'desligada';
end;
$$;

-- Uso da entrega (só o dono vê, tabela da 0026). Uma linha por entrega.
create or replace function public.office_record_usage(
  p_worker_id text, p_job_public_id text, p_lease_id uuid, p_connection text, p_model text,
  p_input_tokens int, p_output_tokens int, p_duration_ms int, p_fallback_from text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.ai_jobs;
  c public.office_connections;
begin
  r := private.office_engine_job(p_worker_id, p_job_public_id, p_lease_id);
  select * into c from public.office_connections x where x.id = p_connection and x.owner_team_id = r.owner_team_id;
  if c.id is null then raise exception 'office_connection_not_allowed' using errcode = '42501'; end if;
  insert into public.office_usage (owner_team_id, job_public_id, agent_id, connection_id, provider, model,
                                   input_tokens, output_tokens, duration_ms, free, fallback_from)
  values (r.owner_team_id, r.public_id, r.agent_id, c.id, c.provider, left(coalesce(nullif(p_model, ''), 'padrao'), 120),
          greatest(0, coalesce(p_input_tokens, 0)), greatest(0, coalesce(p_output_tokens, 0)), greatest(0, coalesce(p_duration_ms, 0)),
          c.kind = 'local', left(p_fallback_from, 120))
  on conflict (job_public_id) do update set input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens,
    duration_ms = excluded.duration_ms, model = excluded.model, connection_id = excluded.connection_id,
    provider = excluded.provider, free = excluded.free, fallback_from = excluded.fallback_from;
end;
$$;

-- ---------- 4. quem pode chamar o quê ----------
do $$
declare f text;
begin
  foreach f in array array['public.office_request_pc(text,text,text)', 'public.dock_decide_pc(text,boolean)', 'public.office_disable_pc(text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.office_delivery(text,text,uuid)',
    'public.office_engine_check(text,text,uuid)',
    'public.office_skill_package(text,text,uuid,text,int)',
    'public.office_report_connection(text,text,uuid,text,text,timestamptz)',
    'public.office_record_usage(text,text,uuid,text,text,int,int,int,text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['private.office_engine_job(text,text,uuid)', 'private.office_job_origin(public.ai_jobs)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;
