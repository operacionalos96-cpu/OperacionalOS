# 0010. Meu Dia: uma lista do dia, "fazendo agora", daily e agenda

- **Status:** Aceito
- **Data:** 2026-10-31

## Contexto

A Fase 2 do blueprint refaz a Início como "Meu Dia". A Início antiga montava duas listas das
mesmas tarefas (`attentionItems` e `myAgenda`): uma tarefa atrasada aparecia nos dois blocos, e o
Guia do dia tinha a sua própria lista. Em 31/10 o time também pediu:

- **ver o que cada um está fazendo** e o que fez em cada período do dia;
- **daily:** liberar o "pronto" quando os três fizerem o check-in;
- **um cartão por setor** com o botão que leva à aba da ação;
- **um calendário** com página própria;
- **mais adiante, sessões do dia por tipo** (comercial, conteúdo…).

## Decisão

1. **Uma função, um item por bloco.** `myDay()` (`src/lib/domain/my-day.ts`) monta os blocos da
   Início e a lista do Guia do dia (`dayPlan(myDay)`).
   - **Plano do dia:** em três grupos (Atrasado, Hoje, Se sobrar tempo).
   - **Selos:** o atraso é um selo dentro do item, não uma seção à parte.
   - **Teste:** prova que nenhum item aparece em dois blocos.
   - **Saíram:** `attentionItems` e `myAgenda`.
   - **Painéis da empresa:** saíram da Início. Caixa, metas e pipeline ficam nas próprias telas; o
     movimento da equipe foi para a Equipe.
2. **Tudo do dia de uma pessoa fica na linha do dia dela** (`daily_plans`, 0022, que só ela grava):
   - check-in;
   - foco;
   - `sessions`: o "fazendo agora" é a sessão sem fim;
   - `readyAt`, o pronto para a daily;
   - `closedAt`;
   - `noteFromYesterday`, gravada na linha de amanhã ao fechar o dia.

   Nenhuma tabela nova para isso, e nenhuma escrita a cada minuto.
3. **Fazendo agora**, regras em `work-sessions.ts`:
   - **Começar:** ▶ abre uma sessão e fecha a anterior (uma por vez), e marca a tarefa "em
     andamento".
   - **Pausar ou concluir:** fecha a sessão.
   - **Para o time:** a presença mostra "Fazendo: X desde 10:20", e a página da pessoa mostra o
     período do dia (manhã, tarde e noite, com os minutos).
4. **Daily** (`daily.ts`): o "Estou pronto" só libera quando todos que não estão ausentes na agenda
   fizeram o check-in. Com todos prontos, aparece "Entrar na reunião".
   - **Horário e link:** ficam em `team_settings` (0023, admin edita).
   - **Aviso:** quem completa o grupo avisa os outros.
5. **Próximo passo por setor** (`sectors.ts`): cada cartão usa a mesma regra da tela do setor, então
   o número bate com o que a tela mostra. O botão abre a aba exata (`?aba=`).
6. **Agenda** (página própria): junta eventos, prazos de tarefas e prazos de conteúdos, sem guardar
   nada (`agenda.ts`). A aba Agenda da Equipe leva para ela.
7. **Sessões:** um bloco de foco ganha `areaId` ("Sessão comercial 9–11"). Durante a sessão, as
   tarefas da área sobem no Plano do dia. A agenda combinada do time (`team_settings.daySessions`)
   vem depois e vai usar a mesma peça.

## Consequências

- **Uma regra para cada coisa:** mudar o que é "plano do dia" muda a Início e o guia juntos.
- **O "fazendo agora" depende de a pessoa apertar ▶.** Não inferimos pelo uso do app.
- **"Esperando por você" lê os avisos** (`notifications`, 0021), que até aqui eram gravados e não
  apareciam em lugar nenhum. Lido = dispensado (apagado), para a lista não crescer.
