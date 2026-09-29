# Segurança e login — Operacional OS

## Como o sistema se protege

| Camada | O que faz |
| --- | --- |
| **Login obrigatório** | `src/middleware.ts` valida o token (assinatura) em toda página. Sem login, tudo redireciona para `/login`. Sem Supabase configurado, nada abre (falha fechada). |
| **Lista de membros** | Só e-mails na tabela `members` acessam. Mesmo com conta criada, quem não está na lista é deslogado e o banco não entrega nada. |
| **RLS no banco** | Todas as tabelas têm Row Level Security: anônimo não lê nada; logado só lê/escreve se for membro. A chave pública do app sozinha não abre nada. |
| **Lista protegida** | `members` não pode ser alterada pela API — só pelo SQL Editor do Supabase. |
| **Senhas** | Mínimo 12 caracteres com maiúscula, minúscula, número e símbolo. Trocar senha encerra todas as sessões. |
| **Força bruta** | Limite de tentativas do Supabase + trava de 60s no formulário após 5 erros. Mensagens genéricas (não revelam se o e-mail existe). |
| **Cabeçalhos HTTP** | CSP, anti-iframe (clickjacking), nosniff, HSTS em produção, sem `X-Powered-By`. |
| **Redirecionamentos** | Só para caminhos internos (evita "open redirect" para site falso). |
| **Auditoria** | Cada registro guarda `updated_by` (quem mexeu) e `updated_at`, preenchidos pelo banco. |

## Configurar (uma vez, no painel do Supabase)

1. **SQL Editor → New query**: cole `supabase/migrations/0001_operacional_os.sql` e rode.
   No fim do arquivo, troque os e-mails do `insert into public.members` pelos reais e rode essa parte.
2. **Authentication → Sign In / Providers → Email**:
   - desligue **Allow new users to sign up** (ninguém cria conta sozinho);
   - **Confirm email** ligado; **Minimum password length** = 12; exigir letras, números e símbolos;
   - se disponível no plano: **Leaked password protection** ligado.
3. **Authentication → Users → Add user → Create new user**: crie as 2 contas (marque *Auto Confirm User*). Cada um define a própria senha — ninguém deve saber a senha do outro.
4. **Authentication → URL Configuration**: *Site URL* = endereço do app (ex.: `http://localhost:3000` no começo) e adicione `http://localhost:3000/auth/confirm` em *Redirect URLs*.
5. **Project Settings → API Keys**: copie a *publishable key* para `.env.local` (veja `.env.example`). A chave *secret* nunca vai para o app nem para o GitHub.

## Regras do dia a dia

- `.env.local` nunca vai para o GitHub (já está no `.gitignore`).
- Novo membro: inserir o e-mail em `members` pelo SQL Editor **e** criar o usuário em Authentication.
- Remover acesso: apagar a linha em `members` (o acesso cai na hora) e excluir o usuário.
