-- =====================================================================
-- Operacional OS — 2º vídeo personalizado do funil (visão/transformação)
-- Rodar depois do 0013 (SQL Editor → New query → colar → Run). Pode rodar de novo.
--
-- O mesmo job render_prospect_video agora entrega os DOIS vídeos do lead:
--   video_path  → lead.video.path   (1º passo de vídeo: diagnóstico)
--   video2_path → lead.video.path2  (2º passo de vídeo: visão/transformação)
-- Só atualiza private.apply_job_result (mesmas regras do 0013 + path2).
-- =====================================================================

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
  elsif r.job_type = 'render_prospect_video' and r.entity_type = 'lead' then
    -- Só aplica se este ainda é o pedido atual do lead (um "gerar de novo" mais novo ganha).
    update public.leads set data = data || jsonb_build_object('video', jsonb_strip_nulls(jsonb_build_object(
      'status', 'pronto',
      'jobId', to_jsonb(r.public_id),
      'version', data->'video'->'version',
      'requestedAt', data->'video'->'requestedAt',
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
