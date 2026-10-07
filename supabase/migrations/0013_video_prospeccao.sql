-- =====================================================================
-- Operacional OS — vídeo de análise personalizado na prospecção
-- Rodar depois do 0012 (SQL Editor → New query → colar → Run). Pode rodar de novo.
-- Só ADICIONA/ATUALIZA funções. Nada existente é apagado.
--
-- • O vídeo NÃO é gerado para todo lead. A cada "lead respondeu" ou "passo enviado"
--   o banco confere se o lead chegou à parte do funil em que o vídeo é usado
--   (mesma regra de src/lib/domain/prospect-video.ts → videoEligibility):
--     aceitou o passo anterior ao vídeo (respondeu depois dele) OU esse passo já foi enviado.
--   Só então cria o job render_prospect_video (uma vez por lead: idempotency_key).
-- • O worker "Video Studio" (workers/video, na máquina de vocês) tira o print real do site,
--   detecta os problemas e renderiza. O resultado vira lead.video com status "pronto".
-- • A extensão só anexa o vídeo depois que uma pessoa APROVA (status "aprovado").
-- =====================================================================

-- ---------- regra: chegou na parte do vídeo? → enfileira ----------
create or replace function private.maybe_enqueue_video(p_lead_id text, p_cause text, p_corr text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb;
  steps jsonb;
  v_idx int;
  f jsonb;
  st int;
  last_sent timestamptz;
  replied timestamptz;
  vid jsonb;
  ver int;
  v_job text;
begin
  select data into d from public.leads where id = p_lead_id;
  if d is null then return; end if;

  -- Posição do passo de vídeo no funil salvo (padrão do sistema: 4º passo).
  select data->'steps' into steps from public.ai_settings where id = 'whatsapp_funnel';
  if steps is null or jsonb_typeof(steps) <> 'array' then
    v_idx := 3;
  else
    select min(o - 1) into v_idx from jsonb_array_elements(steps) with ordinality as s(e, o) where e->>'kind' = 'video';
  end if;
  if v_idx is null or v_idx < 1 then return; end if;

  if coalesce(d->>'website', '') !~* '^https?://' then return; end if;
  if coalesce(d->'review'->>'status', 'pending') = 'rejected' then return; end if;
  if coalesce(d->>'stage', '') in ('ganho', 'perdido') then return; end if;

  f := d->'funnel';
  if f is null or jsonb_typeof(f) <> 'object' then return; end if;
  if coalesce((f->>'stopped')::boolean, false) then return; end if;
  st := coalesce((f->>'step')::int, 0);
  if st > v_idx then return; end if;

  vid := d->'video';
  if vid is not null and coalesce(vid->>'status', '') <> 'erro' then return; end if;

  last_sent := nullif(f->>'lastSentAt', '')::timestamptz;
  replied := nullif(f->>'repliedAt', '')::timestamptz;
  if not (
    st >= v_idx
    or (st = v_idx - 1 and v_idx - 1 > 0 and replied is not null and (last_sent is null or replied >= last_sent))
  ) then
    return;
  end if;

  ver := case when vid is null then 1 else coalesce((vid->>'version')::int, 1) + 1 end;
  select (e.job).public_id into v_job from public.enqueue_job(
    'render_prospect_video', 'video-studio', 'lead', p_lead_id,
    jsonb_build_object('website', d->>'website', 'name', d->>'name', 'version', ver),
    'render_prospect_video:' || p_lead_id || ':v' || ver, 'trigger', 60, 3, array['video_render'], null, p_corr, p_cause) as e;

  update public.leads
     set data = data || jsonb_build_object('video', jsonb_build_object('status', 'gerando', 'jobId', v_job, 'version', ver, 'requestedAt', now())),
         updated_at = now()
   where id = p_lead_id;
end;
$$;

-- ---------- EVENTO → JOB (mesmas regras do 0011 + a do vídeo) ----------
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
  -- Lead avançou no funil de WhatsApp → se chegou na parte do vídeo, gera o vídeo dele.
  if new.entity_type = 'lead' and new.event_type in ('lead.replied', 'lead.followup_sent') then
    perform private.maybe_enqueue_video(new.entity_id, new.id, corr);
  end if;
  -- Webhooks inscritos neste tipo (ou em "*") recebem uma entrega (uma por evento).
  insert into public.webhook_deliveries (id, webhook_id, event_id)
  select private.ulid('dlv'), w.id, new.id from public.webhooks w
  where w.enabled and (new.event_type = any (w.event_types) or '*' = any (w.event_types))
  on conflict (webhook_id, event_id) do nothing;
  return new;
end;
$$;

-- ---------- RESULTADO → DOMÍNIO (mesmas regras do 0011 + a do vídeo) ----------
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
      'durationSec', r.result->'duration_sec',
      'findings', r.result->'findings',
      'generatedAt', to_jsonb(now())))),
      updated_at = now()
    where id = r.entity_id and coalesce(data->'video'->>'jobId', r.public_id) = r.public_id;
  end if;
end;
$$;

-- ---------- job de vídeo que falhou de vez / foi cancelado → lead mostra "Falhou" ----------
create or replace function private.on_video_job_finished()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.job_type = 'render_prospect_video' and new.entity_type = 'lead' and new.status in ('dead_letter', 'cancelled') and old.status is distinct from new.status then
    update public.leads
       set data = data || jsonb_build_object('video', coalesce(data->'video', '{}'::jsonb) || jsonb_build_object('status', 'erro', 'error', left(coalesce(new.error, new.status), 300))),
           updated_at = now()
     where id = new.entity_id and data->'video'->>'jobId' = new.public_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_video_job_finished on public.ai_jobs;
create trigger on_video_job_finished after update of status on public.ai_jobs for each row execute function private.on_video_job_finished();

-- ---------- o funil do lead mudou (tela, extensão, importação) → confere também ----------
-- Cobre a ordem "evento antes do lead salvo". Só reage à mudança do FUNIL (gravar lead.video não dispara de novo).
create or replace function private.on_lead_funnel_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data->'funnel' is distinct from old.data->'funnel' then
    perform private.maybe_enqueue_video(new.id, null, 'lead:' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_lead_funnel_changed on public.leads;
create trigger on_lead_funnel_changed after update of data on public.leads for each row execute function private.on_lead_funnel_changed();

-- ---------- lead.video é do servidor: o navegador grava o lead inteiro, mas nunca muda o vídeo ----------
-- (evita uma cópia antiga na tela voltar "pronto" para "gerando" ou apagar o vídeo)
create or replace function private.keep_server_video()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.data ? 'video' then
      new.data := jsonb_set(new.data, '{video}', old.data->'video');
    else
      new.data := new.data - 'video';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists keep_server_video on public.leads;
create trigger keep_server_video before update of data on public.leads for each row execute function private.keep_server_video();
