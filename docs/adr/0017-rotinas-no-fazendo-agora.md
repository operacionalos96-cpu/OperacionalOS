# 0017. Rotinas no "fazendo agora": a Prospecção aparece no online

- **Status:** Aceito
- **Data:** 2026-11-02

## Contexto

A prospecção é feita todos os dias, mas não é uma tarefa do quadro. Por isso não aparecia no online
("Fazendo: …") e não dava para pausá-la com motivo, como as tarefas (ADR 0010 e 0015).

## Decisão

1. **Rotina = sessão comum na linha do dia** (`daily_plans.data.sessions`), com id `rotina:…`
   (`ROUTINES` em `src/lib/domain/work-sessions.ts`). Fonte única, sem tabela nova e sem migration.
   - O time vê "Online · Fazendo: Prospecção desde 10:30", nos mesmos lugares de uma tarefa.
   - A rotina nunca muda a fase de uma tarefa.
2. **Na tela de Prospecção:** o botão "Começar prospecção" vira "Prospecção desde 10:30 · Pausar".
   - **Pausar:** abre os mesmos motivos (almoço, academia…) ou "só pausar".
   - **Voltar** (barra lateral): retoma a prospecção se ela foi a última coisa feita.
   - **Automático:** aprovar ou descartar um lead marca a prospecção, caso a pessoa esqueça de clicar.
3. **Começar uma tarefa** fecha a rotina, como acontece entre duas tarefas (uma coisa por vez).

## Consequências

- **Outras rotinas** (ex.: atendimento) entram com uma linha em `ROUTINES` e o mesmo `RoutineButton`.
- **Tempo da rotina** já conta no período do dia e na semana, junto com as tarefas.
- **Teste:** `my-day.test.ts` (rotina como sessão e pausa).
