-- =====================================================================
-- Operacional OS — agendador do AI Office (pg_cron + pg_net, grátis no Supabase)
-- Rodar depois do 0011. Pode rodar de novo (recria os agendamentos).
--
-- ANTES, uma vez só, guarde o CRON_SECRET (o MESMO da Vercel) no cofre do Supabase.
-- No SQL Editor, rode SEPARADO (troque o texto entre aspas pelo seu segredo):
--
--     select vault.create_secret('COLE_AQUI_O_CRON_SECRET', 'operacionalos_cron_secret');
--
-- (para trocar depois: select vault.update_secret(id, 'NOVO') from vault.secrets where name = 'operacionalos_cron_secret';)
--
-- O que agenda (a cada 1 minuto):
--  1) ai-office-reap: recolhe leases vencidos direto no banco (não depende de internet).
--  2) ai-office-tick: chama /api/runner/tick (envia webhooks devidos com assinatura e retry).
-- Nenhum dos dois usa IA.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ai-office-reap') then perform cron.unschedule('ai-office-reap'); end if;
  if exists (select 1 from cron.job where jobname = 'ai-office-tick') then perform cron.unschedule('ai-office-tick'); end if;
end;
$$;

select cron.schedule('ai-office-reap', '* * * * *', $$ select public.reap_expired_leases(); $$);

select cron.schedule('ai-office-tick', '* * * * *', $$
  select net.http_post(
    url := 'https://operacional-os.vercel.app/api/runner/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'operacionalos_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);
