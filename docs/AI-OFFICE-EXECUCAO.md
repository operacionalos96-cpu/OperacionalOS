# AI Office — camada de execução (decisões de arquitetura)

Sem nenhuma API de IA paga. Claude, ChatGPT, Gemini (assinaturas) e automações entram como
**workers** por MCP ou REST. O sistema só organiza o trabalho; quem pensa é o worker.

```
EVENTO (events) ──gatilho no banco──► JOB (ai_jobs, idempotency_key única)
                                        │
          push disponível? ── sim ──► webhook assinado (webhook_deliveries, retry/backoff/DLQ)
                │ não
                ▼
      polling inteligente (poll.retry_after_seconds, decidido pelo servidor, sem IA)
                ▼
      CLAIM ATÔMICO + LEASE (claim_next_job: UPDATE … FOR UPDATE SKIP LOCKED)
                ▼
      start → renew/progress → complete (schema validado) | fail (retry/backoff ou DLQ) | release
                ▼
      efeito no domínio NA MESMA transação (ex.: análise gravada no lead) + EVENTO (lead.analyzed)
                ▼
      próximo workflow (ex.: lead.rejected → analyze_human_feedback → hypothesis.created)
```

## Decisões

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Fila | Postgres (`ai_jobs`), não serviço externo | Já temos transações; menos peças, sem custo |
| IDs | ULID com prefixo (`job_`, `evt_`, `wrk_`, `wh_`, `dlv_`, `hyp_`) gerado no banco/servidor | Único, ordenável, não incremental; IDs antigos continuam valendo |
| Idempotência | `idempotency_key UNIQUE` + `ON CONFLICT DO NOTHING`; entregas `UNIQUE(webhook_id, event_id)`; recebidos `PK(source, event_id)` | Proteção no banco, não só no código |
| Claim | Uma única instrução `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1)` | Dois workers nunca levam o mesmo job |
| Lease | `lease_id` + `lease_expires_at`; start/renew/progress/complete/fail/release exigem os dois válidos | Worker que perdeu o lease não conclui |
| Leases vencidos | `reap_expired_leases()` roda a cada claim e a cada minuto (pg_cron); evento `job.lease_expired` | Nenhum job fica preso |
| Retry | Backoff exponencial 1, 2, 4, 8… min com teto e ±20% de jitter, decidido no servidor | Sem acordar todos juntos; sem polling agressivo |
| Dead letter | Esgotou tentativas → `dead_letter` (jobs e entregas); humano: tentar de novo / cancelar / inspecionar | Nada some |
| Resultado | Schema por `job_type` validado ANTES do complete; `result` + `raw_result`; efeito aplicado na mesma transação | Nunca "completed" sem resultado persistido |
| Webhooks | HMAC-SHA256 `v1=hex(HMAC(secret, timestamp + "." + corpo))`, cabeçalhos Event-ID/Delivery-ID/Timestamp; janela 5 min; tempo constante; segredo criptografado (AES-GCM) e rotação com segredo anterior aceito | Padrão de mercado; replay barrado pelo banco |
| Push × polling | Webhook quando o worker pode receber; senão polling adaptativo (3 s com fila; 30 s → 1 → 5 → 15 min vazia) e long polling até 25 s | Consultar fila é barato e determinístico; IA só acorda com job real |
| Agendador | `pg_cron` + `pg_net` do Supabase a cada minuto → `/api/runner/tick` (CRON_SECRET) | Vercel grátis só agenda 1×/dia |
| MCP | `/api/mcp` (Streamable HTTP, JSON-RPC, sem sessão) e REST `/api/workers/<ferramenta>` com a MESMA lista de ferramentas | Uma regra só; funciona em Claude Code/Desktop e automações |
| Autenticação | Token por worker (`oos_…`), só o hash no banco, mostrado 1 vez; escopos por ferramenta; limite 240 req/min | OAuth para conectores web fica para a próxima etapa |
| Conteúdo externo | `get_job_context` marca lead/site como NÃO CONFIÁVEL; nada nele muda escopo; sem telefone no contexto | Prompt injection não vira permissão |
| Correlação | `correlation_id = "lead:<id>"` em todos os eventos/jobs do lead; `causation_id` = evento/job que causou | História completa rastreável |
| Auditoria | Toda mudança de job vira evento `job.*` (quem, engine, tentativa, erro), sem segredos | Timeline do Job Monitor |
| Saúde | online < 2 min de heartbeat, ocioso < 30 min, offline depois | Só afirma o que tem evidência |

## Arquivos

- Regras puras + testes: `src/lib/domain/jobs.ts`, `src/lib/server/webhook-signing.ts`
- Banco: `supabase/migrations/0011_job_queue.sql` (fila, workers, webhooks, gatilhos, funções), `0012_agendador.sql`
- Servidor: `src/lib/server/jobs.ts` (serviço), `workers.ts` (tokens/escopos), `worker-tools.ts` (ferramentas), `webhooks.ts` (entrega/recepção)
- Rotas: `/api/mcp`, `/api/workers/[tool]`, `/api/runner/tick`, `/api/ai-office/[action]` (ações humanas)
- Telas: AI Office → AI Workforce, Jobs, Webhooks, Workers
- Testes no Postgres real (PGlite): `src/lib/server/queue-sql.test.ts`; webhook com servidor HTTP real: `webhooks.test.ts`

## Conectar um worker

1. AI Office → Workers → Novo worker (agente, engine, capabilities, permissões) → copie o token (aparece 1 vez).
2. MCP: servidor `https://operacional-os.vercel.app/api/mcp`, cabeçalho `Authorization: Bearer <token>`.
3. Ciclo: `claim_next_job` → `get_job_context` → `start_job` → (`renew_lease` a cada ~1/3 do prazo, `report_progress`)
   → `complete_job` com o resultado no schema (ou `fail_job`). Sem job: espere `poll.retry_after_seconds`.

## Tipos de job

| job_type | Agente | Precisa | Nasce de | Resultado |
| --- | --- | --- | --- | --- |
| `analyze_website` | Web Analyst | `web`, `mcp_write` | `lead.created` com site e sem análise | summary, problems[], opportunities[], qualification_score 0–10, confidence 0–1, site_score? → vira a análise do lead + `lead.analyzed` |
| `analyze_human_feedback` | Intelligence | `reasoning`, `mcp_read` | `lead.rejected` | patterns[], hypotheses[] (com proposed_test) → hipóteses "proposta" para aprovação humana |
| `render_prospect_video` | Video Studio (worker local, `workers/video`) | `video_render` | lead chegou na parte do vídeo do funil (`lead.replied`/`lead.followup_sent` ou mudança do funil; SQL 0013) | video_path, duration_sec, findings[] → `lead.video` "pronto"; humano aprova antes da extensão anexar |

Tipo novo = entrada em `JOB_TYPES` (`src/lib/domain/jobs.ts`) + regra no gatilho `private.on_event_inserted` + (se mexer no domínio) caso em `private.apply_job_result`.
