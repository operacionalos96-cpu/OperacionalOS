# Arquitetura — como o Operacional OS cresce

Este guia diz **como** fazer as coisas. O **porquê** de cada decisão estrutural está nos ADRs em
[`docs/adr/`](adr/README.md). Para o fluxo de trabalho (branch, PR, CI, migrations), veja
[`COLABORACAO.md`](../COLABORACAO.md).

## Camadas (ADR 0002)

A dependência só aponta para dentro. O lint barra o domínio de importar tela ou banco.

```
Interface        src/app/  ·  src/components/  ·  rotas src/app/api/
   ↓
Serviços         src/lib/services/  ·  src/lib/actions.ts  ·  src/lib/server/* (casos de uso)
   ↓
Domínio (puro)   src/lib/domain/   ← regras de negócio + testes, sem React/Supabase
   ↑
Infraestrutura   src/lib/repositories/  ·  src/lib/supabase/  ·  src/lib/server/supabase-admin.ts
```

Regra prática: se é uma **regra do negócio** ("lead parado = 7 dias", "lead ganho gera onboarding"),
ela é uma função pura em `src/lib/domain/` e recebe os dados por parâmetro. Tela, store e rotas só
chamam essas funções.

## Próximos passos de estrutura (ainda não feitos)

| Passo | Por quê | Referência |
|---|---|---|
| Permissões por cargo no banco (RLS) | Hoje qualquer membro grava em tudo; a tela não é barreira | Saltzer & Schroeder (1975) |
| Automações no servidor | "Lead ganho → onboarding" roda no navegador: sem ninguém online não roda, com dois online pode duplicar | Transactional Outbox (Richardson, 2018) |
| Colunas reais + índices para campos consultados | Cada registro é um jsonb `data`; consultas e totais grandes precisam de coluna | Kleppmann, *DDIA* (2017) |
| Paginação no servidor | Hoje cada tabela é carregada inteira no navegador | — |
| Observabilidade (erros, logs, saúde) | Saber que algo quebrou antes do usuário avisar | Beyer et al., *Site Reliability Engineering* (2016) |
| Banco Supabase próprio | Hoje é compartilhado com outros apps (ADR 0004) | — |

## Princípio fractal: tudo é uma Entidade

Lead, tarefa, produto, conteúdo, lançamento, nota, mapa, balão do mapa e meta são
**entidades** (`src/lib/entities/types.ts`: `EntityRef = { type, id }`). Toda entidade
ganha as mesmas capacidades, em qualquer tela:

| Capacidade | Onde | O que faz |
| --- | --- | --- |
| Identidade | `entities/types.ts` · `refKey()` | tipo + id estáveis |
| Resumo | `entities/summary.ts` · `summaryOf()` | título, subtítulo, concluída? (busca, vínculos, bloqueios) |
| Abrir | `entities/registry.tsx` · `openEntity()` | ícone e rota de cada tipo (tarefa abre em painel) |
| Relações | `entities/relations.ts` + coleção `relations` | liga qualquer coisa a qualquer coisa ("depende de", "bloqueia", "gera"…) |
| Presença | `presenceOf()` | "onde aparece": relações + ligações que já existiam (lead do produto, balão do mapa…) |
| Bloqueio | `blockersOf()` | tarefa "depende de" algo não feito → aparece **Bloqueada** |
| Contexto | `components/entities/context-panel.tsx` + coleção `entity_context` | notas, links, anexos, comentários |

Componentes prontos para qualquer página: `<ConnectionsPanel entity={ref} />`,
`<ContextPanel entity={ref} />`, `<EntityPicker onPick />`, `<EntityChip entity />`.
A busca Ctrl+K lista todas as entidades pelo registro.

**Entidade nova:** tipo em `types.ts` → caso em `summaryOf`/`searchableEntities` →
ícone/rota em `registry.tsx` → (se ligar a outras por campo, um caso em `presenceOf`).

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

## Mapa (espaço de pensamento)

- **1 registro por balão** (`map_nodes`, `map_edges`, SQL 0005): cada edição grava só o balão/linha que mudou;
  o tempo real junta as mudanças do sócio balão a balão (`useMapSync` em `mind-map-editor.tsx`).
  Mapas antigos migram ao abrir (`migrateMap` em `src/lib/maps.ts`); o jsonb antigo fica como backup.
