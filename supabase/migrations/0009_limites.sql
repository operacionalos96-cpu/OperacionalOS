-- =====================================================================
-- Operacional OS — limites de uso (rate limit) que valem de verdade
-- Rodar depois do 0008 (SQL Editor → New query → colar → Run). Pode rodar de novo.
--
-- 1) Contador único no banco: vale para todas as cópias do servidor da Vercel
--    (antes cada cópia contava sozinha). Usado pela IA, cofre e webhooks.
--    Só o servidor (chave secret) pode chamar; o navegador não.
-- 2) Arquivos: além dos 50 MB por arquivo, cada pessoa pode enviar até
--    2 GB e 300 arquivos por dia.
-- =====================================================================

create table if not exists private.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);

-- Soma 1 e diz se ainda está dentro do limite (janela fixa de p_window segundos).
create or replace function public.rate_hit(p_key text, p_limit int, p_window int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);
  n int;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), w, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into n;
  -- faxina leve: janelas com mais de 1 dia somem
  delete from private.rate_limits where window_start < now() - interval '1 day' and random() < 0.02;
  return n <= p_limit;
end;
$$;

-- Quantas vezes já contou na janela atual (sem somar).
create or replace function public.rate_count(p_key text, p_window int)
returns int
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce((
    select hits from private.rate_limits
    where key = left(p_key, 200)
      and window_start = to_timestamp(floor(extract(epoch from now()) / p_window) * p_window)
  ), 0);
$$;

revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.rate_count(text, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;
grant execute on function public.rate_count(text, int) to service_role;

-- ---------- cota diária de arquivos por pessoa ----------
create or replace function private.upload_quota_ok()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select count(*) < 300 and coalesce(sum((metadata->>'size')::bigint), 0) < 2147483648
  from storage.objects
  where owner = (select auth.uid()) and created_at > now() - interval '1 day';
$$;

grant execute on function private.upload_quota_ok() to authenticated;

drop policy if exists "membros enviam arquivos de conteudo" on storage.objects;
create policy "membros enviam arquivos de conteudo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'conteudos' and (select private.is_member()) and (select private.upload_quota_ok()));
