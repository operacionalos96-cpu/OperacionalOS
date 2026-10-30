# 0006. Fatos de negócio no servidor: Outbox + consumidor idempotente

- **Status:** Aceito
- **Data:** 2026-10-30

## Contexto

A automação "Virou cliente" (lead ganho → tarefa de onboarding + recebimento previsto) rodava
**no navegador** (`src/lib/automations.ts`), dentro de quem estivesse com o app aberto:
- **Sem ninguém online, nada acontecia.** Leads ganhos por integração ou por API ficavam sem
  onboarding.
- **Com dois sócios online**, as duas abas reagiam ao mesmo fato e podiam criar registros em dobro.
  A checagem de "já existe?" de cada aba olhava só o estado local dela.

O projeto já tinha a infraestrutura certa no banco, criada para o AI Office:
- a tabela `events`, imutável;
- o gatilho que transforma evento em job;
- a fila `ai_jobs`, com lease, retry, dead letter e chave de idempotência.

Fundamentos:
- **Transactional Outbox** (Richardson, *Microservices Patterns*, 2018): o fato e a "intenção de
  reagir" são gravados juntos, na mesma transação. O efeito acontece depois, de forma confiável.
- **Idempotent Receiver** (Hohpe & Woolf, *Enterprise Integration Patterns*, 2003) e Kleppmann
  (*Designing Data-Intensive Applications*, 2017): a entrega é "pelo menos uma vez", então o
  consumidor precisa produzir o mesmo resultado se receber a mesma mensagem duas vezes.
- **Aberto/fechado** (Meyer, 1988): automação nova se acrescenta sem reescrever as existentes.

## Decisão

1. **Fato de negócio no servidor; reação de tela no navegador.** O que muda dados (criar tarefa,
   lançamento) roda no servidor. O que é só interface (toast, comemoração de meta) continua no
   navegador.
2. **Fluxo:**
   - o evento `lead.converted` é gravado em `events`;
   - o gatilho `private.on_event_automations` (migration 0020) enfileira o job `auto_won_lead`, com
     a capability `system` e a chave `auto_won_lead:<lead>`;
   - `runSystemJobs` (`src/lib/server/automations.ts`) pega o job e aplica a regra pura
     `wonLeadRecords` (`src/lib/domain/won-lead.ts`);
   - a tarefa e o lançamento são gravados com **id estável por lead** (`won-task-<lead>`), em modo
     "insere se não existir".
3. **Quem executa:**
   - o agendador `/api/runner/tick`, a cada minuto, é a garantia;
   - `POST /api/automacoes/processar`, chamado pelo navegador logo após a ação, é a rapidez.
   As duas formas podem rodar juntas sem duplicar: a lease garante um executor por job, e o id
   estável garante um registro por lead.
4. **O gatilho de automações é separado** do gatilho de IA, vídeo e webhooks
   (`private.on_event_inserted`). Automação nova = um `if` no gatilho da 0020 + um handler em
   `HANDLERS`, com a regra no domínio e teste.
5. **Erros:** dado que não existe mais vai direto para a dead letter (`PermanentError`). Falha
   passageira tenta de novo com backoff (`afterFailure`, que já existia). Os jobs aparecem no monitor
   do AI Office, onde é possível reprocessar.

## Consequências

- A automação roda com ou sem alguém online, e uma vez só.
- O resultado leva de 1,5 s (chamada direta) a 1 min (agendador) para aparecer, e não é mais
  instantâneo. O tempo real do Supabase entrega a tarefa na tela quando ela é criada.
- **Ordem de implantação:**
  1. publicar o código primeiro (o navegador para de criar os registros);
  2. aplicar a migration 0020 em seguida.

  Entre os dois passos, um lead ganho fica sem onboarding automático. Ele é recuperável marcando o
  lead de novo como ganho.
- **Modo demonstração** (`NEXT_PUBLIC_SANDBOX=1`): não tem servidor nem fila, então aplica a mesma
  regra no navegador.
- **Próximos candidatos:** "Meta batida" pode virar notificação persistida, e lançamento recorrente
  pode ser gerado pelo servidor. Seguem o mesmo padrão.
