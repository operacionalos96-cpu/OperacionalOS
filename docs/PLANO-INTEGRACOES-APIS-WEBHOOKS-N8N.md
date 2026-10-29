# Plano de integração — APIs, webhooks, automação e provedores de IA

## Decisão de escopo

Esta entrega documenta padrões e dependências; não cria novas integrações externas nem torna n8n obrigatório. O OperacionalOS já possui endpoints e tabelas de integração que devem ser reaproveitados antes de construir outra camada.

## Inventário estático do projeto

- `src/app/api/webhooks/[provider]/route.ts`: entrada de webhooks de venda Hotmart/Kiwify; valida segredo, limita tamanho do corpo e taxa, faz parse e registra a transação com prevenção de duplicação.
- `src/app/api/ai-office/[action]/route.ts`: ações de membro autenticado para enfileirar/repetir/cancelar jobs e gerenciar workers/webhooks.
- `src/app/api/workers/[tool]/route.ts`, `src/app/api/mcp/route.ts`, `src/app/api/ext/[action]/route.ts`: pontos de integração para workers, MCP e extensão.
- `src/app/api/integracoes/*`: conexão OAuth e sincronização das integrações de conteúdo já existentes.
- `src/lib/event-service.ts`: registro de eventos de domínio e feed realtime.
- `supabase/migrations/0011_job_queue.sql`: fila de jobs, idempotência, leases, retries, correlação, entregas de webhook e recebimentos deduplicados.
- `docs/INTEGRACOES.md`: configuração atual de YouTube/TikTok.

O inventário acima é leitura de código e migrations; não garante que variáveis, credenciais e serviços externos estejam configurados em produção.

## Envelope canônico de evento

Usar um envelope comum em eventos internos e webhooks, com versão explícita:

```json
{
  "id": "evt_<id> ou ID estável do provedor",
  "type": "lead.converted",
  "version": 1,
  "occurred_at": "2026-10-26T12:00:00.000Z",
  "source": "operacionalos",
  "workspace_id": "<workspace>",
  "actor": { "type": "human|agent|system|integration", "id": "<id>" },
  "entity": { "type": "lead", "id": "<id>" },
  "correlation_id": "<fluxo>",
  "causation_id": "<evento anterior ou null>",
  "idempotency_key": "<chave estável>",
  "data": {}
}
```

Não publicar dados pessoais ou segredos no payload por padrão. Quando necessário, enviar referências a registros e exigir autorização para buscar o conteúdo completo.

## Regras de entrada e saída

### Webhooks recebidos

1. Validar provedor conhecido, assinatura/segredo e timestamp quando o provedor suportar.
2. Limitar bytes, taxa e tipos de conteúdo; validar schema e versão.
3. Registrar receipt com ID externo único antes de efeitos de negócio.
4. Processar de forma idempotente; evento repetido deve responder sucesso sem duplicar efeitos.
5. Responder rapidamente após enfileirar trabalho durável; não executar tarefas longas dentro da requisição.
6. Registrar status, tentativas, código de erro e próxima tentativa; separar falha temporária de payload inválido.

### Webhooks enviados

1. URL HTTPS, lista explícita de eventos, segredo rotacionável e assinatura HMAC com timestamp.
2. Entrega assíncrona via fila, retries com backoff exponencial e jitter, limite de tentativas e dead letter.
3. Idempotência por `(webhook_id, event_id)`; guardar status HTTP e preview redigido da resposta.
4. **Implementado** — proteção SSRF (`src/lib/server/ssrf.ts`, `ssrf-rules.ts`): validação no cadastro e **no momento da conexão** (anti DNS rebinding), bloqueio de loopback/redes privadas/link-local/metadados, sem seguir redirecionamentos. Regra original: não permitir SSRF: validar DNS/IP e bloquear loopback, redes privadas, link-local e redirecionamentos para destinos proibidos; revalidar após redirects.
5. Interface de retry deve exigir permissão e registrar ator.

### APIs internas / ferramentas de IA

- Autenticação de usuário em ações humanas; tokens de worker por hash e escopos mínimos.
- Nunca confiar no front-end para decidir permissão ou entidade autorizada.
- Validar payloads no servidor, aplicar limite de tamanho e rate limit.
- Separar permissões de leitura, sugestão e execução; ações financeiras/comerciais sensíveis exigem aprovação humana.
- Não passar segredos de integração para o modelo. Fornecer ferramentas mediadas pelo servidor.

## Integração inicial proposta para validação técnica

**Piloto implementado e validado tecnicamente (29/10/2026):** ao marcar um lead como **Ganho**, o sistema (a) emite `lead.converted` para os webhooks de saída/n8n e (b) cria **uma** tarefa de onboarding e **um** recebimento previsto, vinculados ao lead e ao projeto, de forma idempotente (`src/lib/domain/won-lead.ts`, `src/lib/automations.ts`; testes em `won-lead.test.ts`). Validado no navegador: lead ganho → tarefa "Onboarding: <projeto>" + conta a receber com vencimento em 30 dias. Pendente de aceite humano: responsável e prazo padrão da tarefa. O fluxo n8n continua em modo de teste (acknowledgement) até aprovação.

Por que começar por aqui:
- Usa evento de domínio existente e o mecanismo de entregas de webhook já previsto.
- É fácil observar entrada, execução, falha e duplicação.
- A criação de tarefa é reversível e verificável; o fluxo deve primeiro operar em modo de teste.
- Evita escrever diretamente no banco do OperacionalOS a partir do n8n.

### Contrato inicial do evento

- Entrada: `lead.converted` com ID do lead, timestamp e `correlation_id`.
- Ação de teste: n8n recebe evento e retorna apenas um acknowledgement/log, sem alterar registros.
- Segunda fase, após aprovação: chamar endpoint autenticado de criação de tarefa com `idempotency_key` derivada do evento e escopo limitado.
- Resultado esperado: uma única tarefa por conversão, com vínculo ao lead/cliente, responsável definido por regra aprovada e histórico do evento causador.
- Falhas: 401/403 → bloquear e alertar; 400/422 → dead letter e revisão de contrato; 429/5xx/timeouts → retry com backoff.

## Contratos mínimos para manutenção

Cada integração nova deve ter documento contendo: proprietário, propósito, origem/destino, versão do contrato, autenticação, escopos, exemplos redigidos, limites, idempotência, retries, timeout, alertas, retenção, rollback e testes.

## Dependências e decisões pendentes

- Definir modelo de workspace/tenant e fronteiras de acesso; `private.is_member()` cobre associação de membro, mas não substitui política granular por setor.
- Confirmar se `SUPABASE_SECRET_KEY` e demais secrets estão configurados no ambiente de deploy; nunca colocar em `NEXT_PUBLIC_*`.
- Definir política de logs e retenção de payloads de IA/webhooks.
- Escolher quem administra o n8n, onde roda, quem tem acesso às credenciais e como exportar/versionar workflows.
- Escolher o primeiro caso de uso com o time e confirmar o responsável operacional.
- Executar teste de assinatura, replay, payload inválido, timeout, retry, duplicação e permissão antes de produção.
