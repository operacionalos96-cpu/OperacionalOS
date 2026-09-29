-- =====================================================================
-- Operacional OS — módulos Produtos e Conteúdos
-- Rodar depois do 0001 (Dashboard → SQL Editor → New query → colar → Run).
-- Mesmo padrão de segurança do 0001: RLS só para membros, anônimo sem acesso.
-- =====================================================================

-- ---------- tabelas dos módulos (padrão id + data jsonb) ----------
do $$
declare
  t text;
begin
  foreach t in array array['products', 'content_accounts', 'content_items']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key check (char_length(id) between 1 and 64),
        data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 512000),
        updated_at timestamptz not null default now(),
        updated_by uuid
      );
      alter table public.%1$I enable row level security;
      revoke all on public.%1$I from anon;
      grant select, insert, update, delete on public.%1$I to authenticated;

      drop policy if exists "membros leem" on public.%1$I;
      create policy "membros leem" on public.%1$I
        for select to authenticated using ((select private.is_member()));

      drop policy if exists "membros criam" on public.%1$I;
      create policy "membros criam" on public.%1$I
        for insert to authenticated with check ((select private.is_member()));

      drop policy if exists "membros editam" on public.%1$I;
      create policy "membros editam" on public.%1$I
        for update to authenticated using ((select private.is_member())) with check ((select private.is_member()));

      drop policy if exists "membros apagam" on public.%1$I;
      create policy "membros apagam" on public.%1$I
        for delete to authenticated using ((select private.is_member()));

      drop trigger if exists stamp on public.%1$I;
      create trigger stamp before insert or update on public.%1$I
        for each row execute function private.stamp();
    $f$, t);

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------- arquivos dos conteúdos (bruto, editado, revisado, final) ----------
-- Bucket PRIVADO: nada é público; o app gera links temporários (1h) só para membros.
-- Limite por arquivo: 50 MB (máximo do plano Free). No plano Pro dá para subir
-- (Storage → Settings) — para brutos grandes, use o campo "link" (Drive etc.).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conteudos', 'conteudos', false, 52428800,
        array['video/*', 'audio/*', 'image/*', 'application/pdf', 'text/plain'])
on conflict (id) do update
  set public = false,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "membros leem arquivos de conteudo" on storage.objects;
create policy "membros leem arquivos de conteudo" on storage.objects
  for select to authenticated
  using (bucket_id = 'conteudos' and (select private.is_member()));

drop policy if exists "membros enviam arquivos de conteudo" on storage.objects;
create policy "membros enviam arquivos de conteudo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'conteudos' and (select private.is_member()));

drop policy if exists "membros atualizam arquivos de conteudo" on storage.objects;
create policy "membros atualizam arquivos de conteudo" on storage.objects
  for update to authenticated
  using (bucket_id = 'conteudos' and (select private.is_member()))
  with check (bucket_id = 'conteudos' and (select private.is_member()));

drop policy if exists "membros apagam arquivos de conteudo" on storage.objects;
create policy "membros apagam arquivos de conteudo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'conteudos' and (select private.is_member()));
