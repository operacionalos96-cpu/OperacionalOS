import "server-only"
import { afterFailure } from "@/lib/domain/jobs"
import type { Lead, Task, Transaction } from "@/lib/domain/types"
import { wonLeadRecords } from "@/lib/domain/won-lead"
import { supabaseAdmin } from "./supabase-admin"

/**
 * Automações de negócio no SERVIDOR (ADR 0006).
 *
 *   evento gravado (ex.: lead.converted) → gatilho SQL 0020 enfileira job "auto_*" (capability system)
 *   → runSystemJobs() pega o job, aplica a regra pura do domínio e grava o resultado
 *
 * Roda pelo agendador (/api/runner/tick, a cada minuto) e logo após a ação, quando o navegador
 * chama /api/automacoes/processar (resultado em segundos). As duas formas são seguras juntas: a fila
 * entrega cada job a um executor só (lease), e os registros têm id estável (upsert não duplica).
 *
 * Automação nova = um `if` no gatilho da 0020 + um handler em HANDLERS (regra no domínio, com teste).
 */

export const SYSTEM_WORKER = "system"
const LEASE_SECONDS = 120

export interface SystemJob {
  public_id: string
  lease_id: string
  job_type: string
  entity_type: string | null
  entity_id: string | null
  attempt_count: number
  max_attempts: number
}

/** Porta para o banco: o executor não conhece o Supabase (e o teste usa uma versão em memória). */
export interface AutomationStore {
  claim(): Promise<SystemJob | null>
  complete(job: SystemJob, result: Record<string, unknown>): Promise<void>
  fail(job: SystemJob, error: string, retryAt: Date | null): Promise<void>
  loadLeadContext(leadId: string): Promise<{ lead: Lead; tasks: Task[]; transactions: Transaction[] } | null>
  /** Grava sem sobrescrever o que já existe com o mesmo id. */
  insertTask(task: Task): Promise<void>
  insertTransaction(tx: Transaction): Promise<void>
}

type Handler = (job: SystemJob, store: AutomationStore, now: Date) => Promise<Record<string, unknown>>

/** Erro que não adianta tentar de novo (dado não existe mais): vai direto para a dead letter. */
export class PermanentError extends Error {}

const HANDLERS: Record<string, Handler> = {
  // Virou cliente: tarefa de onboarding + recebimento previsto (src/lib/domain/won-lead.ts).
  async auto_won_lead(job, store, now) {
    if (!job.entity_id) throw new PermanentError("job sem lead")
    const ctx = await store.loadLeadContext(job.entity_id)
    if (!ctx) throw new PermanentError(`lead ${job.entity_id} não existe mais`)
    const { task, transaction } = wonLeadRecords(ctx.lead, ctx.tasks, ctx.transactions, now)
    if (task) await store.insertTask(task)
    if (transaction) await store.insertTransaction(transaction)
    return { task_id: task?.id ?? null, transaction_id: transaction?.id ?? null }
  },
}

/** Executa até `limit` jobs de sistema da fila. Devolve um resumo (para logs e para a rota). */
export async function runSystemJobs(store: AutomationStore = supabaseAutomationStore(), limit = 10, now = () => new Date()) {
  const summary = { done: 0, failed: 0 }
  for (let i = 0; i < limit; i++) {
    const job = await store.claim()
    if (!job) break
    const handler = HANDLERS[job.job_type]
    try {
      if (!handler) throw new PermanentError(`nenhuma automação para o job ${job.job_type}`)
      await store.complete(job, await handler(job, store, now()))
      summary.done++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      const next = e instanceof PermanentError ? null : afterFailure(job.attempt_count, job.max_attempts, now()).availableAt
      await store.fail(job, message, next)
      summary.failed++
    }
  }
  return summary
}

// ---------- adaptador Supabase (infraestrutura) ----------

export function supabaseAutomationStore(): AutomationStore {
  const db = supabaseAdmin()
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message)
  }
  const rowsOf = <T>(rows: { data: unknown }[] | null) => (rows ?? []).map((r) => r.data as T)

  return {
    async claim() {
      const { data, error } = await db.rpc("claim_next_job", { p_worker_id: SYSTEM_WORKER, p_capabilities: ["system"], p_agent_id: SYSTEM_WORKER, p_lease_seconds: LEASE_SECONDS })
      check(error)
      const job = (Array.isArray(data) ? data[0] : data) as SystemJob | undefined
      return job?.public_id ? job : null
    },
    async complete(job, result) {
      check((await db.rpc("complete_job", { p_public_id: job.public_id, p_lease_id: job.lease_id, p_result: result, p_raw_result: null })).error)
    },
    async fail(job, error, retryAt) {
      check((await db.rpc("fail_job", { p_public_id: job.public_id, p_lease_id: job.lease_id, p_error: error.slice(0, 2000), p_retry_at: retryAt?.toISOString() ?? null })).error)
    },
    async loadLeadContext(leadId) {
      const lead = await db.from("leads").select("data").eq("id", leadId).maybeSingle()
      check(lead.error)
      if (!lead.data) return null
      const [tasks, txs] = await Promise.all([
        db.from("tasks").select("data").eq("data->>leadId", leadId),
        db.from("transactions").select("data").eq("data->>leadId", leadId),
      ])
      check(tasks.error)
      check(txs.error)
      return { lead: lead.data.data as Lead, tasks: rowsOf<Task>(tasks.data), transactions: rowsOf<Transaction>(txs.data) }
    },
    async insertTask(task) {
      check((await db.from("tasks").upsert({ id: task.id, data: task }, { onConflict: "id", ignoreDuplicates: true })).error)
    },
    async insertTransaction(tx) {
      check((await db.from("transactions").upsert({ id: tx.id, data: tx }, { onConflict: "id", ignoreDuplicates: true })).error)
    },
  }
}
