/**
 * Automações no servidor (ADR 0006):
 * 1) o executor, com um banco em memória (porta AutomationStore): aplica a regra, conclui,
 *    falha com retry e manda para a dead letter quando não adianta tentar de novo;
 * 2) o gatilho SQL 0020 no Postgres de verdade: lead.converted vira UM job, mesmo repetido.
 */
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { Lead, Task, Transaction } from "@/lib/domain/types"
import { createTestDb, type TestDb } from "./test-db"

vi.mock("server-only", () => ({}))
const { runSystemJobs } = await import("./automations")
type Store = import("./automations").AutomationStore
type Job = import("./automations").SystemJob

const NOW = new Date(2026, 9, 30, 12)
const lead = { id: "l1", name: "Ana", company: "Acme", ownerId: "u1", valueCents: 900_00 } as Lead

function memoryStore(jobs: Job[], leads: Lead[] = [lead]) {
  const tasks: Task[] = []
  const transactions: Transaction[] = []
  const completed: { id: string; result: Record<string, unknown> }[] = []
  const failed: { id: string; error: string; retryAt: Date | null }[] = []
  const store: Store = {
    async claim() {
      return jobs.shift() ?? null
    },
    async complete(job, result) {
      completed.push({ id: job.public_id, result })
    },
    async fail(job, error, retryAt) {
      failed.push({ id: job.public_id, error, retryAt })
    },
    async loadLeadContext(id) {
      const l = leads.find((x) => x.id === id)
      return l ? { lead: l, tasks: tasks.filter((t) => t.leadId === id), transactions: transactions.filter((t) => t.leadId === id) } : null
    },
    async insertTask(t) {
      if (!tasks.some((x) => x.id === t.id)) tasks.push(t)
    },
    async insertTransaction(t) {
      if (!transactions.some((x) => x.id === t.id)) transactions.push(t)
    },
  }
  return { store, tasks, transactions, completed, failed }
}

const job = (over: Partial<Job> = {}): Job => ({ public_id: "job_1", lease_id: "lease", job_type: "auto_won_lead", entity_type: "lead", entity_id: "l1", attempt_count: 1, max_attempts: 5, ...over })

describe("executor de automações", () => {
  it("lead ganho: cria tarefa e recebimento e conclui o job", async () => {
    const m = memoryStore([job()])
    expect(await runSystemJobs(m.store, 10, () => NOW)).toEqual({ done: 1, failed: 0 })
    expect(m.tasks).toHaveLength(1)
    expect(m.transactions).toHaveLength(1)
    expect(m.completed[0].result).toEqual({ task_id: "won-task-l1", transaction_id: "won-tx-l1" })
  })

  it("rodar de novo (retry, dois servidores) não duplica nada", async () => {
    const m = memoryStore([job({ public_id: "a" }), job({ public_id: "b" })])
    await runSystemJobs(m.store, 10, () => NOW)
    expect(m.tasks).toHaveLength(1)
    expect(m.transactions).toHaveLength(1)
    expect(m.completed[1].result).toEqual({ task_id: null, transaction_id: null })
  })

  it("lead apagado: falha sem retry (dead letter), não fica tentando para sempre", async () => {
    const m = memoryStore([job({ entity_id: "sumiu" })])
    expect(await runSystemJobs(m.store, 10, () => NOW)).toEqual({ done: 0, failed: 1 })
    expect(m.failed[0]).toMatchObject({ retryAt: null })
  })

  it("erro passageiro (banco fora): agenda nova tentativa", async () => {
    const m = memoryStore([job()])
    m.store.insertTask = async () => {
      throw new Error("timeout")
    }
    await runSystemJobs(m.store, 10, () => NOW)
    expect(m.failed[0].error).toBe("timeout")
    expect(m.failed[0].retryAt!.getTime()).toBeGreaterThan(NOW.getTime())
  })

  it("tipo de job sem automação vai para a dead letter", async () => {
    const m = memoryStore([job({ job_type: "auto_desconhecido" })])
    await runSystemJobs(m.store, 10, () => NOW)
    expect(m.failed[0]).toMatchObject({ retryAt: null })
  })
})

describe("gatilho SQL 0020 (Postgres de verdade)", () => {
  let db: TestDb
  beforeAll(async () => {
    db = await createTestDb()
  }, 120_000)

  const converted = (id: string, leadId = "L9") =>
    db.sql(`insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id) values ($1, 'lead.converted', 'lead', $2, 'human', 'u1')`, [id, leadId])
  const jobs = () => db.sql<{ job_type: string; required_capabilities: string[]; agent_id: string }>(`select job_type, required_capabilities, agent_id from public.ai_jobs where job_type = 'auto_won_lead'`)

  it("lead.converted enfileira um job de sistema; evento repetido não duplica", async () => {
    await converted("evt_conv_000000000001")
    await converted("evt_conv_000000000002")
    const rows = await jobs()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ agent_id: "system", required_capabilities: ["system"] })
  })

  it("só o executor de sistema pega o job (workers de IA não têm a capability)", async () => {
    const ai = await db.sql(`select * from public.claim_next_job('wrk_ia', array['web','mcp_write','reasoning','mcp_read','video_render'], null, 60)`)
    expect(ai.filter((j) => (j as { job_type: string }).job_type === "auto_won_lead")).toHaveLength(0)
    const sys = await db.sql<{ job_type: string }>(`select * from public.claim_next_job('system', array['system'], 'system', 60)`)
    expect(sys[0]?.job_type).toBe("auto_won_lead")
  })
})
