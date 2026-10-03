-- =====================================================================
-- Operacional OS — camada de execução do AI Office
-- Rodar depois do 0010 (SQL Editor → New query → colar → Run). Pode rodar de novo.
-- Só ADICIONA (tabelas, colunas, funções). Nada existente é apagado.
--
-- • ai_jobs: fila central. idempotency_key ÚNICA no banco (trabalho repetido não duplica).
-- • claim atômico (FOR UPDATE SKIP LOCKED) + lease: complete/fail exigem job + lease válido.
-- • workers: quem executa (capabilities, escopos, token só como hash, heartbeat).
-- • webhooks / webhook_deliveries / webhook_receipts: saída assinada com retry e
--   anti-duplicado; entrada com anti-replay (event_id único).
-- • gatilho em events: evento → job (regras) e evento → entregas de webhook.
-- • Escrita só pelo servidor (funções liberadas apenas para service_role);
--   o navegador só LÊ (membros), e nunca vê token/segredo.
-- =====================================================================

-- ---------- IDs globais (ULID com prefixo) ----------
create or replace function private.ulid(p_prefix text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  rnd bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  out text := '';
  i int;
begin
  for i in 1..10 loop
    out := substr(alphabet, (ms % 32)::int + 1, 1) || out;
    ms := ms / 32;
  end loop;
  for i in 0..15 loop
    out := out || substr(alphabet, (get_byte(rnd, i) % 32) + 1, 1);
  end loop;
  return p_prefix || '_' || out;
end;
$$;

-- ---------- eventos: correlação e causa ----------
alter table public.events add column if not exists correlation_id text;
alter table public.events add column if not exists causation_id text;
create index if not exists events_correlation_idx on public.events (correlation_id, created_at);
-- tipos com prefixo job./webhook. e nomes com "_" continuam válidos pelo check existente.

-- ---------- configuração ajustável (polling, lease, backoff) ----------
create table if not exists public.ai_settings (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.ai_settings enable row level security;
revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;
drop policy if exists "membros leem config" on public.ai_settings;
create policy "membros leem config" on public.ai_settings for select to authenticated using ((select private.is_member()));

-- ---------- fila ----------
create table if not exists public.ai_jobs (
  id                    uuid primary key default gen_random_uuid(),
  public_id             text not null unique check (public_id ~ '^job_[0-9A-HJKMNP-TV-Z]{26}$'),
  job_type              text not null check (job_type ~ '^[a-z][a-z0-9_]{1,60}$'),
  agent_id              text not null,
  preferred_model       text,
  required_capabilities text[] not null default '{}',
  entity_type           text,
  entity_id             text,
  status                text not null default 'queued'
                        check (status in ('queued','claimed','running','completed','failed','retry_scheduled','cancelled','dead_letter')),
  priority              int not null default 50,
  payload               jsonb not null default '{}'::jsonb,
  result                jsonb,
  raw_result            jsonb,
  error                 text,
  created_at            timestamptz not null default now(),
  available_at          timestamptz not null default now(),
  claimed_at            timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  failed_at             timestamptz,
  first_failed_at       timestamptz,
  claimed_by            text,
  engine                text,
  lease_id              uuid,
  lease_expires_at      timestamptz,
  attempt_count         int not null default 0,
  max_attempts          int not null default 5 check (max_attempts between 1 and 50),
  idempotency_key       text unique,
  parent_job_id         uuid references public.ai_jobs(id),
  correlation_id        text,
  causation_id          text,
  created_by            text not null,
  updated_at            timestamptz not null default now()
);
create index if not exists ai_jobs_ready_idx on public.ai_jobs (priority desc, available_at, created_at) where status in ('queued','retry_scheduled');
create index if not exists ai_jobs_lease_idx on public.ai_jobs (lease_expires_at) where status in ('claimed','running');
create index if not exists ai_jobs_status_idx on public.ai_jobs (status, created_at desc);
create index if not exists ai_jobs_agent_idx on public.ai_jobs (agent_id, status);
create index if not exists ai_jobs_entity_idx on public.ai_jobs (entity_type, entity_id);
create index if not exists ai_jobs_correlation_idx on public.ai_jobs (correlation_id);

alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from anon, authenticated;
grant select on public.ai_jobs to authenticated;
drop policy if exists "membros leem jobs" on public.ai_jobs;
create policy "membros leem jobs" on public.ai_jobs for select to authenticated using ((select private.is_member()));

-- ---------- workers ----------
create table if not exists public.workers (
  id            text primary key check (id ~ '^wrk_[0-9A-HJKMNP-TV-Z]{26}$'),
  name          text not null check (char_length(name) between 1 and 80),
  agent_id      text,
  engine        text,
  capabilities  text[] not null default '{}',
  scopes        text[] not null default '{}',
  token_hash    text not null unique,
  token_hint    text,
  enabled       boolean not null default true,
  last_seen_at  timestamptz,
  last_job_at   timestamptz,
  idle_since    timestamptz,
  created_by    text,
  created_at    timestamptz not null default now()
);
alter table public.workers enable row level security;
revoke all on public.workers from anon, authenticated;
-- membros veem tudo MENOS o hash do token
grant select (id, name, agent_id, engine, capabilities, scopes, token_hint, enabled, last_seen_at, last_job_at, idle_since, created_by, created_at) on public.workers to authenticated;
drop policy if exists "membros leem workers" on public.workers;
create policy "membros leem workers" on public.workers for select to authenticated using ((select private.is_member()));

-- ---------- webhooks ----------
create table if not exists public.webhooks (
  id               text primary key check (id ~ '^wh_[0-9A-HJKMNP-TV-Z]{26}$'),
  name             text not null check (char_length(name) between 1 and 80),
  endpoint         text not null check (endpoint ~ '^https://' or endpoint ~ '^http://(localhost|127\.0\.0\.1)(:|/)'),
  secret_enc       text not null,
  secret_prev_enc  text,
  secret_hint      text,
  enabled          boolean not null default true,
  event_types      text[] not null default '{}',
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.webhooks enable row level security;
revoke all on public.webhooks from anon, authenticated;
-- segredos (mesmo criptografados) nunca vão para o navegador
grant select (id, name, endpoint, secret_hint, enabled, event_types, created_by, created_at, updated_at) on public.webhooks to authenticated;
drop policy if exists "membros leem webhooks" on public.webhooks;
create policy "membros leem webhooks" on public.webhooks for select to authenticated using ((select private.is_member()));

create table if not exists public.webhook_deliveries (
  id                    text primary key check (id ~ '^dlv_[0-9A-HJKMNP-TV-Z]{26}$'),
  webhook_id            text not null references public.webhooks(id) on delete cascade,
  event_id              text not null,
  status                text not null default 'pending'
                        check (status in ('pending','sending','delivered','retry_scheduled','dead_letter','cancelled')),
  attempt_count         int not null default 0,
  next_attempt_at       timestamptz not null default now(),
  last_attempt_at       timestamptz,
  first_failed_at       timestamptz,
  response_status       int,
  response_body_preview text,
  error                 text,
  created_at            timestamptz not null default now(),
  delivered_at          timestamptz,
  unique (webhook_id, event_id)
);
create index if not exists webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at) where status in ('pending','retry_scheduled','sending');
create index if not exists webhook_deliveries_hook_idx on public.webhook_deliveries (webhook_id, created_at desc);
alter table public.webhook_deliveries enable row level security;
revoke all on public.webhook_deliveries from anon, authenticated;
grant select on public.webhook_deliveries to authenticated;
drop policy if exists "membros leem entregas" on public.webhook_deliveries;
create policy "membros leem entregas" on public.webhook_deliveries for select to authenticated using ((select private.is_member()));

-- webhooks que CHEGAM: o mesmo event_id não é processado duas vezes (replay/duplicado)
create table if not exists public.webhook_receipts (
  source      text not null,
  event_id    text not null,
  received_at timestamptz not null default now(),
  primary key (source, event_id)
);
alter table public.webhook_receipts enable row level security;
revoke all on public.webhook_receipts from anon, authenticated;

-- ---------- tempo real (monitor ao vivo) ----------
do $$
declare t text;
begin
  foreach t in array array['ai_jobs', 'workers', 'webhook_deliveries'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- Funções (só o servidor chama: liberadas para service_role)
-- =====================================================================

-- Registra um evento de job (auditoria/timeline), com correlação e causa.
create or replace function private.job_event(p_job public.ai_jobs, p_type text, p_actor_type text, p_actor_id text, p_meta jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata, correlation_id, causation_id)
  values (private.ulid('evt'), p_type, 'job', p_job.public_id, p_actor_type, left(p_actor_id, 80),
          jsonb_build_object('job_type', p_job.job_type, 'agent_id', p_job.agent_id, 'status', p_job.status,
                             'attempt', p_job.attempt_count, 'entity_type', p_job.entity_type, 'entity_id', p_job.entity_id) || coalesce(p_meta, '{}'::jsonb),
          p_job.correlation_id, p_job.public_id);
$$;

-- Enfileira com idempotência. Já existe a mesma chave → devolve o existente (created = false).
create or replace function public.enqueue_job(
  p_job_type text, p_agent_id text, p_entity_type text, p_entity_id text, p_payload jsonb,
  p_idempotency_key text, p_created_by text, p_priority int default 50, p_max_attempts int default 5,
  p_required_capabilities text[] default '{}', p_preferred_model text default null,
  p_correlation_id text default null, p_causation_id text default null, p_parent_job_id uuid default null,
  p_available_at timestamptz default now()
)
returns table (job public.ai_jobs, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  insert into public.ai_jobs (public_id, job_type, agent_id, entity_type, entity_id, payload, idempotency_key, created_by,
                              priority, max_attempts, required_capabilities, preferred_model, correlation_id, causation_id,
                              parent_job_id, available_at)
  values (private.ulid('job'), p_job_type, p_agent_id, p_entity_type, p_entity_id, coalesce(p_payload, '{}'::jsonb),
          p_idempotency_key, p_created_by, p_priority, p_max_attempts, coalesce(p_required_capabilities, '{}'),
          p_preferred_model, p_correlation_id, p_causation_id, p_parent_job_id, p_available_at)
  on conflict (idempotency_key) do nothing
  returning * into r;
  if r.id is null then
    select * into r from public.ai_jobs where idempotency_key = p_idempotency_key;
    return query select r, false;
    return;
  end if;
  perform private.job_event(r, 'job.created', case when p_created_by like 'wrk_%' then 'agent' when p_created_by in ('system','trigger') then 'system' else 'human' end, p_created_by);
  return query select r, true;
end;
$$;

-- Recolhe leases vencidos: volta para a fila (ou dead_letter se esgotou tentativas).
create or replace function public.reap_expired_leases()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs; n int := 0;
begin
  for r in
    update public.ai_jobs j set
      status = case when j.attempt_count >= j.max_attempts then 'dead_letter' else 'queued' end,
      error = coalesce(j.error, 'lease expirou sem conclusão'),
      failed_at = case when j.attempt_count >= j.max_attempts then now() else j.failed_at end,
      first_failed_at = coalesce(j.first_failed_at, now()),
      lease_id = null, lease_expires_at = null, claimed_by = null,
      available_at = now(), updated_at = now()
    where j.id in (select id from public.ai_jobs where status in ('claimed','running') and lease_expires_at < now() for update skip locked)
    returning j.*
  loop
    perform private.job_event(r, 'job.lease_expired', 'system', 'reaper');
    if r.status = 'dead_letter' then perform private.job_event(r, 'job.dead_lettered', 'system', 'reaper'); end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- CLAIM ATÔMICO: um único UPDATE com SKIP LOCKED — dois workers nunca levam o mesmo job.
create or replace function public.claim_next_job(p_worker_id text, p_capabilities text[], p_agent_id text default null, p_lease_seconds int default 600)
returns setof public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  perform public.reap_expired_leases();
  update public.ai_jobs j set
    status = 'claimed', claimed_by = p_worker_id, claimed_at = now(), started_at = null,
    lease_id = gen_random_uuid(), lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds)),
    attempt_count = j.attempt_count + 1, updated_at = now()
  where j.id = (
    select id from public.ai_jobs
    where status in ('queued','retry_scheduled') and available_at <= now()
      and (p_agent_id is null or agent_id = p_agent_id)
      and required_capabilities <@ coalesce(p_capabilities, '{}')
    order by priority desc, available_at, created_at
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

-- Lease válido = mesmo lease_id, ainda dentro do prazo e job ativo.
create or replace function private.lock_leased(p_public_id text, p_lease_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  select * into r from public.ai_jobs where public_id = p_public_id for update;
  if r.id is null then raise exception 'job_not_found' using errcode = 'P0002'; end if;
  if r.lease_id is distinct from p_lease_id or r.status not in ('claimed','running') then raise exception 'lease_lost' using errcode = 'P0001'; end if;
  if r.lease_expires_at <= now() then raise exception 'lease_expired' using errcode = 'P0001'; end if;
  return r;
end;
$$;

create or replace function public.start_job(p_public_id text, p_lease_id uuid, p_engine text default null)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  perform private.lock_leased(p_public_id, p_lease_id);
  update public.ai_jobs set status = 'running', started_at = coalesce(started_at, now()), engine = coalesce(p_engine, engine), updated_at = now()
  where public_id = p_public_id returning * into r;
  perform private.job_event(r, 'job.started', 'agent', r.claimed_by, jsonb_build_object('engine', r.engine));
  return r;
end;
$$;

create or replace function public.renew_lease(p_public_id text, p_lease_id uuid, p_lease_seconds int default 600)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  perform private.lock_leased(p_public_id, p_lease_id);
  update public.ai_jobs set lease_expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds)), updated_at = now()
  where public_id = p_public_id returning * into r;
  update public.workers set last_seen_at = now() where id = r.claimed_by;
  return r;
end;
$$;

create or replace function public.report_progress(p_public_id text, p_lease_id uuid, p_message text, p_percent int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  r := private.lock_leased(p_public_id, p_lease_id);
  update public.workers set last_seen_at = now() where id = r.claimed_by;
  perform private.job_event(r, 'job.progress', 'agent', r.claimed_by, jsonb_build_object('message', left(coalesce(p_message, ''), 500), 'percent', p_percent));
end;
$$;

-- Aplica o resultado no domínio NA MESMA transação do complete (nada fica "completed" sem efeito).
create or replace function private.apply_job_result(r public.ai_jobs)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare h jsonb; hid text;
begin
  if r.job_type = 'analyze_website' and r.entity_type = 'lead' then
    update public.leads set data = data || jsonb_build_object('analysis', jsonb_strip_nulls(jsonb_build_object(
      'summary', r.result->'summary',
      'problems', r.result->'problems',
      'opportunity', (select string_agg(x, ' · ') from jsonb_array_elements_text(r.result->'opportunities') as x),
      'qualificationScore', r.result->'qualification_score',
      'siteScore', r.result->'site_score',
      'confidence', r.result->'confidence',
      'analyzedAt', to_jsonb(now()),
      'analyzedBy', to_jsonb(r.agent_id),
      'jobId', to_jsonb(r.public_id))))
    where id = r.entity_id;
    insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata, correlation_id, causation_id)
    values (private.ulid('evt'), 'lead.analyzed', 'lead', r.entity_id, 'agent', r.agent_id,
            jsonb_build_object('job_id', r.public_id, 'engine', r.engine, 'qualification_score', r.result->'qualification_score'),
            r.correlation_id, r.public_id);
  elsif r.job_type = 'analyze_human_feedback' then
    for h in select * from jsonb_array_elements(coalesce(r.result->'hypotheses', '[]'::jsonb)) loop
      hid := private.ulid('hyp');
      insert into public.hypotheses (id, data) values (hid, jsonb_build_object(
        'id', hid, 'title', h->>'title', 'description', coalesce(h->>'description', ''), 'evidence', coalesce(h->>'evidence', ''),
        'confidence', (h->>'confidence')::numeric, 'proposedTest', h->>'proposed_test', 'status', 'proposed',
        'createdBy', r.agent_id, 'createdAt', now(), 'jobId', r.public_id));
      insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata, correlation_id, causation_id)
      values (private.ulid('evt'), 'hypothesis.created', 'hypothesis', hid, 'agent', r.agent_id,
              jsonb_build_object('name', h->>'title', 'job_id', r.public_id), r.correlation_id, r.public_id);
    end loop;
  end if;
end;
$$;

-- Concluir: exige lease válido. Resultado gravado + efeito aplicado + evento, tudo junto.
create or replace function public.complete_job(p_public_id text, p_lease_id uuid, p_result jsonb, p_raw_result jsonb default null)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  perform private.lock_leased(p_public_id, p_lease_id);
  update public.ai_jobs set status = 'completed', result = p_result, raw_result = p_raw_result, error = null,
    completed_at = now(), lease_id = null, lease_expires_at = null, updated_at = now()
  where public_id = p_public_id returning * into r;
  perform private.apply_job_result(r);
  update public.workers set last_seen_at = now(), last_job_at = now() where id = r.claimed_by;
  perform private.job_event(r, 'job.completed', 'agent', r.claimed_by, jsonb_build_object('engine', r.engine));
  return r;
end;
$$;

-- Falhar: exige lease. O servidor decide retry (com backoff+jitter) ou dead_letter.
create or replace function public.fail_job(p_public_id text, p_lease_id uuid, p_error text, p_retry_at timestamptz default null)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  r := private.lock_leased(p_public_id, p_lease_id);
  update public.ai_jobs set
    status = case when p_retry_at is null or r.attempt_count >= r.max_attempts then 'dead_letter' else 'retry_scheduled' end,
    error = left(coalesce(p_error, 'erro sem mensagem'), 2000), failed_at = now(), first_failed_at = coalesce(first_failed_at, now()),
    available_at = coalesce(p_retry_at, now()), lease_id = null, lease_expires_at = null, updated_at = now()
  where public_id = p_public_id returning * into r;
  perform private.job_event(r, 'job.failed', 'agent', r.claimed_by, jsonb_build_object('error', left(r.error, 300), 'retry_at', r.available_at));
  if r.status = 'dead_letter' then perform private.job_event(r, 'job.dead_lettered', 'system', 'queue'); end if;
  return r;
end;
$$;

-- Devolver sem falhar (ex.: worker vai fechar): volta para a fila e não conta tentativa.
create or replace function public.release_job(p_public_id text, p_lease_id uuid)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  perform private.lock_leased(p_public_id, p_lease_id);
  update public.ai_jobs set status = 'queued', attempt_count = greatest(0, attempt_count - 1), claimed_by = null,
    lease_id = null, lease_expires_at = null, started_at = null, available_at = now(), updated_at = now()
  where public_id = p_public_id returning * into r;
  perform private.job_event(r, 'job.released', 'agent', coalesce(r.claimed_by, 'worker'));
  return r;
end;
$$;

-- Ações HUMANAS na dead letter / falhas.
create or replace function public.retry_job(p_public_id text, p_actor text)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  update public.ai_jobs set status = 'queued', attempt_count = 0, available_at = now(), error = null,
    lease_id = null, lease_expires_at = null, claimed_by = null, updated_at = now()
  where public_id = p_public_id and status in ('dead_letter','failed','cancelled','retry_scheduled')
  returning * into r;
  if r.id is null then raise exception 'job_not_retryable' using errcode = 'P0001'; end if;
  perform private.job_event(r, 'job.retried', 'human', p_actor);
  return r;
end;
$$;

create or replace function public.cancel_job(p_public_id text, p_actor text)
returns public.ai_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare r public.ai_jobs;
begin
  update public.ai_jobs set status = 'cancelled', lease_id = null, lease_expires_at = null, updated_at = now()
  where public_id = p_public_id and status not in ('completed','cancelled')
  returning * into r;
  if r.id is null then raise exception 'job_not_cancellable' using errcode = 'P0001'; end if;
  perform private.job_event(r, 'job.cancelled', 'human', p_actor);
  return r;
end;
$$;

-- Status da fila (barato, sem IA): quantos por status e quantos compatíveis com o worker.
create or replace function public.queue_status(p_capabilities text[] default null, p_agent_id text default null)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.ai_jobs group by status) s), '{}'::jsonb),
    'compatible_ready', (select count(*) from public.ai_jobs
       where status in ('queued','retry_scheduled') and available_at <= now()
         and (p_agent_id is null or agent_id = p_agent_id)
         and (p_capabilities is null or required_capabilities <@ p_capabilities)),
    'next_available_at', (select min(available_at) from public.ai_jobs where status in ('queued','retry_scheduled')
         and (p_agent_id is null or agent_id = p_agent_id) and (p_capabilities is null or required_capabilities <@ p_capabilities))
  );
