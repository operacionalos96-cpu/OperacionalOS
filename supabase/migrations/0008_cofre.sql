-- =====================================================================
-- Operacional OS — Cofre de senhas
-- Rodar depois do 0007 (SQL Editor → New query → colar → Run).
--
-- vault_items: um serviço por linha. O que importa (usuário, senha, 2FA,
-- códigos, observações) fica em "secret", CRIPTOGRAFADO no servidor com
-- VAULT_ENCRYPTION_KEY (que só existe na Vercel). Aqui no banco é ilegível.
--
-- SEM políticas de RLS: o navegador (anônimo ou logado) não lê nem escreve
-- nada aqui. Só as rotas do servidor, com a chave secret, depois de conferir
-- que é membro E que o cofre foi desbloqueado com a senha da conta.
-- Fora do tempo real de propósito.
-- =====================================================================

create table if not exists public.vault_items (
  id               text primary key check (char_length(id) between 8 and 64),
  name             text not null check (char_length(name) between 1 and 120),
  url              text check (url is null or char_length(url) <= 300),
  secret           text not null check (secret like 'v1.%' and char_length(secret) < 40000),
  created_by       text not null,
  created_at       timestamptz not null default now(),
  updated_by       text,
  updated_at       timestamptz not null default now(),
  last_revealed_by text,
  last_revealed_at timestamptz
);

alter table public.vault_items enable row level security;
revoke all on public.vault_items from anon, authenticated;
-- Nenhuma política criada: acesso só pelo servidor.

-- Senha do cofre (SEPARADA da senha de login): só o hash scrypt, irreversível.
-- Mesma regra: nenhum acesso pelo navegador, só o servidor.
create table if not exists public.vault_settings (
  id            text primary key default 'default' check (id = 'default'),
  password_hash text not null check (password_hash like 's1.%'),
  updated_by    text,
  updated_at    timestamptz not null default now()
);

alter table public.vault_settings enable row level security;
revoke all on public.vault_settings from anon, authenticated;
