# 0016. Worker do tempo real liberado na CSP

- **Status:** Aceito
- **Data:** 2026-11-01

## Contexto

Depois da ADR 0015, o online e os avisos de check-in pararam de funcionar. Nada chegava em tempo real.

**A causa:** a ADR 0015 ligou `realtime: { worker: true }`, e o Supabase cria esse Worker a partir de
um `blob:`. A CSP do app (`next.config.ts`) não tinha `worker-src`, então valia o `script-src 'self'`,
que não aceita `blob:` (MDN, *worker-src*; W3C, *Content Security Policy Level 3*). A partir daí:

1. o navegador bloqueava o Worker;
2. o `realtime-js` tratava o erro do Worker chamando `disconnect()`;
3. esse `disconnect()` é uma desconexão manual: a biblioteca não tenta reconectar.

Uma única conexão atende todos os canais. Por isso caíram juntos a presença (`presenca-time`), as
mudanças do banco (`operacional-sync`, de onde vêm os avisos de check-in) e o restante do tempo real.
Todo mundo aparecia offline, sem nenhum erro visível na tela.

**Por que passou:** a sondagem da ADR 0015 foi feita de fora do app, sem a CSP. Testes de unidade
também não passam pela CSP.

**Reprodução** (`/login`, sem login, com a chave pública, em canais temporários):

| | Antes | Depois |
|---|---|---|
| Conexão | fecha em 1,6 s (`socket closed: 1005`) e fica `closed` | `open`, com Worker ativo |
| Presença | `CHANNEL_ERROR` | `SUBSCRIBED`, duas abas se enxergam |
| Mudanças do banco | `CHANNEL_ERROR` | `Subscribed to PostgreSQL`, 25 tabelas, inclusive `daily_plans` |

## Decisão

Acrescentar `worker-src 'self' blob:` à CSP e manter o Worker. Ele continua sendo a solução da
Supabase para a aba em segundo plano (*Realtime Heartbeat Messages*).

- **`blob:` só em `worker-src`.** O `script-src` não muda, então scripts da página continuam sem
  poder vir de `blob:`.
- **Alternativa descartada:** copiar o script do Worker para `public/` e usar `workerUrl`, que
  dispensaria o `blob:`. Seria uma cópia de código da biblioteca para manter em dia a cada
  atualização, por pouco ganho: o `script-src` já tem `'unsafe-inline'`.
- **`src/lib/csp.test.ts`:** quebra se a diretiva sair. É o teste que faltava entre a CSP e o
  `worker: true`.

## Consequências

- O online, os avisos e todo o tempo real voltam sem migration.
- Eventos ocorridos enquanto a conexão estava fora não são reenviados, como antes. Quem ficou
  desconectado vê o estado novo ao recarregar.
- Regra para o futuro: mudança no cliente do navegador que crie Worker, iframe ou conexão nova deve
  ser testada no app rodando, com a CSP ativa.

## Fontes

- MDN, *CSP: worker-src*: developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/worker-src
- W3C, *Content Security Policy Level 3*: www.w3.org/TR/CSP3/
- Supabase, *Realtime Heartbeat Messages*: supabase.com/docs/guides/troubleshooting/realtime-heartbeat-messages
- `@supabase/realtime-js` 2.117.2, `RealtimeClient._startWorkerHeartbeat`
