# 0022. Escritório pessoal: privado por dono, sobre a fila que já existe

- **Status:** Proposto
- **Data:** 2026-11-10

## Contexto

Cada pessoa vai ter um escritório de IA privado, com a própria equipe de agentes: um co-líder e funcionários abaixo dele (`docs/IA-OFFICE.md` §2). A especificação da V1 está em `docs/ESCRITORIO-PESSOAL.md`.

O produto é **agnóstico** (decisão do Gabriel, 10/11/2026):
- fila e memória nativas, sem Trello, Obsidian ou outra ferramenta externa no núcleo;
- a execução virá da Ponte HZK usando a **sessão da assinatura logada no PC**, sem API paga.

O OpenBot é só referência de conceitos: a licença dele não permite reaproveitar código.

Fatos do código que pesaram:
- **`ai_jobs` aberta:** a fila (SQL 0011) é lida por **todos os membros**, e qualquer worker pega qualquer job. Se as entregas pessoais usassem a fila como está, as conversas de uma pessoa ficariam visíveis para a outra.
- **Eventos públicos:** todo job gera um evento `job.*` na tabela `events`, que todos leem.

## Decisão

1. **Conversas no servidor (modo servidor):**
   - tabelas `office`, `office_agents`, `office_agent_versions`, `office_threads` e `office_messages`;
   - **só o dono lê**, sem exceção para founder;
   - o navegador não escreve direto: tudo passa por funções `office_*` (`security definer`), que conferem o dono, o termo aceito, os limites e a idempotência.
2. **Entregas na fila existente:** uma mensagem vira uma entrega (`job_type = office_reply`) por agente destinatário, com chave `dlv:<msg>:<agente>`. Não se cria fila paralela.
3. **Dono no job e no worker (`owner_team_id`):**
   - **RLS da `ai_jobs` e da `workers`:** o que é da empresa continua para todos os membros; o que é pessoal, só para o dono;
   - **`claim_next_job`:** um worker só pega job do mesmo dono e respeita os limites do escritório: agente pausado não recebe, no máximo 2 em execução por agente, uma mensagem por vez por conversa;
   - **`job_event`:** job pessoal não gera evento na `events`;
   - **payload:** o job pessoal leva só ids; o texto fica em `office_messages`.
4. **Limites no banco:** 20 agentes, 3 níveis, um co-líder, funcionário sempre com chefe, sem ciclo. As mesmas regras estão em `src/lib/domain/office.ts`, para a tela avisar antes.
5. **Estados exportáveis:**
   - `GET /api/escritorio/estado` devolve `office-state/v1`, calculado por `deriveOfficeState` (função pura) com a sessão do dono (RLS), e sem texto de conversa;
   - é o contrato que a Sede 3D vai ler como gêmeo digital (Etapa 7);
   - as tabelas entram no Realtime, onde a RLS também vale.

6. **Multiprovedor desde a base** (decisão do Gabriel, 10/11/2026: cada pessoa conecta IAs grátis ou pagas, como num provedor de IA):
   - **`office_connections`:** só a descrição (`local`, `chave` ou `assinatura`; provedor; estado). **Não existe coluna para chave ou token**: o segredo fica no PC, na Ponte HZK;
   - **agente:** ganha `connection_id`, `model`, `backup_models` (até 8 reservas, usadas quando a cota acaba) e `capabilities` (texto, imagem, código, arquivo, web). Conexão e reservas precisam ser do próprio dono;
   - **estados novos:** `sem_cota` e `sem_conexao`, quando nem a IA principal nem as reservas estão disponíveis;
   - **catálogo** de provedores em `src/lib/domain/office-providers.ts`, com aviso de termos nas assinaturas.
7. **Tarefas em árvore (`office_tasks`):**
   - pedido → subtarefas (`parent_task_id`, `root_task_id`), com responsável, estado e resumo do resultado;
   - `office_create_task` cria a tarefa, a conversa dela e a primeira entrega; cada entrega leva `ai_jobs.office_task_id`.
   - É a base do Big Boss (E4) e da tabela de fluxo.
8. **Uso (`office_usage`):** uma linha por entrega, com provedor, modelo, tokens, tempo, se foi grátis e o custo estimado. Só o dono lê; quem grava é o servidor, quando a Ponte conclui (E2).
9. **Toda a execução da V1 roda na Ponte HZK**, no PC da pessoa, inclusive com chave de API: a chave nunca vai ao servidor, e a Vercel não segura processos longos.
   - **Primeira leva:** Ollama ou LM Studio locais e OpenRouter, que são grátis e sem dúvida de termos.
   - **Depois:** as assinaturas (Claude Code, Codex, Gemini CLI) e as chaves pagas, com o aviso de termos.

## Consequências

- **Limite do modo servidor:** quem administra o Supabase consegue, tecnicamente, ler as conversas. Isso fica escrito no termo de aceite (versão gravada em `office.consent_version`).
- **Timeline da empresa:** o monitor de Jobs e a timeline não mostram trabalho pessoal. Para acompanhar o escritório, o dono usa a rota de estado.
- **Concorrência:** o limite de 2 por agente é conferido no `claim`, sem trava entre duas Pontes da mesma pessoa pegando ao mesmo tempo. Na V1 há uma Ponte por pessoa; com várias Pontes, o limite pode passar por um job, no pior caso.
- **Migration 0026:** vem depois da 0025 (acesso por área, PR #39), por isso esta PR está empilhada sobre a #39. Nenhum dado existente muda.
- **Fora desta etapa:**
  - a Ponte HZK (Etapa 2);
  - as ações com aprovação em lote ou bloqueio (P3);
  - a memória nativa e o standby (P6);
  - a tela final.
