# Integrações — YouTube e TikTok

**O que já funciona:** conectar cada conta (principal e cortes) com login seguro e puxar
métricas sozinho a partir do link do post (1x por dia + botão "Atualizar métricas").
**Próxima etapa:** publicar vídeos direto pelo sistema (TikTok exige auditoria para isso).

## 0. Uma vez: servidor

1. Supabase → **SQL Editor**: rode `supabase/migrations/0003_integracoes.sql`.
2. Vercel → **Settings → Environment Variables** (marque Production *e* Preview):

| Variável | Valor |
| --- | --- |
| `APP_URL` | `https://operacional-os.vercel.app` |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_…`) |
| `TOKEN_ENCRYPTION_KEY` | copie **o mesmo valor** do seu `.env.local` (local e site precisam da mesma chave para ler os tokens) |
| `CRON_SECRET` | copie do `.env.local` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | passo 1 abaixo |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | passo 2 abaixo |

   Depois: **Deployments → ⋯ → Redeploy**. Coloque as mesmas chaves no seu `.env.local` para testar localmente.
   ⚠️ Chaves *secret* nunca em variável `NEXT_PUBLIC_` e nunca no chat/GitHub.

## 1. YouTube (Google Cloud) — ~15 min

1. <https://console.cloud.google.com> → criar projeto **Operacional OS**.
2. **APIs e serviços → Biblioteca** → ative **YouTube Data API v3**.
3. **Google Auth Platform → Branding/Tela de consentimento**: tipo **Externo**, nome do app, e-mail de suporte.
   - **Público → Usuários de teste**: adicione os e-mails Google donos dos canais.
   - **Acesso a dados → Escopos**: `.../auth/youtube.readonly`.
4. **Clientes → Criar cliente → Aplicativo da Web**. Em *URIs de redirecionamento autorizados*:
   - `https://operacional-os.vercel.app/api/integracoes/youtube/callback`
   - `http://localhost:3000/api/integracoes/youtube/callback`
5. Copie **ID do cliente** e **Chave secreta** para `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

> Em modo **Teste**, o Google derruba a conexão a cada 7 dias (aparece "Reconectar").
> Depois de testar, clique em **Publicar app**: para uso interno de vocês dois, o aviso de
> "app não verificado" aparece só na hora de conectar e a conexão passa a durar.

## 2. TikTok (TikTok for Developers) — ~20 min + análise do TikTok

1. <https://developers.tiktok.com> → **Manage apps → Connect an app**.
2. Preencha nome, ícone, categoria e descrição. O TikTok pede **URL de Termos de Uso e de
   Política de Privacidade** para enviar o app para análise (posso criar essas páginas no site).
3. **Add products → Login Kit** → Web → *Redirect URI*:
   `https://operacional-os.vercel.app/api/integracoes/tiktok/callback`
   (o TikTok só aceita https: a conexão do TikTok funciona no site, não no localhost).
4. **Scopes**: `user.info.basic` e `video.list`.
5. **Sandbox**: crie um sandbox e adicione seus perfis do TikTok como *target users* para
   testar antes da aprovação. Use as chaves do sandbox enquanto isso.
6. Copie **Client key** e **Client secret** para `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`.
7. Funcionando no sandbox → **Submit for review**.

## 3. Usar

1. **Conteúdos → Contas**: em cada conta YouTube/TikTok, clique **Conectar** e autorize com o
   login *daquela* conta (cada conta de cortes é conectada separadamente).
2. Em cada conteúdo, na publicação, marque **publicado** e cole o **link completo** do vídeo
   (TikTok: `tiktok.com/@perfil/video/123…`, não o link curto `vm.tiktok.com`).
3. **Conteúdos → Métricas → Atualizar métricas** (ou espere a atualização diária, 6h da manhã).

O que vem da API: YouTube → views, curtidas, comentários. TikTok → views, curtidas, comentários
e compartilhamentos. "Salvos" continua manual (as APIs não informam).

## Segurança

- Client secret e tokens ficam **só no servidor**; tokens gravados **criptografados** (AES-256-GCM)
  numa tabela que nem os membros conseguem ler pela API.
- Login com proteção anti-CSRF (`state` aleatório em cookie httpOnly, válido por 10 min).
- Escopos mínimos: só leitura de perfil e estatísticas.
- Desconectar apaga os tokens na hora.
