/**
 * Testes da fila NO POSTGRES DE VERDADE (PGlite: Postgres 17 rodando dentro do teste).
 * Roda as migrations 0010 e 0011 sobre um "Supabase mínimo" e prova: idempotência no banco,
 * claim único, capabilities, lease (renovar, expirar, worker antigo bloqueado), retry/backoff,
 * dead letter + recuperação, gatilho evento→job, resultado aplicado, webhooks e anti-replay.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

let db: PGlite
const sql = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows
const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await sql<T>(q, params))[0]
const mig = (f: string) => readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8")

type Job = { public_id: string; status: string; lease_id: string | null; attempt_count: number; claimed_by: string | null; correlation_id: string | null; causation_id: string | null }

beforeAll(async () => {
  db = new PGlite()
  // "Supabase mínimo": papéis, schema private, membro, carimbo, publicação de tempo real e as tabelas que já existiam.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create function private.is_member() returns boolean language sql as 'select true';
    create function private.stamp() returns trigger language plpgsql as 'begin new.updated_at := now(); return new; end';
    create publication supabase_realtime;
    create table public.leads (id text primary key, data jsonb not null, updated_at timestamptz default now(), updated_by uuid);
  `)
  await db.exec(mig("0010_ai_office.sql"))
  await db.exec(mig("0011_job_queue.sql"))
  await db.exec(mig("0011_job_queue.sql")) // rodar de novo não quebra (idempotente)
}, 60_000)

const enqueue = (key: string, caps: string[] = ["web"], maxAttempts = 3) =>
  one<{ job: string; created: boolean }>(
    `select (job).public_id as job, created from public.enqueue_job('analyze_website','web-analyst','lead','L1','{}'::jsonb,$1,'u1',50,$2,$3)`,
    [key, maxAttempts, caps],
  )
const claim = (worker: string, caps: string[] = ["web", "mcp_write", "reasoning", "mcp_read"]) => one<Job>(`select * from public.claim_next_job($1, $2, null, 600)`, [worker, caps])
const job = (id: string) => one<Job & { result: unknown; error: string | null; available_at: string; max_attempts: number }>(`select * from public.ai_jobs where public_id = $1`, [id])
const clear = () => db.exec(`delete from public.webhook_deliveries; delete from public.webhooks; delete from public.events; delete from public.ai_jobs; delete from public.leads; delete from public.hypotheses;`)

describe("fila no Postgres", () => {
  it("idempotency_key duplicada não cria outro job (teste 11)", async () => {
    await clear()
    const a = await enqueue("analyze_website:L1:v1")
    const b = await enqueue("analyze_website:L1:v1")
    expect(a.created).toBe(true)
    expect(b).toEqual({ job: a.job, created: false })
    expect((await one<{ n: number }>(`select count(*)::int n from public.ai_jobs`)).n).toBe(1)
  })

  it("dois workers no mesmo job: só um leva (teste 1); com 2 jobs, cada um leva um diferente", async () => {
    await clear()
    await enqueue("k1")
    const [a, b] = [await claim("wrk_A"), await claim("wrk_B")]
    expect(a?.status).toBe("claimed")
    expect(b).toBeUndefined()
    await enqueue("k2")
    const c = await claim("wrk_B")
    expect(c.public_id).not.toBe(a.public_id)
  })

  it("worker sem a capability exigida não recebe o job (teste 12)", async () => {
    await clear()
    await enqueue("k-cap", ["web", "mcp_write"])
    expect(await claim("wrk_R", ["web", "mcp_read"])).toBeUndefined()
    expect((await claim("wrk_W", ["web", "mcp_write"]))?.status).toBe("claimed")
  })

  it("lease: worker morre após claim → lease expira → volta para a fila; worker antigo não conclui (testes 6, 7, 8 e 15)", async () => {
    await clear()
    const { job: id } = await enqueue("k-lease")
    const a = await claim("wrk_A")
    await sql(`select public.start_job($1, $2, 'claude')`, [id, a.lease_id])
    // lease errado é recusado
    await expect(sql(`select public.complete_job($1, gen_random_uuid(), '{}'::jsonb)`, [id])).rejects.toThrow(/lease_lost/)
    // worker "morre": o prazo passa sem renovar
    await db.exec(`update public.ai_jobs set lease_expires_at = now() - interval '1 second' where public_id = '${id}'`)
    await expect(sql(`select public.complete_job($1, $2, '{}'::jsonb)`, [id, a.lease_id])).rejects.toThrow(/lease_expired/)
    // outro worker consulta: o vencido é recolhido e ele assume com lease NOVO
    const b = await claim("wrk_B")
    expect(b.public_id).toBe(id)
    expect(b.lease_id).not.toBe(a.lease_id)
    expect((await one<{ n: number }>(`select count(*)::int n from public.events where event_type = 'job.lease_expired' and entity_id = $1`, [id])).n).toBe(1)
    // o antigo, mesmo "acordando", não consegue concluir
    await expect(sql(`select public.complete_job($1, $2, '{}'::jsonb)`, [id, a.lease_id])).rejects.toThrow(/lease_lost/)
    // renovar com o lease certo funciona; o novo conclui
    await sql(`select public.renew_lease($1, $2, 600)`, [id, b.lease_id])
    await sql(`select public.complete_job($1, $2, '{"ok":true}'::jsonb)`, [id, b.lease_id])
    expect((await job(id)).status).toBe("completed")
  })

  it("falha: retry agendado (não pega antes da hora) → esgota tentativas → dead letter → humano tenta de novo (testes 9, 10 e 15)", async () => {
    await clear()
    const { job: id } = await enqueue("k-retry", ["web"], 2)
    let w = await claim("wrk_A")
    await sql(`select public.fail_job($1, $2, 'site fora do ar', now() + interval '2 minutes')`, [id, w.lease_id])
    expect((await job(id)).status).toBe("retry_scheduled")
    expect(await claim("wrk_A")).toBeUndefined() // ainda não chegou a hora
    await db.exec(`update public.ai_jobs set available_at = now() - interval '1 second' where public_id = '${id}'`)
    w = await claim("wrk_A")
    expect(w.attempt_count).toBe(2)
    await sql(`select public.fail_job($1, $2, 'de novo', now() + interval '4 minutes')`, [id, w.lease_id])
    const dead = await job(id)
    expect(dead.status).toBe("dead_letter") // 2 de 2 tentativas
    expect(dead.error).toBe("de novo")
    await sql(`select public.retry_job($1, 'u2')`, [id])
    expect((await job(id)).status).toBe("queued")
    expect((await claim("wrk_A"))?.public_id).toBe(id)
  })

  it("evento → job pelo gatilho, sem duplicar; resultado aplicado no lead com correlação e causa (cenário 27)", async () => {
    await clear()
    await db.exec(`insert into public.leads (id, data) values ('L9', '{"id":"L9","name":"Costa Lion"}')`)
    const ev = `insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata) values ($1, 'lead.created', 'lead', 'L9', 'human', 'u1', '{"name":"Costa Lion","website":"https://x.com.br"}')`
    await sql(ev, ["evt_00000000000000000000000001"])
    await sql(ev, ["evt_00000000000000000000000002"]) // evento repetido (retry/webhook duplicado)
    const jobs = await sql<Job & { job_type: string }>(`select * from public.ai_jobs`)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ job_type: "analyze_website", correlation_id: "lead:L9", causation_id: "evt_00000000000000000000000001" })

    const w = await claim("wrk_W")
    const result = { summary: "Site antigo", problems: ["sem mobile"], opportunities: ["redesign", "SEO"], qualification_score: 8, confidence: 0.7, site_score: 3 }
    await sql(`select public.complete_job($1, $2, $3::jsonb)`, [w.public_id, w.lease_id, JSON.stringify(result)])
    const lead = await one<{ data: { analysis: Record<string, unknown> } }>(`select data from public.leads where id = 'L9'`)
    expect(lead.data.analysis).toMatchObject({ summary: "Site antigo", problems: ["sem mobile"], opportunity: "redesign · SEO", qualificationScore: 8, siteScore: 3, analyzedBy: "web-analyst" })
    const analyzed = await one<{ correlation_id: string; causation_id: string }>(`select * from public.events where event_type = 'lead.analyzed'`)
    expect(analyzed).toMatchObject({ correlation_id: "lead:L9", causation_id: w.public_id })

    // humano descarta → job de feedback → hipótese criada e rastreável
    await sql(`insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata, correlation_id) values ('evt_00000000000000000000000003','lead.rejected','lead','L9','human','u2','{"reason":"site_bom"}','lead:L9')`)
    const fb = await claim("wrk_I", ["reasoning", "mcp_read"])
    expect(fb).toBeDefined()
    await sql(`select public.complete_job($1, $2, $3::jsonb)`, [fb.public_id, fb.lease_id, JSON.stringify({ patterns: [], hypotheses: [{ title: "Clínicas com site lento convertem mais", confidence: 0.6, proposed_test: "priorizar 20 clínicas" }] })])
    const hyp = await one<{ data: { status: string; title: string } }>(`select data from public.hypotheses`)
    expect(hyp.data).toMatchObject({ status: "proposed", title: "Clínicas com site lento convertem mais" })
    const story = await sql<{ event_type: string }>(`select event_type from public.events where correlation_id = 'lead:L9' order by created_at, id`)
    expect(story.map((e) => e.event_type)).toEqual(expect.arrayContaining(["job.created", "job.claimed", "job.completed", "lead.analyzed", "lead.rejected", "hypothesis.created"]))
  })

  it("webhooks: evento cria UMA entrega; claim atômico; falha → retry; repetido não duplica; recebimento anti-replay (testes 2, 5 e 14)", async () => {
    await clear()
    await db.exec(`insert into public.webhooks (id, name, endpoint, secret_enc, event_types) values ('wh_00000000000000000000000001','n8n','https://n8n.exemplo.com/hook','v1.x.y.z','{lead.approved}')`)
    const ev = `insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id) values ($1, $2, 'lead', 'L1', 'human', 'u1')`
    await sql(ev, ["evt_00000000000000000000000010", "lead.approved"])
    await sql(ev, ["evt_00000000000000000000000011", "lead.rejected"]) // não inscrito
    const first = await sql<{ delivery_id: string; event_type: string }>(`select * from public.claim_deliveries(10)`)
    expect(first).toHaveLength(1)
    expect(first[0].event_type).toBe("lead.approved")
    expect(await sql(`select * from public.claim_deliveries(10)`)).toHaveLength(0) // já está "enviando"
    // endpoint fora do ar → retry agendado
    await sql(`select public.finish_delivery($1, false, 503, 'Service Unavailable', 'HTTP 503', now() + interval '1 minute')`, [first[0].delivery_id])
    expect((await one<{ status: string }>(`select status from public.webhook_deliveries`)).status).toBe("retry_scheduled")
    // mesma entrega não duplica
    await db.exec(`insert into public.webhook_deliveries (id, webhook_id, event_id) values ('dlv_00000000000000000000000099','wh_00000000000000000000000001','evt_00000000000000000000000010') on conflict do nothing`)
    expect((await one<{ n: number }>(`select count(*)::int n from public.webhook_deliveries`)).n).toBe(1)
    // volta ao ar → entregue
    await db.exec(`update public.webhook_deliveries set next_attempt_at = now() - interval '1 second'`)
    const again = await sql<{ delivery_id: string }>(`select * from public.claim_deliveries(10)`)
    await sql(`select public.finish_delivery($1, true, 200, 'ok', null)`, [again[0].delivery_id])
    expect((await one<{ status: string; attempt_count: number }>(`select status, attempt_count from public.webhook_deliveries`))).toEqual({ status: "delivered", attempt_count: 2 })
    // webhook que chega duas vezes (replay/duplicado): só a primeira processa
    expect((await one<{ r: boolean }>(`select public.register_receipt('hotmart','HP123') r`)).r).toBe(true)
    expect((await one<{ r: boolean }>(`select public.register_receipt('hotmart','HP123') r`)).r).toBe(false)
  })

  it("status da fila é consulta barata e respeita capabilities", async () => {
    await clear()
    await enqueue("q1", ["web"])
    await enqueue("q2", ["reasoning"])
    const s = await one<{ s: { compatible_ready: number; by_status: Record<string, number> } }>(`select public.queue_status(array['web'], null) s`)
    expect(s.s.compatible_ready).toBe(1)
    expect(s.s.by_status.queued).toBe(2)
  })
})
