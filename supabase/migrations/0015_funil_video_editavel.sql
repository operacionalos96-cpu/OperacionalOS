-- =====================================================================
-- Operacional OS — funil de vídeo 100% editável
-- Rodar depois do 0014 (SQL Editor → New query → colar → Run). Pode rodar de novo.
--
-- Agora quem decide é o editor do funil (Prospecção › Funil › Editar funil):
--  • cada passo de vídeo tem "source": arquivo | diagnostico | visao
--    (sem valor, funis antigos: 1º vídeo = diagnóstico, 2º = visão, demais = arquivo);
--  • ai_settings.whatsapp_funnel.data.video = { startStepId, when: "enviado" | "respondeu" }
--    diz QUANDO começar a gerar (sem valor: responder 2 passos antes do 1º vídeo personalizado).
-- Mesma regra de src/lib/domain/prospect-video.ts (videoEligibility) — manter as duas iguais.
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
    'render_prospect_video', 'video-studio', 'lead', p_lead_id,
    jsonb_build_object('website', d->>'website', 'name', d->>'name', 'version', ver),
    'render_prospect_video:' || p_lead_id || ':v' || ver, 'trigger', 60, 3, array['video_render'], null, p_corr, p_cause) as q;

  update public.leads
     set data = data || jsonb_build_object('video', jsonb_build_object('status', 'gerando', 'jobId', v_job, 'version', ver, 'requestedAt', now())),
         updated_at = now()
   where id = p_lead_id;
end;
$$;
