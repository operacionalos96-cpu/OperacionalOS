# 0011. Check-in semanal e Semana do time

- **Status:** Aceito
- **Data:** 2026-10-31

## Contexto

O blueprint troca a reunião de status por um ritual assíncrono:
- **Segunda:** o foco da semana.
- **Sexta:** o que saiu, o que travou e o que precisa de alguém.

As respostas ficam juntas numa página **Semana do time**. A ADR 0010 deixou isso para um segundo PR
da Fase 2.

## Decisão

1. **Só as respostas são guardadas:** tabela `checkins` (0024), uma linha por pessoa, semana e tipo
   (`<team_id>:<segunda>:<segunda|sexta>`).
   - Cada um grava só a própria, inclusive quem só visualiza. Todos leem. É a mesma regra do
     check-in do dia.
2. **O "feito" é derivado** (`weekSummary` em `src/lib/domain/weekly.ts`). Vem do que já existe:
   - tarefas concluídas na semana;
   - decisões tomadas;
   - minutos do "fazendo agora" por área (`daily_plans.sessions`).

   Nada é digitado duas vezes.
3. **Quando perguntar** (`weeklyAsk`): o pergunta aparece no Guia do dia.
   - O foco: de segunda a quarta, para quem faltou na segunda.
   - A retrospectiva: na sexta a partir das 14h e no fim de semana.
4. **"Precisa de alguém"** marca pessoas, que recebem um aviso em "Esperando por você".

## Consequências

- **Semanas anteriores:** a página mostra qualquer semana, porque as respostas ficam guardadas e o
  feito é recalculado.
- **O tempo por área** depende de cada um usar o ▶. Sem isso, a página mostra só as tarefas e as
  decisões.
