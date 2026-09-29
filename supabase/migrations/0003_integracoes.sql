-- =====================================================================
-- Operacional OS — integrações com YouTube e TikTok
-- Rodar depois do 0002 (SQL Editor → New query → colar → Run).
--
-- Duas tabelas, separadas de propósito:
--  * integration_accounts: status da conexão (canal/perfil conectado). Membros LEEM.
--  * integration_secrets:  tokens de acesso, CRIPTOGRAFADOS pelo app (AES-256-GCM).
--    RLS ligado e NENHUMA política: nem anônimo nem membro logado conseguem ler
--    pela API. Só o servidor do app (chave secret), que nunca vai ao navegador.
-- =====================================================================

create table if not exists public.integration_accounts (
  id                 text primary key,               -- = id da conta de conteúdo (content_accounts)
  platform           text not null check (platform in ('youtube', 'tiktok')),
  external_id        text not null,                  -- id do canal (YouTube) / open_id (TikTok)
  display_name       text,
  scopes             text,
  status             text not null default 'ativo' check (status in ('ativo', 'expirado')),
  connected_by       uuid,
  connected_at       timestamptz not null default now(),
  last_sync_at       timestamptz,
  last_sync_error    text
);

alter table public.integration_accounts enable row level security;
revoke all on public.integration_accounts from anon, authenticated;
grant select on public.integration_accounts to authenticated;

drop policy if exists "membros veem conexoes" on public.integration_accounts;
create policy "membros veem conexoes" on public.integration_accounts
  for select to authenticated using ((select private.is_member()));
-- Sem insert/update/delete para usuários: só o servidor grava (depois de validar o login).

create table if not exists public.integration_secrets (
  account_id          text primary key references public.integration_accounts (id) on delete cascade,
  access_token_enc    text not null,
  refresh_token_enc   text,
  expires_at          timestamptz,
  updated_at          timestamptz not null default now()
);

alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;
-- Nenhuma política = ninguém lê pela API pública. O servidor usa a chave secret (ignora RLS).