$$;

-- ---------- webhooks de saída: pegar entregas devidas (atômico) e registrar resultado ----------
create or replace function public.claim_deliveries(p_limit int default 20)
returns table (delivery_id text, webhook_id text, event_id text, attempt_count int, endpoint text, secret_enc text,
               event_type text, entity_type text, entity_id text, actor_type text, actor_id text, metadata jsonb,
               correlation_id text, causation_id text, event_created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select d.id from public.webhook_deliveries d
    where (d.status in ('pending','retry_scheduled') and d.next_attempt_at <= now())
       or (d.status = 'sending' and d.last_attempt_at < now() - interval '5 minutes') -- runner morreu no meio
    order by d.next_attempt_at
    for update skip locked
    limit greatest(1, p_limit)
  ), upd as (
    update public.webhook_deliveries d set status = 'sending', attempt_count = d.attempt_count + 1, last_attempt_at = now()
    from due where d.id = due.id
    returning d.*
  )
  select u.id, u.webhook_id, u.event_id, u.attempt_count, w.endpoint, w.secret_enc,
         e.event_type, e.entity_type, e.entity_id, e.actor_type, e.actor_id, e.metadata, e.correlation_id, e.causation_id, e.created_at
  from upd u
  join public.webhooks w on w.id = u.webhook_id
  join public.events e on e.id = u.event_id;
