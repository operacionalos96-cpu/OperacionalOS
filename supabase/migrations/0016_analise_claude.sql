-- =====================================================================
-- Operacional OS — os 3 pontos do vídeo vêm de uma análise com julgamento (Claude)
-- Rodar depois do 0015 (SQL Editor → New query → colar → Run). Pode rodar de novo.
--
-- Lead chega na etapa do vídeo → job analyze_for_video (agente Web Analyst = Claude da
-- assinatura, rodando como tarefa agendada no PC) → ele escreve os 3 pontos fortes (com o
-- trecho visível de cada um) → job render_prospect_video com esses pontos → vídeos prontos.
-- Status do lead: analisando → gerando → pronto → aprovado.
-- =====================================================================

create or replace function private.maybe_enqueue_video(p_lead_id text, p_cause text, p_corr text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb;
  cfg jsonb;
  steps jsonb;
  e jsonb;
  i int := 0;
  nvid int := 0;
  src text;
  p_first int;
  p_last int;
  s_idx int;
  s_when text;
  f jsonb;
  st int;
  last_sent timestamptz;
  replied timestamptz;
  ok boolean;
  vid jsonb;
  ver int;
  v_job text;
begin
  select data into d from public.leads where id = p_lead_id;
  if d is null then return; end if;

  select data into cfg from public.ai_settings where id = 'whatsapp_funnel';
  steps := cfg->'steps';
  if steps is null or jsonb_typeof(steps) <> 'array' then
    -- funil padrão do sistema: abertura, gancho, áudio, vídeo (diagnóstico), vídeo 2 (visão)
    steps := '[{"kind":"texto"},{"kind":"texto"},{"kind":"audio"},{"kind":"video"},{"kind":"video"}]'::jsonb;
  end if;

  -- passos com vídeo personalizado (primeiro e último)
  for e in select value from jsonb_array_elements(steps) loop
    if e->>'kind' = 'video' then
      src := coalesce(e->>'source', case nvid when 0 then 'diagnostico' when 1 then 'visao' else 'arquivo' end);
      nvid := nvid + 1;
      if src in ('diagnostico', 'visao') then
        p_first := coalesce(p_first, i);
        p_last := i;
      end if;
    end if;
    i := i + 1;
  end loop;
  if p_first is null then return; end if;

  -- quando começar (escolhido no editor)
  s_when := case when cfg->'video'->>'when' = 'enviado' then 'enviado' else 'respondeu' end;
  select o - 1 into s_idx from jsonb_array_elements(steps) with ordinality as x(v, o)
   where cfg->'video'->>'startStepId' is not null and v->>'id' = cfg->'video'->>'startStepId' limit 1;
  if s_idx is null then
    s_idx := greatest(0, p_first - 2);
    s_when := 'respondeu';
  end if;

  if coalesce(d->>'website', '') !~* '^https?://' then return; end if;
  if coalesce(d->'review'->>'status', 'pending') = 'rejected' then return; end if;
  if coalesce(d->>'stage', '') in ('ganho', 'perdido') then return; end if;

  f := d->'funnel';
  if f is null or jsonb_typeof(f) <> 'object' then return; end if;
  if coalesce((f->>'stopped')::boolean, false) then return; end if;
  st := coalesce((f->>'step')::int, 0);
  if st > p_last then return; end if;

  vid := d->'video';
  if vid is not null and coalesce(vid->>'status', '') <> 'erro' then return; end if;

  last_sent := nullif(f->>'lastSentAt', '')::timestamptz;
  replied := nullif(f->>'repliedAt', '')::timestamptz;
  if s_when = 'enviado' then
    ok := st > s_idx;
  else
    ok := st > s_idx + 1 or (st = s_idx + 1 and replied is not null and (last_sent is null or replied >= last_sent));
  end if;
  if not ok then return; end if;

  ver := case when vid is null then 1 else coalesce((vid->>'version')::int, 1) + 1 end;
  select (q.job).public_id into v_job from public.enqueue_job(
    'analyze_for_video', 'web-analyst', 'lead', p_lead_id,
    jsonb_build_object('website', d->>'website', 'name', d->>'name', 'version', ver),
    'analyze_for_video:' || p_lead_id || ':v' || ver, 'trigger', 65, 3, array['reasoning'], null, p_corr, p_cause) as q;

  update public.leads
     set data = data || jsonb_build_object('video', jsonb_build_object('status', 'analisando', 'analysisJobId', v_job, 'version', ver, 'requestedAt', now())),
         updated_at = now()
   where id = p_lead_id;
end;
$$;

create or replace function private.apply_job_result(r public.ai_jobs)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare h jsonb; hid text; v_job text; ver int;
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
  elsif r.job_type = 'analyze_for_video' and r.entity_type = 'lead' then
    -- só se este ainda é o pedido atual do lead
    select coalesce((data->'video'->>'version')::int, 1) into ver from public.leads
     where id = r.entity_id and coalesce(data->'video'->>'analysisJobId', r.public_id) = r.public_id;
    if ver is null then return; end if;
    select (q.job).public_id into v_job from public.enqueue_job(
      'render_prospect_video', 'video-studio', 'lead', r.entity_id,
      jsonb_build_object('analysis', r.result, 'version', ver),
      'render_prospect_video:' || r.entity_id || ':v' || ver, 'agent', 60, 3, array['video_render'], null, r.correlation_id, r.public_id) as q;
    update public.leads
       set data = data || jsonb_build_object('video', coalesce(data->'video', '{}'::jsonb) || jsonb_build_object('status', 'gerando', 'jobId', v_job, 'analysis', r.result)),
           updated_at = now()
     where id = r.entity_id;
  elsif r.job_type = 'render_prospect_video' and r.entity_type = 'lead' then
    -- Só aplica se este ainda é o pedido atual do lead (um "gerar de novo" mais novo ganha).
    update public.leads set data = data || jsonb_build_object('video', jsonb_strip_nulls(jsonb_build_object(
      'status', 'pronto',
      'jobId', to_jsonb(r.public_id),
      'version', data->'video'->'version',
      'requestedAt', data->'video'->'requestedAt',
      'analysisJobId', data->'video'->'analysisJobId',
      'analysis', data->'video'->'analysis',
      'path', r.result->'video_path',
      'path2', r.result->'video2_path',
      'durationSec', r.result->'duration_sec',
      'findings', r.result->'findings',
      'generatedAt', to_jsonb(now())))),
      updated_at = now()
    where id = r.entity_id and coalesce(data->'video'->>'jobId', r.public_id) = r.public_id;
  end if;
end;
$$;

create or replace function private.on_video_job_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_type in ('render_prospect_video', 'analyze_for_video') and new.entity_type = 'lead' and new.status in ('dead_letter', 'cancelled') and old.status is distinct from new.status then
    update public.leads
       set data = data || jsonb_build_object('video', coalesce(data->'video', '{}'::jsonb) || jsonb_build_object('status', 'erro', 'error', left(coalesce(new.error, new.status), 300))),
           updated_at = now()
     where id = new.entity_id and new.public_id in (data->'video'->>'jobId', data->'video'->>'analysisJobId');
  end if;
  return new;
end;
$$;
