-- =====================================================================
-- HZK OS — Contratos (ADR 0025)
-- Rodar depois do 0028 no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- Depende do 0025 (acesso por área): private.can_read_area / private.can_write_area.
--
-- contracts: uma linha por contrato (id + data jsonb, como os outros módulos).
--   Quem lê e quem grava é decidido pela ÁREA "contratos" (ADR 0020), não por regra própria:
--   - ler: nível "ver" ou mais na área;
--   - criar, editar e apagar: nível "operar" ou mais (e operator+ na empresa).
--   Enquanto a área não for marcada como restrita (Equipe › Acesso por área), todo membro lê.
--   Marcando como restrita, só os founders e quem recebeu acesso leem — tabela E arquivos.
--
-- Bucket "contratos": PRIVADO, só PDF, Word (.docx), PNG e JPG, até 20 MB por arquivo.
--   Mesmas regras da área; envio também conta na cota diária por pessoa (0009).
--   Arquivo não é sobrescrito (sem política de update): versão nova = arquivo novo.
-- =====================================================================

create table if not exists public.contracts (
  id         text primary key check (char_length(id) between 1 and 80),
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 64000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.contracts enable row level security;
revoke all on public.contracts from anon;
grant select, insert, update, delete on public.contracts to authenticated;

drop policy if exists "membros leem" on public.contracts;
create policy "membros leem" on public.contracts for select to authenticated
  using ((select private.is_member()) and (select private.can_read_area('contratos')));
drop policy if exists "membros criam" on public.contracts;
create policy "membros criam" on public.contracts for insert to authenticated
  with check ((select private.can_write_area('contratos')));
drop policy if exists "membros editam" on public.contracts;
create policy "membros editam" on public.contracts for update to authenticated
  using ((select private.can_write_area('contratos')))
  with check ((select private.can_write_area('contratos')));
drop policy if exists "membros apagam" on public.contracts;
create policy "membros apagam" on public.contracts for delete to authenticated
  using ((select private.can_write_area('contratos')));

drop trigger if exists stamp on public.contracts;
create trigger stamp before insert or update on public.contracts for each row execute function private.stamp();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contracts') then
    alter publication supabase_realtime add table public.contracts;
  end if;
end;
$$;

-- ---------- arquivos dos contratos ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos', 'contratos', false, 20971520,
        array['application/pdf', 'image/png', 'image/jpeg',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "contratos: quem ve a area le" on storage.objects;
create policy "contratos: quem ve a area le" on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos' and (select private.is_member()) and (select private.can_read_area('contratos')));

drop policy if exists "contratos: quem opera a area envia" on storage.objects;
create policy "contratos: quem opera a area envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contratos' and (select private.can_write_area('contratos')) and (select private.upload_quota_ok()));

drop policy if exists "contratos: quem opera a area apaga" on storage.objects;
create policy "contratos: quem opera a area apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contratos' and (select private.can_write_area('contratos')));