$$;

create or replace function public.finish_delivery(p_id text, p_ok boolean, p_status int, p_preview text, p_error text, p_retry_at timestamptz default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_deliveries set
    status = case when p_ok then 'delivered' when p_retry_at is null then 'dead_letter' else 'retry_scheduled' end,
    response_status = p_status, response_body_preview = left(p_preview, 500), error = left(p_error, 1000),
    delivered_at = case when p_ok then now() else delivered_at end,
    first_failed_at = case when p_ok then first_failed_at else coalesce(first_failed_at, now()) end,
    next_attempt_at = coalesce(p_retry_at, next_attempt_at)
  where id = p_id and status = 'sending';
$$;

create or replace function public.retry_delivery(p_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_deliveries set status = 'pending', next_attempt_at = now(), attempt_count = 0, error = null
  where id = p_id and status in ('dead_letter','cancelled','retry_scheduled');
$$;

-- Webhook que CHEGA: true = primeira vez (processar); false = repetido (só confirmar).
create or replace function public.register_receipt(p_source text, p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.webhook_receipts (source, event_id) values (left(p_source, 60), left(p_event_id, 200));
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- =====================================================================
-- Gatilho: EVENTO → JOB (regras) e EVENTO → ENTREGAS DE WEBHOOK
-- =====================================================================
create or replace function private.on_event_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare corr text := coalesce(new.correlation_id, case when new.entity_type = 'lead' then 'lead:' || new.entity_id end);
begin
  -- Lead novo com site e ainda sem análise → analisar o site (uma vez por lead).
  if new.event_type = 'lead.created' and coalesce(new.metadata->>'website', '') <> '' and coalesce((new.metadata->>'hasAnalysis')::boolean, false) = false then
    perform public.enqueue_job('analyze_website', 'web-analyst', 'lead', new.entity_id,
      jsonb_build_object('website', new.metadata->>'website', 'name', new.metadata->>'name', 'segment', new.metadata->>'segment', 'city', new.metadata->>'city'),
      'analyze_website:' || new.entity_id || ':v1', 'trigger', 50, 5, array['web','mcp_write'], null, corr, new.id);
  end if;
  -- Humano descartou → Intelligence analisa o feedback (uma vez por decisão).
  if new.event_type = 'lead.rejected' then
    perform public.enqueue_job('analyze_human_feedback', 'intelligence', 'lead', new.entity_id, new.metadata,
      'analyze_human_feedback:' || new.id, 'trigger', 20, 3, array['reasoning','mcp_read'], null, corr, new.id);
  end if;
  -- Webhooks inscritos neste tipo (ou em "*") recebem uma entrega (uma por evento).
  insert into public.webhook_deliveries (id, webhook_id, event_id)
  select private.ulid('dlv'), w.id, new.id from public.webhooks w
  where w.enabled and (new.event_type = any (w.event_types) or '*' = any (w.event_types))
  on conflict (webhook_id, event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_event_inserted on public.events;
create trigger on_event_inserted after insert on public.events for each row execute function private.on_event_inserted();

-- ---------- permissões das funções: só o servidor ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.enqueue_job(text,text,text,text,jsonb,text,text,int,int,text[],text,text,text,uuid,timestamptz)',
    'public.reap_expired_leases()', 'public.claim_next_job(text,text[],text,int)',
    'public.start_job(text,uuid,text)', 'public.renew_lease(text,uuid,int)', 'public.report_progress(text,uuid,text,int)',
    'public.complete_job(text,uuid,jsonb,jsonb)', 'public.fail_job(text,uuid,text,timestamptz)', 'public.release_job(text,uuid)',
    'public.retry_job(text,text)', 'public.cancel_job(text,text)', 'public.queue_status(text[],text)',
    'public.claim_deliveries(int)', 'public.finish_delivery(text,boolean,int,text,text,timestamptz)',
    'public.retry_delivery(text)', 'public.register_receipt(text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
