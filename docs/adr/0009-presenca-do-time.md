# 0009. Presença do time: agenda, app aberto e check-in do dia

- **Status:** Aceito
- **Data:** 2026-10-31

## Contexto

A CEO e os founders querem saber, sem ligar para ninguém, se cada pessoa está disponível, em
reunião, em compromisso ou fora. Isso deve ser automático quando der e semiautomático quando não der,
com um check-in no começo do dia. Também pediram o agendamento de reuniões na área da Equipe. O Google
Calendar ficou para depois (resposta de 31/10), então a agenda é interna, no Supabase.

## Decisão

1. **Um status por pessoa, por prioridade**, calculado por `presenceOf` em
   `src/lib/domain/presence.ts`, uma função pura e testada:

   | Prioridade | Status | Fonte |
   |---|---|---|
   | 1 | Ausente | evento "ausência" na agenda |
   | 2 | Em reunião | reunião agora, como dono ou participante |
   | 3 | Em compromisso | evento "compromisso" agora |
   | 4 | Em foco | bloco de foco agora |
   | 5 | Online | app aberto agora |
   | 6 | No expediente | check-in feito e dentro do horário informado |
   | 7 | Offline | — |

   A agenda vence o "app aberto": quem está em reunião não está disponível, mesmo com o app aberto.
2. **"Online" é presença em tempo real** (Supabase Realtime Presence, `src/lib/presence.ts`). Cada aba
   aberta entra num canal com o `team_id` e sai sozinha ao fechar. **Nada é gravado no banco**, então
   não há escrita a cada minuto nem dado pessoal acumulado.
3. **Agenda interna** (`calendar_events`, migration 0022): reunião, compromisso, foco e ausência.
   - Todos veem; operator ou acima agenda.
   - O conflito de horário é avisado antes de salvar (`conflictsFor`), sem bloquear.
4. **Check-in do dia** (`daily_plans`, mesma migration):
   - pede o horário de hoje e o foco, num cartão discreto, uma vez por dia;
   - feito ou pulado, só volta no dia seguinte;
   - cada um grava só o próprio, inclusive quem só visualiza; todos leem;
   - a linha do dia é a mesma que o ritual "Fechar o dia" (Fase 2) vai completar.
5. **O status sempre aparece com texto** ("Em reunião até 15:00"), nunca só com a cor do ponto.

## Consequências

- **O status muda sozinho** quando uma reunião começa ou termina: o relógio da tela anda de minuto em
  minuto.
- **"No expediente" depende de a pessoa fazer o check-in.** Sem ele, quem está com o app fechado
  aparece como offline. Escolhemos não inferir presença por e-mail ou por outros sinais.
- **Google Calendar:** quando entrar, preenche a mesma `calendar_events` e as telas não mudam.
- **Próxima etapa:** a Fase 2 usa estas peças no Início "Meu Dia":
  - agenda de hoje;
  - "Time agora";
  - foco do dia;
  - a lista do dia no estilo da tela "Hoje" do creator no HZK Workspace.
