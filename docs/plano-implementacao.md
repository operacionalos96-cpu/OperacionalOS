# Plano de implementação do HZK OS (Fase 0: auditoria)

Especificação: [`hzk-os-blueprint.md`](hzk-os-blueprint.md). Este documento compara o blueprint com o
que o Operacional OS **já tem** e diz, peça por peça, o que se reaproveita, o que se estende e o que é
novo, para construir sem conflito e sem duplicar.

Esta etapa não muda código. Cada fase seguinte vira um PR próprio, sobre a `main`, seguindo
`COLABORACAO.md` e os ADRs de `docs/adr/`.

## 1. O projeto hoje

**Stack:**
- Next.js 15 (App Router) + React 19 + Tailwind 4, hospedado na Vercel.
- Supabase: Postgres, Auth, Realtime, Storage e pg_cron. O banco é compartilhado com outros apps
  (ADR 0004).

**Autenticação e acesso:**
- Login por e-mail e senha, validado no `src/middleware.ts`.
- A tabela `members` define quem entra. O nível de acesso (`role_level`: owner, admin, operator,
  viewer) é aplicado no banco por RLS (ADR 0005, migrations 0017–0019).

**Rotas (menu, em `src/config/pages.ts`):**
- Início
- Vendas: Prospecção, Pipeline, Clientes, Produtos
- AI Office
- Conteúdos
- Gestão: Financeiro, Tarefas & Notas, Mapas, Metas, Equipe, Cofre

**Padrões que valem para tudo (e o blueprint confirma):**

| Padrão | Onde | ADR |
|---|---|---|
| Uma fonte para cada número, pessoa e página | `src/lib/domain/metrics.ts`, `src/config/team.ts` + tabela `members`, `src/config/pages.ts` | 0007 |
| Regras de negócio puras e testadas, sem tela nem banco | `src/lib/domain/*` (o lint barra) | 0002 |
| Coleções com tempo real: tabela `id + data jsonb`, RLS por cargo | `createCollection` em `src/lib/modules.ts`; loop de policies das migrations | 0005, 0007 |
| Entidades ligadas a qualquer outra; contexto com notas, links e comentários | `src/lib/entities/*`, tabelas `relations` e `entity_context` | — |
| Fatos de negócio no servidor: evento → fila → executor | tabela `events`, fila `ai_jobs`, `src/lib/server/automations.ts`, agendador `/api/runner/tick` (pg_cron a cada minuto) | 0006 |
| Segredos criptografados no servidor | `integration_secrets` + `src/lib/server/vault.ts` | — |
| Editor rico | Tiptap (`src/components/shared/rich-text-editor.tsx`) | — |
| Captura e busca | Ctrl+K (`command-palette.tsx`) e botão "+" (`NewMenu` em `app-shell.tsx`) | — |

## 2. Por que a Início repete itens hoje

A Início monta duas listas a partir das **mesmas tarefas**, com duas funções diferentes:

- **"Precisa da sua atenção"** usa `attentionItems()` (`src/lib/domain/rules.ts`). Toda tarefa
  atrasada entra como `tarefa_atrasada`.
- **"Minhas responsabilidades"** usa `myAgenda()` (mesmo arquivo). As tarefas da pessoa entram por
  grupo de prazo, e o grupo `atrasadas` inclui as mesmas tarefas atrasadas.

