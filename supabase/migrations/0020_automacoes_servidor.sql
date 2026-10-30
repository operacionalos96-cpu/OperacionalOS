-- =====================================================================
-- OperacionalOS — Automações de negócio no SERVIDOR (ADR 0006)
-- Rodar depois do 0019 no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Fato de negócio gravado em `events` → este gatilho põe um job na fila (mesma transação:
-- padrão Transactional Outbox) → o servidor executa (src/lib/server/automations.ts).
-- Assim a automação roda mesmo sem ninguém com o app aberto, e uma vez só.
--
-- Gatilho SEPARADO de private.on_event_inserted de propósito: automação nova = um `if` aqui,
-- sem reescrever as regras de IA/vídeo/webhooks que vivem no outro gatilho.
-- =====================================================================

create or replace function private.on_event_automations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare corr text := coalesce(new.correlation_id, case when new.entity_type = 'lead' then 'lead:' || new.entity_id end);
begin
  -- Virou cliente → tarefa de onboarding + recebimento previsto (uma vez por lead).
  if new.event_type = 'lead.converted' and new.entity_type = 'lead' then
    perform public.enqueue_job(
      'auto_won_lead', 'system', 'lead', new.entity_id, '{}'::jsonb,
      'auto_won_lead:' || new.entity_id, 'trigger', 80, 5, array['system'], null, corr, new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.on_event_automations() from public, anon, authenticated;

drop trigger if exists on_event_automations on public.events;
create trigger on_event_automations after insert on public.events
  for each row execute function private.on_event_automations();
