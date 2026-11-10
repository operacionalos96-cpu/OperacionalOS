# Escritório pessoal: especificação das Etapas 1 e 2

> **Status:** Etapa 1 em código (PR "Escritório pessoal: Etapa 1"); Etapa 2 ainda em especificação.
> **Base:** `docs/IA-OFFICE.md` (§2 e §4) e `docs/AI-OFFICE-EXECUCAO.md`. As entregas são jobs na `ai_jobs`; nenhuma fila paralela.
> **Referência de conceitos:** OpenBot, só como estudo. O OperacionalOS é um app próprio, **não é fork**: a licença PolyForm Noncommercial do OpenBot não permite reaproveitar código num produto da empresa.

## 0. Escopo da V1 (correção do Gabriel, 10/11/2026)

O produto é **agnóstico**: só usa as peças do próprio OperacionalOS.

- **Fila e estados 100% nativos:** o estado do agente muda só pela `ai_jobs`. **Sem Trello** nem outro kanban externo.
- **Memória nativa:** a memória dos agentes fica no banco do OperacionalOS (P6). **Sem exportação para Obsidian** nem outro cofre externo.
- **Sem API paga:** a Ponte HZK usa a **sessão da assinatura** já logada no PC (Claude Code, e depois outras CLIs), como o OpenBot faz. Ela não pede chave de API e não gera custo de token na operação básica.
- **Modelo:** o padrão é o de maior capacidade disponível na assinatura logada. No agente, `model = null` quer dizer "padrão da assinatura".
- **Limites de organização da fila:** 20 agentes, 3 níveis e 2 conversas em paralelo por agente.
- **Aprovado:**
  - isolamento por dono (inclusive na `ai_jobs`);
  - termo de aceite;
  - mensagens viram entregas sem duplicar;
  - rota de estados para o futuro 3D;
  - bloqueio isolado por agente;
  - manutenção ociosa só com recursos locais.
- **Sem UI final nesta fase.**

## 1. Etapa 1: base (implementada nesta PR)

### 1.1 Banco: `supabase/migrations/0026_escritorio_pessoal.sql`

O número segue o 0025 do PR #39. Se ele não entrar antes, renumerar.

| Peça | O que faz |
|---|---|
| `office` | um por pessoa (`owner_team_id` = `members.team_id`), com a versão e a data do termo aceito |
| `office_agents` | perfil, instruções, `parent_agent_id` (organograma), `kind` (`co_lider`/`funcionario`), `model` (null = padrão da assinatura), `effort`, `paused`, `version` |
| `office_agent_versions` | histórico das instruções (desfazer) |
| `office_threads` | conversa `direta` (1 agente) ou `canal` (2 a 20, com `lead_agent_id`) |
| `office_messages` | só acréscimo; `idempotency_key` única |
| `ai_jobs.owner_team_id`, `workers.owner_team_id` | null = da empresa (como hoje); preenchido = do escritório pessoal |
| `office_connections` | IAs da pessoa: tipo (`local`/`chave`/`assinatura`), provedor, rótulo, estado (`pendente`, `conectada`, `sem_cota`, `erro`, `desligada`), modelos informados pela Ponte. **Sem coluna de segredo** |
| `office_agents.connection_id` / `backup_models` / `capabilities` | a IA do agente, até 8 reservas para quando a cota acabar, e o que ele faz |
| `office_tasks` | pedido → subtarefas, com responsável, estado, resultado e prazo; `ai_jobs.office_task_id` liga a entrega à tarefa |
| `office_usage` | uso por entrega (provedor, modelo, tokens, tempo, grátis/pago, custo estimado); só o dono lê |

**Funções novas:** `office_upsert_connection`, `office_set_connection_enabled` e `office_create_task` (tarefa + conversa + primeira entrega, sem duplicar).
**Estados novos:** `sem_cota` e `sem_conexao`, quando a IA principal e todas as reservas estão indisponíveis.
**Catálogo:** `src/lib/domain/office-providers.ts`.

**Isolamento:**
- **`office_*`:** só o dono lê, **sem exceção para founder**. O navegador não escreve direto: tudo passa pelas funções abaixo.
- **`ai_jobs`:** membros leem só os jobs da empresa, e cada um lê os próprios jobs pessoais.
- **`workers`:** cada pessoa vê os da empresa e só a própria Ponte.
- **`claim_next_job`:** um worker só pega jobs do **mesmo dono** (a Ponte pessoal não pega job da empresa, e o worker da empresa não pega job pessoal). Para `office_reply`, a fila também respeita:
  - o agente pausado não recebe;
  - no máximo 2 em execução por agente;
  - uma mensagem por vez em cada conversa.
