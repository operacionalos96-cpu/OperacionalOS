# Arquitetura — como o Operacional OS cresce

## Módulos

Cada área (Pipeline, Produtos, Conteúdos, …) é um **módulo** com 4 partes:

| Parte | Onde | Exemplo (Produtos) |
| --- | --- | --- |
| Tipos + regras puras (testadas) | `src/lib/domain/<modulo>.ts` | `products.ts` + `modules.test.ts` |
| Coleção (banco + tempo real) | `src/lib/modules.ts` | `useProducts = createCollection("products")` |
| Tabela + segurança | `supabase/migrations/NNNN_*.sql` | `0002_produtos_conteudos.sql` |
| Telas | `src/app/<rota>/` + `src/components/<modulo>/` | `/produtos`, `/produtos/[id]` |

### Criar um módulo novo (checklist)

1. Tipos e regras em `src/lib/domain/<novo>.ts` (+ testes).
2. `export const useNovo = createCollection<Novo>("nova_tabela")` em `src/lib/modules.ts`.
   Login, carregamento, salvar, desfazer e tempo real já vêm prontos (`src/lib/collection-store.ts`).
3. Nova migration copiando o bloco `do $$ … $$` do `0002` com o nome da tabela
   (RLS para membros + realtime). Rodar no SQL Editor.
4. Item no menu em `src/components/shell/nav.ts` e as páginas em `src/app/<rota>/`.
5. Se ligar a outro módulo, use um campo `<modulo>Id` opcional (ex.: `productId` em Lead,
   Transaction, ContentItem, ContentAccount). Opcional = dados antigos continuam válidos.

## Ligações entre módulos (hoje)

```
Produto ─┬─ Leads (lead.productId)            → funil e conversão por produto
         ├─ Lançamentos (transaction.productId) → entradas, saídas e resultado
         ├─ Conteúdos (contentItem.productId)
         └─ Contas (contentAccount.productId)
Conta principal ─ Contas de cortes (contentAccount.parentId)
Conteúdo ─ Publicações (1 por conta) ─ Métricas
```

## Próxima etapa: publicar e puxar métricas via API

A estrutura já existe: `ContentPost.source` (`manual` | `api`) e `ContentPost.externalId`.
O que falta, por plataforma (YouTube Data API, Instagram Graph API, TikTok Content Posting API):

1. **App na plataforma** (Google Cloud / Meta / TikTok for Developers) e aprovação dos escopos.
2. **Login OAuth no servidor**: rota `src/app/api/integracoes/[plataforma]/callback/route.ts`.
3. **Tokens só no servidor**: tabela `integration_tokens` **sem nenhuma política RLS** para
   `authenticated` (o navegador nunca lê). Só rotas de servidor, com a chave *secret* guardada
   como variável de ambiente **sem** `NEXT_PUBLIC_` na Vercel.
4. **Publicar**: rota de servidor lê o arquivo "final" do bucket e envia para a API; grava
   `externalId` e `url` na publicação.
5. **Métricas automáticas**: Vercel Cron (ex.: a cada 6h) chama uma rota que atualiza
   `metrics` de cada publicação com `source = "api"`.

Arquivos grandes (bruto de vídeo): o plano Free do Supabase limita 50 MB por arquivo.
No Pro dá para subir o limite e usar upload resumível; até lá, use o campo "Link".
