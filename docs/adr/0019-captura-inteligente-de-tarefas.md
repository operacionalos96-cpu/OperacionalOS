# 0019. Captura inteligente de tarefas: IA só propõe, servidor valida, pessoa confirma

- **Status:** Proposto
- **Data:** 2026-11-05

## Contexto

O briefing "OperacionalOS — Captura Inteligente de Tarefas" (V1, 04/11/2026) pede um modo de entrada em que
um texto informal (uma ou várias tarefas, às vezes agrupadas por projeto) vira uma prévia editável com os
mesmos campos do formulário **Nova tarefa**, sem salvar nada antes da confirmação.

Fatos do código que pesaram:

- "Projeto" no app é um **nome livre** (`projectName`), normalizado por `canonicalProjectName`; não existe
  tabela de projetos com id. Responsáveis são `members.team_id`; leads são registros da tabela `leads`.
- Criar tarefa é `useStore().createTask` (otimista: grava em segundo plano e só avisa se falhar). Não há
  API de servidor para criar tarefa; a autorização está no banco (RLS, ADR 0005).
- Já existe IA no servidor (`src/lib/server/ai.ts`, Gemini por `fetch`) com autenticação por
  `requireMember` e limite por pessoa (`allowRequest`).
- Modelos erram contas de calendário ("sexta" → data) e às vezes inventam ids.

## Decisão

1. **Endpoint só de leitura:** `POST /api/ia/captura` (membro logado, 10/min e 200/dia por pessoa,
   texto até 6.000 caracteres). Ele lê o contexto **no servidor, com a sessão de quem pediu** (projetos
   usados em tarefas/notas/lançamentos, etiquetas, membros ativos, leads abertos), chama a IA e devolve
   propostas. **Não grava nada.** Log mínimo: provedor, modelo, tempo, tamanho, nº de tarefas e tokens —
   nunca o texto.
2. **Saída estruturada por JSON Schema** (`CAPTURE_SCHEMA` em `src/lib/domain/smart-capture.ts`), e o
   servidor **valida e normaliza tudo de novo** (`parseCaptureOutput` + `normalizeCapture`) — não
   confiamos no modelo nem quando o provedor garante o schema.
3. **O modelo descreve, o servidor decide:**
   - prazo: o modelo diz *o que o texto falou* (`today`, `weekday: sexta`, `date: 10/12`…); a data é
     calculada em `resolveDue` a partir do dia da captura no fuso **America/Sao_Paulo**, por tarefa;
   - projeto, responsável e lead: o modelo devolve o **nome como está no texto**; o servidor só liga a um
     registro real quando há **exatamente uma** correspondência (palavra inteira). Ambíguo ou não achado
     fica em branco e marcado para revisão — nenhum id vem do modelo;
   - pessoa citada vai para `mentioned_people`, não para responsáveis;
   - prioridade explícita preenche o campo; inferida vai só como **sugestão** visível ("Aplicar");
   - título: o modelo dá área (lista fechada de 7), entrega e ação; o servidor monta
     `ÁREA / Entrega - Ação` (`buildTaskTitle`).
4. **Provedor:** Claude (`claude-opus-5-5`, esforço `low`, `fallbacks: "default"` para recusas,
   instruções fixas em cache) quando houver `ANTHROPIC_API_KEY`; senão o Gemini já configurado, com o
   mesmo schema (`responseJsonSchema`). Motivos: confiabilidade do JSON (schema imposto pela API),
   política de dados (a API da Anthropic não usa os dados para treino; o plano gratuito do Gemini pode
   usar) e nenhuma tela muda se trocarmos. Custo estimado por captura com Claude: poucos centavos de dólar
   (≈3 mil tokens de entrada e até 2 mil de saída). `CLAUDE_MODEL` permite trocar o modelo sem código.
5. **Criação pelo fluxo existente:** a prévia cria cada tarefa com `createTaskConfirmed`, que usa o mesmo
   construtor do `createTask` (agora `newTask`), espera a gravação para mostrar resultado **por item** e
   recebe um **id fixo por item da prévia**. Repetir após erro ou timeout faz `upsert` do mesmo id: não
   duplica. Se a gravação falha, a tarefa sai da lista e o card fica com o erro e o botão "Tentar de novo".
6. **Nada se perde:** texto, prévia, edições e o estado de cada item ficam no `localStorage` deste
   navegador até "Concluir" ou "Cancelar" (conveniência local, não é fonte de verdade).
7. **Entrada:** opção "Estruturar com IA" dentro da Captura rápida, no menu "Novo" e no Ctrl+K. O modo
   "Uma linha" (caixa de entrada) e o formulário Nova tarefa continuam iguais.

## Consequências

- Mais fácil: capturar várias tarefas de vários projetos de uma vez, com títulos no padrão e datas certas.
- O modo demonstração (`NEXT_PUBLIC_SANDBOX=1`) não tem banco no servidor: lá, e só lá, a tela envia o
  contexto do banco local junto com o texto. Em produção esse campo é ignorado.
- Correspondência por palavra inteira é conservadora: "HZK" acha "HZK Company", mas apelidos que não
  aparecem no nome cadastrado ficam para a pessoa escolher. Preferimos pedir revisão a associar errado.
- Novo segredo opcional na Vercel (`ANTHROPIC_API_KEY`) e nova dependência (`@anthropic-ai/sdk`).
- Fora desta V1 (briefing, seção 10): voz, aprendizado com correções, subtarefas e dependências,
  criação sem confirmação, definição autônoma de responsáveis e prioridades.
- Depois: medir no log o tempo e os tokens por captura para decidir se um modelo menor basta.