- **`job_event`:** jobs pessoais **não** geram evento na `events`, que todos leem. A timeline da empresa não mostra bastidores.
- **Payload:** o job pessoal leva só ids (`message_id`, `thread_id`). O texto fica em `office_messages`.

**Funções (RPC, `security definer`, todas exigem o termo aceito, menos a de aceite):**
- `office_accept_consent(p_version)`;
- `office_upsert_agent(...)`: travas de 20 agentes, 3 níveis, um co-líder, sem ciclo, e o funcionário sempre tem chefe;
- `office_set_agent_paused(p_agent, p_paused)`;
- `office_open_thread(p_kind, p_agent_ids, p_title, p_lead)`;
- `office_send_message(p_thread, p_body, p_idem, p_mentions, p_reply_to)`: grava a mensagem e cria **uma entrega por destinatário**, com chave `dlv:<msg>:<agente>`. Um reenvio não duplica.

### 1.2 Domínio: `src/lib/domain/office.ts`

Regras puras e testadas, com as mesmas regras do banco para a tela poder avisar antes:
- `validateAgentChange`;
- `pickRecipients`: menção → resposta a um agente → único membro → líder;
- `deliveryKey`;
- `deriveOfficeState`.

### 1.3 Estados exportáveis: `GET /api/escritorio/estado`

- **Acesso:** sessão do dono. A consulta passa pela RLS, então só devolve o próprio escritório.
- **Formato:** `office-state/v1`, sem texto de mensagem.
- **Estados, por precedência:**

| Estado | Quando |
|---|---|
| `bloqueado` | ação externa esperando liberação (P3) |
| `aguardando_aprovacao` | ação em lote esperando (P3) |
| `pausado` | agente pausado |
| `conversando` | trabalhando num canal |
| `trabalhando` | algum job em execução |
| `ponte_desligada` | há fila e a Ponte está sem sinal há mais de 2 min |
| `na_fila` | há fila e a Ponte está ligada |
| `manutencao` | tarefa local de standby (P6) |
| `ocioso` | nada acima |

```json
{ "schema": "office-state/v1", "generated_at": "…", "consent": true,
  "bridge": { "online": false, "last_seen_at": null },
  "agents": [ { "id": "agt_…", "name": "…", "title": "…", "kind": "co_lider", "parent_agent_id": null,
                "state": "na_fila", "queue": { "queued": 1, "running": 0 },
                "current": null } ],
  "handoffs": [] }
```

- **Tempo real:** `ai_jobs`, `office_agents` e `office_messages` estão na publicação do Realtime. A RLS vale ali também, e o cliente recalcula com `deriveOfficeState`.

## 2. Etapa 2: Ponte HZK local (próxima PR)

- **O que é:** um programa no PC (`workers/ponte-hzk/`) que é um **worker pessoal** da fila (`workers.owner_team_id`), com token `oos_…` mostrado uma vez.
- **Ciclo:**
  1. heartbeat;
  2. `claim_next_job(['office_reply'])` (o banco já isola por dono e aplica os limites);
  3. contexto (perfil, instruções e últimas mensagens);
  4. roda a **CLI da assinatura logada no PC** (Claude Code primeiro);
  5. progresso ao vivo;
  6. `complete_job` grava a mensagem do agente na mesma transação, ou `fail_job` com retry.
- **Toda a execução da V1 roda aqui** (decisão de 10/11/2026), inclusive com chave de API: a chave fica no PC, e o servidor só guarda a descrição da conexão.
- **Primeira leva de provedores:** Ollama ou LM Studio (locais) e OpenRouter (modelos `:free`). Depois vêm as assinaturas (Claude Code, Codex, Gemini CLI) e as chaves pagas, com o aviso de termos do catálogo.
- **Cota esgotada:** a Ponte marca a conexão `sem_cota` (com `quota_resets_at`) e o agente segue pela primeira reserva disponível. Cada entrega grava uma linha em `office_usage`.
- **Ferramentas:** só responder e relatar progresso. Arquivo, terminal e ações ficam para a P3, atrás dos portões de aprovação.
- **A conferir antes de codar:** os termos atuais do Claude Code e do Agent SDK sobre automatizar a sessão de uma assinatura. A ideia é usar a CLI oficial, no PC da própria pessoa, para o trabalho dela.

## 3. Depois

| Etapa | O que entra |
|---|---|
| **P3** | portões G0 automático / G1 em lote / G2 bloqueio do agente, e ações na empresa com auditoria |
| **P4** | co-líder propõe agentes |
| **P5** | delegação (handoffs) e canais com triagem |
| **P6** | memória nativa (candidato → validado) e standby com tarefas locais |
| **P7** | Sede 3D como gêmeo digital, lendo `office-state/v1` |
