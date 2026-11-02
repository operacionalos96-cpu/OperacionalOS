# 0015. Online confiável, pausa com motivo e avisos para CEO e founders

- **Status:** Aceito
- **Data:** 2026-11-01

## Contexto

Os founders pediram três coisas:
1. o online/offline precisa funcionar de verdade;
2. ao pausar uma tarefa, dizer o motivo (almoço, academia, dentista…), registrado e visível para cada
   colaborador;
3. ver na hora quem fez o check-in, quem começou uma tarefa e quem pausou, com pop-up e, no
   check-in, também um som.

**O que vimos no online:** o canal de presença (`presenca-time`) conecta e lista quem está com o app
aberto. Sondamos de fora, só ouvindo.
- O problema é a aba em segundo plano. Depois de 5 minutos escondida, o Chrome limita os timers da
  página a uma vez por minuto (*intensive throttling*, developer.chrome.com/blog/timer-throttling-in-chrome-88).
- O heartbeat do Supabase Realtime (25 s) atrasa, o servidor derruba a conexão e a pessoa aparece
  offline com o app aberto.

## Decisão

1. **Heartbeat num Web Worker** (`realtime: { worker: true }` no cliente do navegador).
   - O Worker não sofre a limitação de timers da aba escondida. É a solução da própria Supabase
     (Realtime › *Heartbeats*).
   - **Reanúncio:** ao voltar para a aba ou para a internet, a pessoa se anuncia de novo na hora
     (`track`).
   - **Saída:** ao fechar a aba, sai na hora (`untrack` no `pagehide`).
2. **Pausa com motivo na linha do dia** (`daily_plans.data.pauses`), ao lado das sessões de tarefa da
   ADR 0010. Fonte única, sem tabela nova e sem migration.
   - **Pausar:** fecha a tarefa em andamento e abre a pausa.
   - **Voltar:** começar ou retomar uma tarefa fecha a pausa.
   - **Motivos:** Almoço, Café/intervalo, Academia, Médico/dentista, Compromisso pessoal e Outro (com
     texto).
   - **"Só pausar a tarefa":** continua existindo, para parar sem sair.
   - **Status "Em pausa":** novo status de presença (`presenceOf`). Fica abaixo da agenda (reunião,
     compromisso, foco e ausência vencem) e acima de online e de "no expediente".
   - **Com o app fechado:** a pausa vale mesmo assim (saiu para almoçar).
   - **Onde aparece:** "Time agora", Equipe e avatares, como "Em pausa · Almoço desde 12:10". A
     página da pessoa mostra as pausas no período do dia, sem contar como tempo trabalhado.
3. **Avisos de presença para quem lidera** (`src/lib/presence-alerts.ts`).
   - **Origem:** as mudanças da linha do dia que já chegam em tempo real viram pop-up, pela regra pura
     `dayChanges`: check-in, início de tarefa e pausa.
   - **Quem recebe:** só a CEO e os founders (`peopleFrom`), e nunca a própria pessoa.
   - **Ao abrir o app:** a primeira carga é a base, então o que já estava no banco não vira aviso.
   - **Som:** o check-in toca dois tons curtos (Web Audio, sem arquivo). O navegador só libera som
     depois do primeiro clique ou tecla na página.
   - **Nada é gravado:** quem não estava com o app aberto vê o estado atual e o registro do dia.

## Consequências

- **Sem migration:** a pausa vive no JSON da linha do dia, que todos já leem e cada um grava só a
  própria (RLS da migration 0022).
- **Sem CEO definida, só os founders recebem os avisos.** Quando houver alguém com o cargo "ceo" em
  Equipe › Cargos, essa pessoa passa a receber também.
- **Sem histórico de avisos:** se for preciso guardar os pop-ups, a próxima etapa é gravá-los na
  tabela `notifications` (ADR 0010), que já existe e tem tempo real.
- **Testes:** `my-day.test.ts` (regras de pausa, status e mudanças do dia) e `presence-alerts.test.ts`
  (quem recebe e quando).
