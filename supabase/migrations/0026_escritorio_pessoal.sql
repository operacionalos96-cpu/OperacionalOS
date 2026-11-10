-- =====================================================================
-- OperacionalOS — Escritório pessoal, Etapa 1 (ADR 0022, docs/ESCRITORIO-PESSOAL.md)
-- Rodar depois do 0025 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Cada pessoa tem um escritório PRIVADO com a própria equipe de agentes: só o dono lê
-- (nem founder). O navegador não escreve direto nas tabelas: tudo passa pelas funções
-- office_* abaixo, que conferem dono, termo aceito, limites e idempotência.
--
-- As entregas (uma por agente destinatário) são jobs na fila que já existe (ai_jobs),
-- marcados com owner_team_id. Isso exige três ajustes na fila da empresa:
--   1. RLS: job pessoal só aparece para o dono (job sem dono continua para todos);
--   2. claim_next_job: worker só pega job do MESMO dono, e respeita os limites do escritório;
--   3. job_event: job pessoal não gera evento na tabela events (que todos leem).
-- Nenhum dado existente é alterado.
-- =====================================================================

-- ---------- 1. tabelas ----------
create table if not exists public.office (
  owner_team_id   text primary key check (char_length(owner_team_id) between 1 and 64),
  consent_version text check (char_length(consent_version) <= 40),
  consent_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- conexões de IA da pessoa. Só a descrição: a chave/login fica no PC (Ponte HZK) e NUNCA vem para cá.
create table if not exists public.office_connections (
  id              text primary key check (id ~ '^con_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id   text not null references public.office(owner_team_id),
  kind            text not null check (kind in ('local', 'chave', 'assinatura')),
  provider        text not null check (provider ~ '^[a-z][a-z0-9_]{1,30}$'),
  label           text not null check (char_length(label) between 1 and 60),
  status          text not null default 'pendente' check (status in ('pendente', 'conectada', 'sem_cota', 'erro', 'desligada')),
  models          jsonb not null default '[]'::jsonb check (jsonb_typeof(models) = 'array' and pg_column_size(models) < 64000), -- catálogo informado pela Ponte
  quota_resets_at timestamptz,                                    -- quando a cota volta (sem_cota)
  checked_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (owner_team_id, provider, label)
);
create index if not exists office_connections_owner_idx on public.office_connections (owner_team_id);

create table if not exists public.office_agents (
  id              text primary key check (id ~ '^agt_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id   text not null references public.office(owner_team_id),
  parent_agent_id text references public.office_agents(id),
  can_create_agents boolean not null default false,               -- a pessoa decide se este agente pode propor agentes novos
  name            text not null check (char_length(name) between 1 and 60),
  title           text not null check (char_length(title) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 2000),
  instructions    text not null default '' check (char_length(instructions) <= 32000),
  connection_id   text references public.office_connections(id),   -- null = ainda sem IA escolhida
  model           text check (char_length(model) <= 120),         -- null = padrão da conexão (ex.: o da assinatura)
  -- reservas em ordem, usadas quando a cota acaba: [{"connection_id": "con_…", "model": "…"}], no máximo 8
  backup_models   jsonb not null default '[]'::jsonb check (jsonb_typeof(backup_models) = 'array' and jsonb_array_length(backup_models) <= 8),
  capabilities    text[] not null default array['texto'] check (capabilities <@ array['texto', 'imagem', 'codigo', 'arquivo', 'web']),
  effort          text not null default 'medium' check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  paused          boolean not null default false,
  version         int not null default 1,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists office_agents_owner_idx on public.office_agents (owner_team_id);

create table if not exists public.office_agent_versions (
  agent_id     text not null references public.office_agents(id),
  version      int not null,
  instructions text not null,
  changed_by   text not null,
  changed_at   timestamptz not null default now(),
  primary key (agent_id, version)
);

create table if not exists public.office_threads (
  id            text primary key check (id ~ '^thr_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id text not null references public.office(owner_team_id),
  kind          text not null check (kind in ('direta', 'canal')),
  title         text not null default '' check (char_length(title) <= 120),
  agent_ids     text[] not null check (cardinality(agent_ids) between 1 and 20),
  lead_agent_id text not null,
  archived      boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists office_threads_owner_idx on public.office_threads (owner_team_id);

create table if not exists public.office_messages (
  id              text primary key check (id ~ '^msg_[0-9A-HJKMNP-TV-Z]{26}$'),
  thread_id       text not null references public.office_threads(id),
  owner_team_id   text not null,
  author_type     text not null check (author_type in ('human', 'agent', 'system')),
  author_id       text not null check (char_length(author_id) <= 64),
  kind            text not null default 'texto' check (kind in ('texto', 'relatorio', 'progresso', 'aviso')),
  body            text not null check (char_length(body) between 1 and 32000),
  report          jsonb check (report is null or (jsonb_typeof(report) = 'object' and pg_column_size(report) < 32000)),
  reply_to        text,
  idempotency_key text unique check (char_length(idempotency_key) <= 100),
  created_at      timestamptz not null default now()
);
create index if not exists office_messages_thread_idx on public.office_messages (thread_id, created_at);

-- tarefas: o pedido e a árvore de subtarefas (um agente pode dividir; cada subtarefa tem um responsável)
create table if not exists public.office_tasks (
  id                text primary key check (id ~ '^tsk_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id     text not null references public.office(owner_team_id),
  parent_task_id    text references public.office_tasks(id),
  root_task_id      text not null,                                  -- o pedido original (= id quando é raiz)
  title             text not null check (char_length(title) between 1 and 160),
  brief             text not null default '' check (char_length(brief) <= 32000),
  assigned_agent_id text references public.office_agents(id),
  thread_id         text references public.office_threads(id),
  status            text not null default 'aberta' check (status in ('aberta', 'em_andamento', 'aguardando', 'bloqueada', 'concluida', 'cancelada', 'falhou')),
  result_summary    text check (char_length(result_summary) <= 4000),
  created_by        text not null,                                  -- team_id da pessoa ou id do agente que dividiu
  due_at            timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index if not exists office_tasks_owner_idx on public.office_tasks (owner_team_id, status);
create index if not exists office_tasks_root_idx on public.office_tasks (root_task_id);

-- uso por entrega (só a pessoa vê): gravado pelo servidor quando a Ponte conclui (Etapa 2)
create table if not exists public.office_usage (
  id             bigint generated always as identity primary key,
  owner_team_id  text not null references public.office(owner_team_id),
  job_public_id  text not null unique,
  agent_id       text not null,
  connection_id  text,
  provider       text not null,
  model          text not null,
  input_tokens   int not null default 0 check (input_tokens >= 0),
  output_tokens  int not null default 0 check (output_tokens >= 0),
  duration_ms    int not null default 0 check (duration_ms >= 0),
  free           boolean not null default true,                     -- grátis (local/cota) ou dentro do plano
  cost_usd       numeric(12, 6) check (cost_usd is null or cost_usd >= 0), -- estimativa; null = sem preço conhecido
  fallback_from  text,                                              -- modelo que estava sem cota, quando trocou para a reserva
  created_at     timestamptz not null default now()
);
create index if not exists office_usage_owner_idx on public.office_usage (owner_team_id, created_at desc);

-- dono nos jobs e nos workers (null = da empresa, como sempre foi)
alter table public.ai_jobs add column if not exists owner_team_id text;
alter table public.ai_jobs add column if not exists office_task_id text;   -- tarefa do escritório que esta entrega atende
alter table public.workers add column if not exists owner_team_id text;
create index if not exists ai_jobs_owner_idx on public.ai_jobs (owner_team_id, status) where owner_team_id is not null;

-- ---------- 2. leitura: só o dono ----------
do $$
declare t text;
begin
  foreach t in array array['office', 'office_connections', 'office_agents', 'office_agent_versions', 'office_threads', 'office_messages', 'office_tasks', 'office_usage']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end;
$$;

drop policy if exists "dono le" on public.office;
create policy "dono le" on public.office for select to authenticated using (owner_team_id = (select private.my_team_id()));
drop policy if exists "dono le" on public.office_agents;
create policy "dono le" on public.office_agents for select to authenticated using (owner_team_id = (select private.my_team_id()));
drop policy if exists "dono le" on public.office_agent_versions;
create policy "dono le" on public.office_agent_versions for select to authenticated
  using (exists (select 1 from public.office_agents a where a.id = agent_id and a.owner_team_id = (select private.my_team_id())));
drop policy if exists "dono le" on public.office_threads;
create policy "dono le" on public.office_threads for select to authenticated using (owner_team_id = (select private.my_team_id()));
drop policy if exists "dono le" on public.office_messages;
create policy "dono le" on public.office_messages for select to authenticated using (owner_team_id = (select private.my_team_id()));
drop policy if exists "dono le" on public.office_connections;
create policy "dono le" on public.office_connections for select to authenticated using (owner_team_id = (select private.my_team_id()));
drop policy if exists "dono le" on public.office_tasks;
create policy "dono le" on public.office_tasks for select to authenticated using (owner_team_id = (select private.my_team_id()));
drop policy if exists "dono le" on public.office_usage;
create policy "dono le" on public.office_usage for select to authenticated using (owner_team_id = (select private.my_team_id()));

-- fila: job da empresa para os membros; job pessoal só para o dono
drop policy if exists "membros leem jobs" on public.ai_jobs;
create policy "membros leem jobs" on public.ai_jobs for select to authenticated
  using ((owner_team_id is null and (select private.is_member())) or owner_team_id = (select private.my_team_id()));

-- workers: os da empresa para os membros; a Ponte pessoal só para o dono (o hash do token continua fora do grant)
grant select (owner_team_id) on public.workers to authenticated;
drop policy if exists "membros leem workers" on public.workers;
create policy "membros leem workers" on public.workers for select to authenticated
  using ((owner_team_id is null and (select private.is_member())) or owner_team_id = (select private.my_team_id()));

-- tempo real (a RLS vale também no Realtime)
do $$
declare t text;
begin
  foreach t in array array['office_agents', 'office_threads', 'office_messages', 'office_connections', 'office_tasks']
  loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------- 3. fila da empresa: isolamento por dono ----------
-- Job pessoal não vai para a tabela events (todos leem): a timeline da empresa não mostra bastidores.
create or replace function private.job_event(p_job public.ai_jobs, p_type text, p_actor_type text, p_actor_id text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_job.owner_team_id is not null then return; end if;
  insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata, correlation_id, causation_id)
  values (private.ulid('evt'), p_type, 'job', p_job.public_id, p_actor_type, left(p_actor_id, 80),
          jsonb_build_object('job_type', p_job.job_type, 'agent_id', p_job.agent_id, 'status', p_job.status,
                             'attempt', p_job.attempt_count, 'entity_type', p_job.entity_type, 'entity_id', p_job.entity_id) || coalesce(p_meta, '{}'::jsonb),
          p_job.correlation_id, p_job.public_id);
end;
$$;

-- CLAIM: igual ao 0011, mais (a) só jobs do mesmo dono do worker e (b) limites do escritório:
-- agente pausado não recebe, no máximo 2 em execução por agente, uma mensagem por vez por conversa.
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
      and (c.job_type <> 'office_reply' or (
        not exists (select 1 from public.office_agents a where a.id = c.agent_id and a.paused)
        and (select count(*) from public.ai_jobs x
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

-- ---------- 4. funções do escritório (o navegador só escreve por elas) ----------
-- Dono logado com termo aceito; senão, erro com código legível.
create or replace function private.office_require()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null then raise exception 'office_not_member'; end if;
  if not exists (select 1 from public.office o where o.owner_team_id = v_me and o.consent_at is not null) then
    raise exception 'office_consent_required';
  end if;
  return v_me;
end;
$$;

-- Nível do agente no organograma: sem chefe = 1, abaixo dele = 2, abaixo = 3.
-- Não há papel fixo: nome, instruções e quem responde a quem são escolhas da pessoa.
create or replace function private.office_depth(p_agent text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select id, parent_agent_id, 1 as d from public.office_agents where id = p_agent
    union all
    select a.id, a.parent_agent_id, up.d + 1 from public.office_agents a join up on a.id = up.parent_agent_id where up.d < 50
  )
  select max(d) from up;
$$;

-- Quantos níveis a subárvore do agente ocupa (ele mesmo = 1).
create or replace function private.office_height(p_agent text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with recursive down as (
    select id, 1 as h from public.office_agents where id = p_agent
    union all
    select a.id, down.h + 1 from public.office_agents a join down on a.parent_agent_id = down.id where down.h < 50
  )
  select max(h) from down;
$$;

create or replace function public.office_accept_consent(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.my_team_id();
begin
  if v_me is null then raise exception 'office_not_member'; end if;
  if p_version is null or char_length(p_version) not between 1 and 40 then raise exception 'office_invalid_version'; end if;
  insert into public.office (owner_team_id, consent_version, consent_at) values (v_me, p_version, now())
  on conflict (owner_team_id) do update set consent_version = excluded.consent_version, consent_at = excluded.consent_at;
end;
$$;

-- Reservas válidas: no máximo 8, cada uma {"connection_id": <conexão do próprio dono>, "model": texto}.
create or replace function private.office_check_backups(p_owner text, p_backups jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare b jsonb;
begin
  if p_backups is null then return; end if;
  if jsonb_typeof(p_backups) <> 'array' or jsonb_array_length(p_backups) > 8 then raise exception 'office_invalid_backups'; end if;
  for b in select * from jsonb_array_elements(p_backups)
  loop
    if jsonb_typeof(b) <> 'object' or coalesce(jsonb_typeof(b -> 'model'), '') <> 'string' or char_length(b ->> 'model') not between 1 and 120
       or not exists (select 1 from public.office_connections c where c.id = b ->> 'connection_id' and c.owner_team_id = p_owner) then
      raise exception 'office_invalid_backups';
    end if;
  end loop;
end;
$$;

-- Cria (p_id null) ou edita um agente. Travas: 20 agentes, 3 níveis, sem ciclo;
-- a conexão e as reservas precisam ser do próprio dono.
create or replace function public.office_upsert_agent(
  p_id text, p_parent text, p_name text, p_title text,
  p_description text default '', p_instructions text default '', p_model text default null, p_effort text default 'medium',
  p_connection_id text default null, p_backup_models jsonb default '[]'::jsonb, p_capabilities text[] default array['texto'],
  p_can_create_agents boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_old public.office_agents;
  v_id text;
  v_parent_depth int := 0;
begin
  if p_parent is not null then
    if not exists (select 1 from public.office_agents a where a.id = p_parent and a.owner_team_id = v_me) then
      raise exception 'office_parent_not_found';
    end if;
    v_parent_depth := private.office_depth(p_parent);
  end if;
  if p_connection_id is not null and not exists (select 1 from public.office_connections c where c.id = p_connection_id and c.owner_team_id = v_me) then
    raise exception 'office_connection_not_found';
  end if;
  perform private.office_check_backups(v_me, p_backup_models);

  if p_id is null then
    if (select count(*) from public.office_agents a where a.owner_team_id = v_me) >= 20 then raise exception 'office_limit_agents'; end if;
    if v_parent_depth + 1 > 3 then raise exception 'office_limit_depth'; end if;
    v_id := private.ulid('agt');
    insert into public.office_agents (id, owner_team_id, parent_agent_id, name, title, description, instructions,
                                      connection_id, model, backup_models, capabilities, effort, can_create_agents, created_by)
    values (v_id, v_me, p_parent, trim(p_name), trim(p_title), coalesce(p_description, ''), coalesce(p_instructions, ''),
            p_connection_id, nullif(trim(coalesce(p_model, '')), ''), coalesce(p_backup_models, '[]'::jsonb),
            coalesce(p_capabilities, array['texto']), coalesce(p_effort, 'medium'), coalesce(p_can_create_agents, false), v_me);
    insert into public.office_agent_versions (agent_id, version, instructions, changed_by) values (v_id, 1, coalesce(p_instructions, ''), v_me);
    return v_id;
  end if;

  select * into v_old from public.office_agents a where a.id = p_id and a.owner_team_id = v_me for update;
  if v_old.id is null then raise exception 'office_agent_not_found'; end if;
  if p_parent is not null and (
       p_parent = p_id
       or exists (with recursive down as (
                    select id from public.office_agents where parent_agent_id = p_id
                    union all
                    select a.id from public.office_agents a join down on a.parent_agent_id = down.id)
                  select 1 from down where id = p_parent)) then
    raise exception 'office_cycle';
  end if;
  if v_parent_depth + private.office_height(p_id) > 3 then raise exception 'office_limit_depth'; end if;

  update public.office_agents set
    parent_agent_id = p_parent, name = trim(p_name), title = trim(p_title),
    description = coalesce(p_description, ''), instructions = coalesce(p_instructions, ''),
    connection_id = p_connection_id, model = nullif(trim(coalesce(p_model, '')), ''),
    backup_models = coalesce(p_backup_models, '[]'::jsonb), capabilities = coalesce(p_capabilities, array['texto']),
    effort = coalesce(p_effort, 'medium'), can_create_agents = coalesce(p_can_create_agents, false),
    version = case when coalesce(p_instructions, '') is distinct from v_old.instructions then v_old.version + 1 else v_old.version end,
    updated_at = now()
  where id = p_id;
  if coalesce(p_instructions, '') is distinct from v_old.instructions then
    insert into public.office_agent_versions (agent_id, version, instructions, changed_by) values (p_id, v_old.version + 1, coalesce(p_instructions, ''), v_me);
  end if;
  return p_id;
end;
$$;

create or replace function public.office_set_agent_paused(p_agent text, p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  update public.office_agents set paused = coalesce(p_paused, false), updated_at = now()
  where id = p_agent and owner_team_id = v_me;
  if not found then raise exception 'office_agent_not_found'; end if;
end;
$$;

-- Conexão de IA: só a descrição. A Ponte HZK (Etapa 2) guarda a chave/login no PC e informa o estado.
create or replace function public.office_upsert_connection(p_id text, p_kind text, p_provider text, p_label text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_id text;
begin
  if p_id is null then
    if (select count(*) from public.office_connections c where c.owner_team_id = v_me) >= 30 then raise exception 'office_limit_connections'; end if;
    v_id := private.ulid('con');
    insert into public.office_connections (id, owner_team_id, kind, provider, label) values (v_id, v_me, p_kind, lower(trim(p_provider)), trim(p_label));
    return v_id;
  end if;
  update public.office_connections set label = trim(p_label) where id = p_id and owner_team_id = v_me;
  if not found then raise exception 'office_connection_not_found'; end if;
  return p_id;
end;
$$;

-- Desligar uma conexão: os agentes que a usam passam para a reserva (ou esperam) até religar.
create or replace function public.office_set_connection_enabled(p_id text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_me text := private.office_require();
begin
  update public.office_connections set status = case when coalesce(p_enabled, false) then 'pendente' else 'desligada' end
  where id = p_id and owner_team_id = v_me;
  if not found then raise exception 'office_connection_not_found'; end if;
end;
$$;

-- Conversa direta (1 agente) ou canal (2 a 20). Líder do canal (quem recebe sem menção): o informado, senão o primeiro.
create or replace function public.office_open_thread(p_kind text, p_agent_ids text[], p_title text default '', p_lead text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_ids text[] := array(select distinct unnest(coalesce(p_agent_ids, '{}')));
  v_lead text;
  v_id text;
begin
  if p_kind = 'direta' and cardinality(v_ids) <> 1 then raise exception 'office_direct_needs_one'; end if;
  if p_kind = 'canal' and cardinality(v_ids) not between 2 and 20 then raise exception 'office_channel_size'; end if;
  if (select count(*) from public.office_agents a where a.owner_team_id = v_me and a.id = any (v_ids)) <> cardinality(v_ids) then
    raise exception 'office_agent_not_found';
  end if;
  v_lead := case
    when p_lead is not null and p_lead = any (v_ids) then p_lead
    else v_ids[1]
  end;
  v_id := private.ulid('thr');
  insert into public.office_threads (id, owner_team_id, kind, title, agent_ids, lead_agent_id)
  values (v_id, v_me, p_kind, left(trim(coalesce(p_title, '')), 120), v_ids, v_lead);
  return v_id;
end;
$$;

-- Mensagem da dona → uma entrega (job office_reply) por destinatário, numa transação.
-- Destinatário: mencionados → quem escreveu a mensagem respondida → único agente → líder.
-- Mesma idempotency_key = a mesma mensagem: não duplica nem cria entregas de novo.
create or replace function public.office_send_message(
  p_thread text, p_body text, p_idempotency_key text, p_mentions text[] default '{}', p_reply_to text default null
)
returns table (message_id text, created boolean, deliveries int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_thread public.office_threads;
  v_msg text;
  v_to text[];
  v_reply_author text;
  v_agent text;
  v_task text;
  v_n int := 0;
begin
  select * into v_thread from public.office_threads t where t.id = p_thread and t.owner_team_id = v_me;
  if v_thread.id is null then raise exception 'office_thread_not_found'; end if;
  if v_thread.archived then raise exception 'office_thread_archived'; end if;
  if p_body is null or char_length(trim(p_body)) = 0 or char_length(p_body) > 32000 then raise exception 'office_invalid_body'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 8 and 100 then raise exception 'office_invalid_key'; end if;

  select m.id into v_msg from public.office_messages m where m.idempotency_key = p_idempotency_key and m.owner_team_id = v_me;
  if v_msg is not null then
    return query select v_msg, false, 0;
    return;
  end if;

  v_msg := private.ulid('msg');
  insert into public.office_messages (id, thread_id, owner_team_id, author_type, author_id, kind, body, reply_to, idempotency_key)
  values (v_msg, p_thread, v_me, 'human', v_me, 'texto', p_body, p_reply_to, p_idempotency_key);

  v_to := array(select distinct x from unnest(coalesce(p_mentions, '{}')) x where x = any (v_thread.agent_ids));
  if cardinality(v_to) = 0 and p_reply_to is not null then
    select m.author_id into v_reply_author from public.office_messages m
    where m.id = p_reply_to and m.thread_id = p_thread and m.author_type = 'agent';
    if v_reply_author = any (v_thread.agent_ids) then v_to := array[v_reply_author]; end if;
  end if;
  if cardinality(v_to) = 0 then
    v_to := case when cardinality(v_thread.agent_ids) = 1 then v_thread.agent_ids else array[v_thread.lead_agent_id] end;
  end if;

  select t.id into v_task from public.office_tasks t where t.thread_id = p_thread and t.owner_team_id = v_me order by t.created_at limit 1;

  foreach v_agent in array v_to
  loop
    insert into public.ai_jobs (public_id, job_type, agent_id, entity_type, entity_id, payload, idempotency_key, created_by,
                                required_capabilities, correlation_id, causation_id, owner_team_id, office_task_id)
    values (private.ulid('job'), 'office_reply', v_agent, 'office_thread', p_thread,
            jsonb_build_object('message_id', v_msg, 'thread_id', p_thread, 'task_id', v_task),
            'dlv:' || v_msg || ':' || v_agent, v_me, array['office_reply'], 'thr:' || p_thread, v_msg, v_me, v_task)
    on conflict (idempotency_key) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;

  return query select v_msg, true, v_n;
end;
$$;

-- Nova tarefa da pessoa para um agente: cria a tarefa, uma conversa só dela
-- e a primeira mensagem, que vira a entrega ligada à tarefa. Mesma chave = a mesma tarefa (não duplica).
create or replace function public.office_create_task(
  p_title text, p_brief text, p_agent_id text, p_idempotency_key text, p_due_at timestamptz default null
)
returns table (task_id text, thread_id text, message_id text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me text := private.office_require();
  v_task text;
  v_thread text;
  v_msg text;
begin
  if p_title is null or char_length(trim(p_title)) not between 1 and 160 then raise exception 'office_invalid_title'; end if;
  if not exists (select 1 from public.office_agents a where a.id = p_agent_id and a.owner_team_id = v_me) then
    raise exception 'office_agent_not_found';
  end if;
  select t.id, t.thread_id, m.id into v_task, v_thread, v_msg
  from public.office_messages m join public.office_tasks t on t.thread_id = m.thread_id
  where m.idempotency_key = p_idempotency_key and m.owner_team_id = v_me limit 1;
  if v_task is not null then
    return query select v_task, v_thread, v_msg, false;
    return;
  end if;

  v_thread := public.office_open_thread('direta', array[p_agent_id], p_title);
  v_task := private.ulid('tsk');
  insert into public.office_tasks (id, owner_team_id, root_task_id, title, brief, assigned_agent_id, thread_id, created_by, due_at)
  values (v_task, v_me, v_task, trim(p_title), coalesce(p_brief, ''), p_agent_id, v_thread, v_me, p_due_at);
  select s.message_id into v_msg
  from public.office_send_message(v_thread, coalesce(nullif(trim(coalesce(p_brief, '')), ''), trim(p_title)), p_idempotency_key) s;
  return query select v_task, v_thread, v_msg, true;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.office_accept_consent(text)',
    'public.office_upsert_agent(text,text,text,text,text,text,text,text,text,jsonb,text[],boolean)',
    'public.office_upsert_connection(text,text,text,text)',
    'public.office_set_connection_enabled(text,boolean)',
    'public.office_create_task(text,text,text,text,timestamptz)',
    'public.office_set_agent_paused(text,boolean)',
    'public.office_open_thread(text,text[],text,text)',
    'public.office_send_message(text,text,text,text[],text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.office_require()', 'private.office_depth(text)', 'private.office_height(text)', 'private.office_check_backups(text,jsonb)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
