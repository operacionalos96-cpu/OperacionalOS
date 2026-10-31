# 0008. Item único do HZK OS guardado na tabela de tarefas

- **Status:** Aceito
- **Data:** 2026-10-31

## Contexto

O blueprint do HZK OS ([`docs/hzk-os-blueprint.md`](../hzk-os-blueprint.md)) pede um **item único**:
tarefa, ideia, decisão e nota rápida numa fonte só, com as telas como filtros. Isso acaba com
duplicações como a da Início. Ele sugere uma tabela nova `items` e migrar as tarefas para ela.

Em 31/10/2026, a tabela `tasks` já tinha:
- recorrência, checklist, responsáveis, projeto e prioridade;
- ligações com metas, mapas, relações entre entidades e a automação "Virou cliente" (ADR 0006);
- 32 telas lendo `useStore.tasks`.

Uma tabela nova obrigaria a migrar dados e reescrever essas ligações, com risco de quebrar o que
funciona e de conflitar com o outro programador.

## Decisão

1. **A tabela `tasks` é o item único.** Cada registro ganha `kind` (task, idea, decision, note) e os
   campos do blueprint: área, caixa de entrada, estimativa, planejado para, ordem, origem e decisão.
   Todos são opcionais: registro sem `kind` é uma tarefa, então nada precisa migrar.
2. **Decisão é extensão do item** (`kind: "decision"` + campo `decision`), o mesmo 1-para-1 do
   blueprint, sem tabela paralela. As regras ficam em `src/lib/domain/items.ts`:
   - `routeDecision`: porta de mão única ou dupla, limite em R$, cargo de CEO e ok do outro dono;
   - `triage`: o que um item da caixa de entrada vira;
   - `inInbox`: o que está na caixa de entrada.
3. **A store separa a mesma tabela em duas listas:**
   - `tasks`: tarefas de trabalho já triadas, iguais às de antes;
   - `items`: caixa de entrada, ideias, decisões, notas rápidas e arquivados.

   Assim nenhuma das telas que leem `tasks` muda de comportamento. A triagem move o item de lista
   sozinha (`placeItem`), e o tempo real segue a mesma regra.
4. **Áreas** (`areas`) e **avisos** (`notifications`) são tabelas novas (migration 0021).
5. **Pessoas** continuam vindo de `members`, e os cargos de `member_roles` (ADR 0007): CEO e
   founders são cargos. Não criamos `profiles`.

## Consequências

- **Sem migração de dados nem quebra das ligações**: tarefas antigas continuam sendo tarefas.
- **O nome da tabela (`tasks`) não diz tudo o que ela guarda.** O tipo `Task` e este ADR documentam
  isso. Renomear a tabela fica para quando a store migrar para `createCollection` (ADR 0007, passo 2).
- **O que entra na caixa de entrada:** só o capturado e ainda não triado, ou sem dono. Tarefas
  antigas sem prazo não entram, para não lotar a caixa no primeiro dia. É um desvio consciente da
  frase "sem dono ou sem data" do blueprint.
- **Busca e entidades:** a busca (Ctrl+K) continua listando só tarefas de trabalho. Ideias e
  decisões ganham entrada própria nas fases seguintes.