- **Balão = entidade** (`mapNode`, id `"<mapa>/<balão>"`): tem Conexões e Contexto no painel lateral e
  pode representar uma tarefa (`taskId`), um lead (`leadId`) ou outra coisa (`ref`: produto, conteúdo, nota…).
- Regras puras em `src/lib/domain/mindmap.ts`: tipos de balão, grupos (`membersOf`), ramos
  (`descendants`, `hiddenByCollapse`, `focusSet`) e a ordem da Lista/Apresentação (`outline`).

## Eventos, automações e integrações (escala)

- **Eventos** (`src/lib/events.ts`): `lead.ganho`, `lead.perdido`, `tarefa.concluida`, `entrada.lancada`,
  `conteudo.etapa`. Saem da store/ações; qualquer módulo reage com `on(tipo, fn)`.
- **Automações** (`src/lib/automations.ts`): "Meta batida" e "Virou cliente". Nova automação = item em
  `AUTOMATIONS` + um `on(...)` em `startAutomations`.
- **Vendas automáticas** (`src/lib/server/sales-webhooks.ts` + `POST /api/webhooks/<plataforma>`):
  Hotmart e Kiwify viram **entrada** no financeiro (produto casado pelo nome, sem duplicar a mesma venda).
  Na Vercel: `SUPABASE_SECRET_KEY`, `HOTMART_HOTTOK` e/ou `KIWIFY_TOKEN` (opcional `WEBHOOK_OWNER_ID`).
  URL para colar na plataforma: `https://operacional-os.vercel.app/api/webhooks/hotmart` (ou `/kiwify`).
  Plataforma nova = mais um item em `SALES_PROVIDERS`.
- **Volume**: tudo carrega em páginas de 1000 (`src/lib/repositories/select-all.ts`); índices no SQL 0007.

## IA no mapa

- Botão **IA** no balão: sugerir filhos, achar lacunas, resumir ramo. Tudo chega como **rascunho**.
- Regras puras em `src/lib/domain/ai-map.ts` (o que vai, limites, leitura da resposta); modelo no servidor em
  `src/lib/server/ai.ts` (hoje Gemini: `GEMINI_API_KEY`, opcional `GEMINI_MODEL`); rota `POST /api/ia/mapa`
  só para membros, com limite de 10 pedidos/min por pessoa. Só vai o texto do mapa.

## AI Office (prospecção + aprendizado, sem API de IA paga)

**Fluxo:** lead encontrado (planilha / futuro Prospector) → `lead.created` → análise (planilha / futuro
Web Analyst: `lead.analysis`) → **revisão humana** no Modo Prospecção (`/prospeccao`) → aprovar (`lead.approved`)
ou descartar com motivo (`lead.rejected`, sai do Pipeline mas fica guardado) → WhatsApp com "Bom dia/Boa tarde"
→ humano confirma "ENVIEI" (`lead.contacted`, etapa "Contato feito") → próximo da fila.

| Peça | Onde |
| --- | --- |
| Campos do lead (segmento, cidade, origem, `analysis`, `review`, contato) | `src/lib/domain/types.ts` (opcionais, no JSON do lead) |
| Regras da prospecção (fila, saudação, aprovar/descartar/contato, dados p/ aprendizado) | `src/lib/domain/prospecting.ts` (+ testes) |
| Agentes, eventos, aprendizados, hipóteses (tipos e regras) | `src/lib/domain/ai-office.ts` (+ testes) |
| Event System: grava em `events` (imutável), avisa inscritos, feed ao vivo | `src/lib/event-service.ts` · SQL 0010 |
| **Camada de serviços** (nomes = futuras ferramentas MCP: `search_leads`, `get_next_lead`, `get_feedback`…) | `src/lib/services/ai-office.ts` |
| Telas | `/prospeccao`, `/ai-office`, painel "Revisão e análise" no lead |

**Regras:** análise (IA) e revisão (humano) ficam separadas para comparar; nada é apagado; hipótese só muda
de status por humano e nunca altera regra sozinha; `preferredModel` é só preferência (model-agnostic).

**Próximo (MCP/webhooks):** um servidor MCP expõe `tools` de `src/lib/services/ai-office.ts` (versão servidor com
`supabaseAdmin`) e lê/escreve `events`; webhooks/workers se inscrevem em `events` (tempo real) ou leem a tabela.
