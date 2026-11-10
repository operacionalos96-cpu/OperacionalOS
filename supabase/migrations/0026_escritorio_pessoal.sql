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

create table if not exists public.office_agents (
  id              text primary key check (id ~ '^agt_[0-9A-HJKMNP-TV-Z]{26}$'),
  owner_team_id   text not null references public.office(owner_team_id),
  parent_agent_id text references public.office_agents(id),
  kind            text not null check (kind in ('co_lider', 'funcionario')),
  name            text not null check (char_length(name) between 1 and 60),
  title           text not null check (char_length(title) between 1 and 80),
  description     text not null default '' check (char_length(description) <= 2000),
  instructions    text not null default '' check (char_length(instructions) <= 32000),
  model           text check (char_length(model) <= 80),          -- null = padrão da assinatura logada na Ponte
  effort          text not null default 'medium' check (effort in ('low', 'medium', 'high', 'xhigh', 'max')),
  paused          boolean not null default false,
  version         int not null default 1,
  created_by      text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((kind = 'co_lider') = (parent_agent_id is null))      -- co-líder responde à dona; funcionário sempre tem chefe
);
create unique index if not exists office_one_co_lider on public.office_agents (owner_team_id) where kind = 'co_lider';
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

-- dono nos jobs e nos workers (null = da empresa, como sempre foi)
alter table public.ai_jobs add column if not exists owner_team_id text;
alter table public.workers add column if not exists owner_team_id text;
create index if not exists ai_jobs_owner_idx on public.ai_jobs (owner_team_id, status) where owner_team_id is not null;

-- ---------- 2. leitura: só o dono ----------
do $$
declare t text;
begin
  foreach t in array array['office', 'office_agents', 'office_agent_versions', 'office_threads', 'office_messages']
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
  foreach t in array array['office_agents', 'office_threads', 'office_messages']
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

-- Nível do agente no organograma: co-líder = 1, funcionário dele = 2, abaixo = 3.
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

-- Cria (p_id null) ou edita um agente. Travas: 20 agentes, 3 níveis, um co-líder, sem ciclo.
create or replace function public.office_upsert_agent(
  p_id text, p_kind text, p_parent text, p_name text, p_title text,
  p_description text default '', p_instructions text default '', p_model text default null, p_effort text default 'medium'
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

  if p_id is null then
    if (select count(*) from public.office_agents a where a.owner_team_id = v_me) >= 20 then raise exception 'office_limit_agents'; end if;
    if p_kind = 'co_lider' and exists (select 1 from public.office_agents a where a.owner_team_id = v_me and a.kind = 'co_lider') then
      raise exception 'office_one_co_lider';
    end if;
    if v_parent_depth + 1 > 3 then raise exception 'office_limit_depth'; end if;
    v_id := private.ulid('agt');
    insert into public.office_agents (id, owner_team_id, parent_agent_id, kind, name, title, description, instructions, model, effort, created_by)
    values (v_id, v_me, p_parent, p_kind, trim(p_name), trim(p_title), coalesce(p_description, ''), coalesce(p_instructions, ''),
            nullif(trim(coalesce(p_model, '')), ''), coalesce(p_effort, 'medium'), v_me);
    insert into public.office_agent_versions (agent_id, version, instructions, changed_by) values (v_id, 1, coalesce(p_instructions, ''), v_me);
    return v_id;
  end if;

  select * into v_old from public.office_agents a where a.id = p_id and a.owner_team_id = v_me for update;
  if v_old.id is null then raise exception 'office_agent_not_found'; end if;
  if p_kind is distinct from v_old.kind then raise exception 'office_kind_immutable'; end if;
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
    model = nullif(trim(coalesce(p_model, '')), ''), effort = coalesce(p_effort, 'medium'),
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

-- Conversa direta (1 agente) ou canal (2 a 20). Líder do canal: o informado, senão o co-líder, senão o primeiro.
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
    else coalesce((select a.id from public.office_agents a where a.id = any (v_ids) and a.kind = 'co_lider'), v_ids[1])
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

  foreach v_agent in array v_to
  loop
    insert into public.ai_jobs (public_id, job_type, agent_id, entity_type, entity_id, payload, idempotency_key, created_by,
                                required_capabilities, correlation_id, causation_id, owner_team_id)
    values (private.ulid('job'), 'office_reply', v_agent, 'office_thread', p_thread,
            jsonb_build_object('message_id', v_msg, 'thread_id', p_thread),
            'dlv:' || v_msg || ':' || v_agent, v_me, array['office_reply'], 'thr:' || p_thread, v_msg, v_me)
    on conflict (idempotency_key) do nothing;
    if found then v_n := v_n + 1; end if;
  end loop;

  return query select v_msg, true, v_n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.office_accept_consent(text)',
    'public.office_upsert_agent(text,text,text,text,text,text,text,text,text)',
    'public.office_set_agent_paused(text,boolean)',
    'public.office_open_thread(text,text[],text,text)',
    'public.office_send_message(text,text,text,text[],text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.office_require()', 'private.office_depth(text)', 'private.office_height(text)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