Resultado: uma tarefa atrasada aparece nos dois blocos. É a regra 1 do blueprint ("cada coisa existe
uma vez; as telas são filtros") sendo quebrada na própria tela.

**Correção (Fase 2):** uma função só, `myDay()`, monta todos os blocos a partir dos itens. Cada item
recebe **um** bloco de destino, e o atraso vira selo dentro do Plano do dia. Um teste prova que a
interseção entre blocos é sempre vazia.

## 3. Blueprint × o que já existe

Regra do próprio blueprint: "antes de criar tabelas novas, mapear o que já existe e reaproveitar".
As tabelas novas seguem o padrão do projeto (`id + data jsonb` + RLS por cargo + tempo real). Ganham
colunas reais só quando precisam de consulta no banco (ex.: notificações por usuário).

| Blueprint | Já existe | Decisão |
|---|---|---|
| `profiles` (nome, cargo, avatar, horas/dia) | `members` (nome, avatar, nível de acesso) + `org_roles`/`member_roles` (cargos: Founder, CEO, CFO…) | **Reaproveitar.** O cargo do blueprint (CEO/founder/time) = cargo em `member_roles`; a permissão continua em `role_level`. Só acrescentar `horas_disponiveis_dia` em `members`. Não criar `profiles`: seria uma segunda fonte de pessoas, que o ADR 0007 acabou de eliminar. |
| `areas` | — | **Novo** (coleção `areas`: dono, apoio, aprovador). Tela em Configurações › Áreas. |
| `items` (task/idea/decision/note) | tabela `tasks` (com recorrência, checklist, responsáveis, projeto, ligações) | **Estender `tasks` para ser o item único.** Ganha `kind` (task, idea, decision, note), `areaId`, `plannedFor`, `estimateMin`, `order`, `origin` e `status: inbox`. Tarefas antigas são `kind: task` e continuam válidas sem migrar dados. Ligações já existentes (metas, mapas, relações, automação "Virou cliente") seguem funcionando, porque o id e o tipo de entidade não mudam. |
| `decisions` | — | **Extensão do item** (`kind: decision` + campo `decision` no jsonb: contexto, opções, recomendação, decisor, porta, resultado, motivo, data). Mesmo padrão 1-para-1 do blueprint, sem tabela paralela. |
| `docs` + `doc_versions` | tabela `notes` (texto rico Tiptap, título, ligada a tarefas e projeto) | **Evoluir `notes` para Docs** (Fase 4): status (Rascunho → Aprovado), versões e aprovações. As notas atuais viram docs em rascunho, sem perder nada. |
| `approvals` | — | **Novo.** |
| `comments` (com âncora no trecho) | `entity_context.comments` (comentários por entidade) | **Reaproveitar** e acrescentar `anchor` (trecho) e `resolved`. Serve para docs, itens e posts. |
| `notifications` | — | **Novo**, com `user_id` como coluna real (cada um lê as suas; RLS). |
| `daily_plans`, `checkins` | — | **Novos.** |
| `brainstorms`, `brainstorm_ideas`, `votes` | — | **Novos.** As ideias escolhidas viram itens (`kind: idea`/`task`). |
| `news_sources`, `news_items` | — | **Novos.** O cron usa o agendador e a fila que já existem (ADR 0006), não uma Edge Function: uma infraestrutura só para tarefas agendadas. |
| `content_posts` | `content_items` (pauta com etapa, formato, produto) + `ContentPost` (publicação por conta, com métricas) | **Estender.** Pauta = `ContentItem` (ganha pilar, gancho, CTA, fonte, roteiro = doc); post = `ContentPost` (ganha `scheduledFor`, `igMediaId`, `googleEventId`, canal). |
| `post_metrics` (D+1 / D+7) | `ContentPost.metrics` (uma leitura) | **Estender** para leituras por marco (D+1, D+7) com origem manual/api. O engajamento entra em `metrics.ts` (a definição muda de "÷ visualizações" para "÷ alcance", como pede o blueprint). |
| `integrations` | `integration_accounts` + `integration_secrets` (tokens criptografados), OAuth do YouTube/TikTok | **Reaproveitar**: novos provedores `google_calendar` e `instagram`. |
| `availability_cache` | — | **Novo.** |
| API do Claude | `src/lib/server/ai.ts` usa Gemini (`GEMINI_API_KEY`) | **Estender `ai.ts`** com o provedor Claude (chave só no servidor e limite diário por `rate-limit.ts`). Ver pergunta 4. |
| Captura rápida (⌘K / +) | Ctrl+K busca e cria; "+" cria lead, tarefa e lançamento | **Estender:** tarefa, ideia, nota ou decisão em uma linha, indo para a caixa de entrada de quem capturou. |
| Página de cada pessoa | `/equipe` (cards, cargos, organograma) | **Estender** com `/equipe/[id]`. |

## 4. Plano por fase

As migrations seguem a numeração da pasta: a próxima livre é a **0021**, e a numeração é verificada
por teste. Cada fase:
- tem um PR;
- inclui um ADR quando há decisão de estrutura;
- entra no registro de páginas, com "Como usar" (`src/config/pages.ts`; o teste reprova página sem
  explicação);
- tem testes de domínio e de RLS no Postgres de teste (`src/lib/server/test-db.ts`).

| Fase | Migrations | Rotas e telas | Peças principais | Riscos |
|---|---|---|---|---|
| **1. Fundação** | 0021: `areas`; `horas_disponiveis_dia` em `members`; `notifications` (RLS por usuário) | `/configuracoes/areas`, `/caixa-de-entrada`, `/decisoes`, `/equipe/[id]` | `kind` e campos novos em `Task` (domínio); roteamento área → dono; regra de decisão (porta + limite R$ + cargo CEO) como função pura; captura rápida; triagem com selo de 48 h | `store.ts` e `types.ts` são compartilhados com o outro dev: combinar antes; mudanças só aditivas (campos opcionais). |
| **2. Início Meu Dia + rituais** | 0022: `daily_plans`, `checkins` | `/` refeita nos 8 blocos; `/semana` (Semana do time); rituais em painel guiado | `myDay()` (um bloco por item, testado); soma de horas e aviso de sobrecarga; selos; Decisões pendentes para o decisor | Mudança grande de hábito: manter tudo visível e validar com vocês no modo demo antes de publicar. |
| **3. Google Calendar** | 0023: `availability_cache`; provedor `google_calendar` | Conectar/desconectar em Configurações | OAuth por pessoa (FreeBusy + agenda "Trabalho"); job a cada 10 min no agendador; `syncPostToCalendar(post)` | App Google "Externo": publicar em Produção para o token não expirar em 7 dias; lidar com token vencido ("reconectar"). |
| **4. Ideias & Docs** | 0024: `approvals`, `doc_versions`, `brainstorms` (+ ideias e votos); campos de doc em `notes`; âncora em comentários | `/ideias` (mural, brainstorming, pitches), `/docs/[id]` | Aprovação com vários aprovadores; versões; menções → `notifications`; "IA, sugira 10 ângulos" no servidor | Comentário ancorado no Tiptap (marca no trecho) é a parte técnica mais delicada. |
| **5. Conteúdo** | 0025: campos novos em `content_items`/posts, métricas por marco | Conteúdos com sub-abas Radar, Pautas, Calendário, Desempenho | Kanban pelo fluxo do blueprint; calendário com arrastar; D+1/D+7; painel por pilar e formato | Mapear as etapas atuais para o fluxo novo sem perder pautas (pergunta 3). |
| **6. Radar** | 0026: `news_sources`, `news_items` | Conteúdos › Radar e tela de fontes | Job diário: RSS → sem duplicados → resumo e ângulo por IA; resumo semanal | Custo e limite da IA; feeds que mudam de formato. |
| **7. Instagram** | 0027: provedor `instagram` | Conectar Instagram | Casar post com `igMediaId`; job D+1/D+7 com `origin: api`, sem apagar o manual; stories 24 h; carrossel sem insight por mídia | Aprovação do app na Meta; conta precisa ser Profissional. |

**Dependências** (iguais às do blueprint):
- Fase 1 → Fase 2 → Fase 3.
- Fase 1 → Fase 4.
- Fases 3 e 4 → Fase 5.
- Fase 5 → Fases 6 e 7.

A Fase 4 pode andar em paralelo com a 2 e a 3.

## 5. Perguntas antes da Fase 1

1. **Quem é quem:** qual e-mail é a CEO, qual é o Founder A (conteúdo e roteiros) e qual é o Founder B (comercial, lançamentos e tráfego)? Hoje há 3 membros: dois com nível owner e um admin.
2. **Limite em R$** a partir do qual um gasto vai para a CEO.
3. **Etapas de conteúdo:** trocar as etapas atuais pelo fluxo do blueprint, com este mapeamento?
   - Ideia → Ideia
   - Roteiro → Roteiro
   - Revisão → Em aprovação
   - Gravação + Edição → Produção
   - Pronto → Agendado
   - Publicado → Publicado
   - (novo) → Medido
4. **IA:** usar a API do Claude (precisa de uma chave paga da Anthropic na Vercel) ou o Gemini, que já está configurado? O código fica pronto para os dois; a pergunta é qual ligar.
5. **Horas disponíveis por dia** de cada pessoa (base do aviso de sobrecarga).
6. **Conteúdo:** pilares e formatos usados de verdade, e as fontes de notícia que já acompanham (sites, newsletters, perfis).
7. **Google Cloud:** reaproveitar o projeto e o app OAuth que já existe (usado no YouTube) ou criar um só para a agenda?
8. **Divisão com o programador:** quem faz cada fase? A Fase 1 mexe em `store.ts` e `types.ts`, que ele também edita.
