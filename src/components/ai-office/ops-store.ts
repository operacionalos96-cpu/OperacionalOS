"use client"

import { create } from "zustand"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * Dados da operação do AI Office para as telas (só LEITURA — RLS de membros).
 * Atualiza sozinho pelo tempo real (ai_jobs, workers, webhook_deliveries).
 * Ações (tentar de novo, cancelar, criar worker/webhook) vão por /api/ai-office/<ação>.
 */
export interface JobRow {
  public_id: string
  job_type: string
  agent_id: string
  preferred_model: string | null
  entity_type: string | null
  entity_id: string | null
  status: string
  priority: number
  payload: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  available_at: string
  claimed_at: string | null
  started_at: string | null
  completed_at: string | null
  failed_at: string | null
  first_failed_at: string | null
  claimed_by: string | null
  engine: string | null
  lease_expires_at: string | null
  attempt_count: number
  max_attempts: number
  idempotency_key: string | null
  correlation_id: string | null
  causation_id: string | null
  created_by: string
}

export interface WorkerRow {
  id: string
  name: string
  agent_id: string | null
  engine: string | null
  capabilities: string[]
  scopes: string[]
  token_hint: string | null
  enabled: boolean
  last_seen_at: string | null
  last_job_at: string | null
  created_at: string
}

export interface WebhookRow {
  id: string
  name: string
  endpoint: string
  secret_hint: string | null
  enabled: boolean
  event_types: string[]
  created_at: string
}

export interface DeliveryRow {
  id: string
  webhook_id: string
  event_id: string
  status: string
  attempt_count: number
  next_attempt_at: string
  last_attempt_at: string | null
  response_status: number | null
  error: string | null
  created_at: string
  delivered_at: string | null
}

interface OpsState {
  jobs: JobRow[]
  workers: WorkerRow[]
  webhooks: WebhookRow[]
  deliveries: DeliveryRow[]
  loaded: boolean
  missing: boolean
  load(): Promise<void>
}

const JOB_COLS =
  "public_id, job_type, agent_id, preferred_model, entity_type, entity_id, status, priority, payload, result, error, created_at, available_at, claimed_at, started_at, completed_at, failed_at, first_failed_at, claimed_by, engine, lease_expires_at, attempt_count, max_attempts, idempotency_key, correlation_id, causation_id, created_by"

export const useOps = create<OpsState>((set) => ({
  jobs: [],
  workers: [],
  webhooks: [],
  deliveries: [],
  loaded: false,
  missing: false,
  async load() {
    const sb = supabaseBrowser()
    const [j, w, h, d] = await Promise.all([
      sb.from("ai_jobs").select(JOB_COLS).order("created_at", { ascending: false }).limit(300),
      sb.from("workers").select("id, name, agent_id, engine, capabilities, scopes, token_hint, enabled, last_seen_at, last_job_at, created_at").order("created_at"),
      sb.from("webhooks").select("id, name, endpoint, secret_hint, enabled, event_types, created_at").order("created_at"),
      sb.from("webhook_deliveries").select("id, webhook_id, event_id, status, attempt_count, next_attempt_at, last_attempt_at, response_status, error, created_at, delivered_at").order("created_at", { ascending: false }).limit(200),
    ])
    set({
      loaded: true,
      missing: !!j.error,
      jobs: (j.data as JobRow[] | null) ?? [],
      workers: (w.data as WorkerRow[] | null) ?? [],
      webhooks: (h.data as WebhookRow[] | null) ?? [],
      deliveries: (d.data as DeliveryRow[] | null) ?? [],
    })
  },
}))

let stop: (() => void) | null = null
/** Começa a escutar mudanças (chame ao abrir o AI Office). */
export function startOps() {
  void useOps.getState().load()
  if (stop) return
  const sb = supabaseBrowser()
  let timer: ReturnType<typeof setTimeout> | undefined
  const reload = () => {
    clearTimeout(timer)
    timer = setTimeout(() => void useOps.getState().load(), 700)
  }
  const ch = sb.channel("ai-office-ops")
  for (const table of ["ai_jobs", "workers", "webhook_deliveries"]) ch.on("postgres_changes", { event: "*", schema: "public", table }, reload)
  ch.subscribe()
  stop = () => sb.removeChannel(ch)
}

/** Ação humana no servidor. Devolve o JSON (com token/segredo quando for criação). */
export async function opsAction<T = Record<string, unknown>>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/ai-office/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.erro ?? "falhou")
  void useOps.getState().load()
  return data as T
}
