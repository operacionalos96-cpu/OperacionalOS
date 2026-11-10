/**
 * Escritório pessoal (ADR 0022, docs/ESCRITORIO-PESSOAL.md): regras puras.
 *
 * O banco (migration 0026) é quem garante as travas; estas funções repetem as mesmas regras
 * para a tela avisar antes de tentar, e calculam o estado de cada agente a partir da fila
 * (`office-state/v1`, lido pela rota /api/escritorio/estado e, no futuro, pela Sede 3D).
 */

export const OFFICE_LIMITS = { agents: 20, depth: 3, parallelPerAgent: 2 } as const
/** Sem sinal da Ponte por mais que isto = desligada (mesmo critério de saúde dos workers). */
export const BRIDGE_ONLINE_MS = 2 * 60_000

export type OfficeAgentKind = "co_lider" | "funcionario"

export interface OfficeAgent {
  id: string
  kind: OfficeAgentKind
  parentAgentId: string | null
  name: string
  title: string
  paused: boolean
  /** IA escolhida (conexão); null = ainda sem IA */
  connectionId?: string | null
  /** reservas em ordem, usadas quando a cota da principal acaba */
  backupModels?: { connectionId: string; model: string }[]
}

export type ConnectionStatus = "pendente" | "conectada" | "sem_cota" | "erro" | "desligada"
export interface OfficeConnection {
  id: string
  provider: string
  kind: "local" | "chave" | "assinatura"
  status: ConnectionStatus
  quotaResetsAt?: string | null
}
/** Pode receber trabalho agora? (`pendente` = a Ponte ainda vai conferir; conta como disponível) */
export const connectionUsable = (c: OfficeConnection | undefined, now: Date) =>
  !!c && (c.status === "conectada" || c.status === "pendente" || (c.status === "sem_cota" && !!c.quotaResetsAt && new Date(c.quotaResetsAt) <= now))

// ---------- organograma ----------

export type AgentChangeError = "limit_agents" | "limit_depth" | "one_co_lider" | "parent_required" | "parent_not_allowed" | "parent_not_found" | "cycle" | "kind_immutable"

export interface AgentChange {
  /** id de quem está sendo editado; ausente = novo agente */
  id?: string
  kind: OfficeAgentKind
  parentAgentId: string | null
}

const depthOf = (agents: OfficeAgent[], id: string): number => {
  let d = 0
  let cur: string | null = id
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    d++
    cur = agents.find((a) => a.id === cur)?.parentAgentId ?? null
  }
  return d
}

const heightOf = (agents: OfficeAgent[], id: string): number => 1 + Math.max(0, ...agents.filter((a) => a.parentAgentId === id).map((a) => heightOf(agents, a.id)))

const isDescendant = (agents: OfficeAgent[], ancestor: string, candidate: string): boolean =>
  agents.filter((a) => a.parentAgentId === ancestor).some((child) => child.id === candidate || isDescendant(agents, child.id, candidate))

/** Mesmas travas do `office_upsert_agent`: 20 agentes, 3 níveis, um co-líder, funcionário com chefe, sem ciclo. */
export function validateAgentChange(agents: OfficeAgent[], change: AgentChange): AgentChangeError | null {
  const existing = change.id ? agents.find((a) => a.id === change.id) : undefined
  if (existing && existing.kind !== change.kind) return "kind_immutable"
  if (change.kind === "co_lider" && change.parentAgentId) return "parent_not_allowed"
  if (change.kind === "funcionario" && !change.parentAgentId) return "parent_required"
  if (change.parentAgentId && !agents.some((a) => a.id === change.parentAgentId)) return "parent_not_found"
  const parentDepth = change.parentAgentId ? depthOf(agents, change.parentAgentId) : 0
  if (!existing) {
    if (agents.length >= OFFICE_LIMITS.agents) return "limit_agents"
    if (change.kind === "co_lider" && agents.some((a) => a.kind === "co_lider")) return "one_co_lider"
    return parentDepth + 1 > OFFICE_LIMITS.depth ? "limit_depth" : null
  }
  if (change.parentAgentId && (change.parentAgentId === existing.id || isDescendant(agents, existing.id, change.parentAgentId))) return "cycle"
  return parentDepth + heightOf(agents, existing.id) > OFFICE_LIMITS.depth ? "limit_depth" : null
}

// ---------- quem recebe uma mensagem ----------

export interface OfficeThread {
  id: string
  kind: "direta" | "canal"
  agentIds: string[]
  leadAgentId: string
}

/** Mesma ordem do `office_send_message`: mencionados → autor da mensagem respondida → único agente → líder. */
export function pickRecipients(thread: OfficeThread, opts: { mentions?: string[]; replyToAgent?: string | null } = {}): string[] {
  const mentioned = [...new Set(opts.mentions ?? [])].filter((id) => thread.agentIds.includes(id))
  if (mentioned.length) return mentioned
  if (opts.replyToAgent && thread.agentIds.includes(opts.replyToAgent)) return [opts.replyToAgent]
  return thread.agentIds.length === 1 ? [...thread.agentIds] : [thread.leadAgentId]
}

/** Chave da entrega: a mesma mensagem nunca gera duas entregas para o mesmo agente. */
export const deliveryKey = (messageId: string, agentId: string) => `dlv:${messageId}:${agentId}`

// ---------- estados (office-state/v1) ----------

export type AgentState =
  | "bloqueado"
  | "aguardando_aprovacao"
  | "pausado"
  | "conversando"
  | "trabalhando"
  | "ponte_desligada"
  | "na_fila"
  | "manutencao"
  | "sem_cota"
  | "sem_conexao"
  | "ocioso"

export interface OfficeJob {
  publicId: string
  agentId: string
  threadId: string | null
  status: "queued" | "retry_scheduled" | "claimed" | "running"
  claimedAt?: string | null
  startedAt?: string | null
  /** agente do job que pediu este (delegação); vira um handoff */
  parentAgentId?: string | null
  createdAt: string
}

export interface OfficeStateInput {
  consent: boolean
  agents: OfficeAgent[]
  jobs: OfficeJob[]
  threads: Pick<OfficeThread, "id" | "kind">[]
  bridge: { lastSeenAt: string | null } | null
  /** aprovações pendentes por agente (P3): G2 bloqueia a fila do agente, G1 espera em lote */
  approvals?: { agentId: string; gate: "lote" | "bloqueio" }[]
  /** tarefas locais de standby em andamento (P6) */
  maintenance?: string[]
  /** conexões de IA do dono (só a descrição; segredos ficam na Ponte) */
  connections?: OfficeConnection[]
}

export interface OfficeStateV1 {
  schema: "office-state/v1"
  generated_at: string
  consent: boolean
  bridge: { online: boolean; last_seen_at: string | null }
  agents: {
    id: string
    name: string
    title: string
    kind: OfficeAgentKind
    parent_agent_id: string | null
    connection_id: string | null
    state: AgentState
    queue: { queued: number; running: number }
    current: { job_id: string; thread_id: string | null; started_at: string | null } | null
  }[]
  handoffs: { from_agent: string; to_agent: string; job_id: string; at: string }[]
  connections: { id: string; provider: string; kind: OfficeConnection["kind"]; status: ConnectionStatus }[]
}

const RUNNING = new Set(["claimed", "running"])
/** Status da fila que contam no estado (o resto já terminou). */
export const ACTIVE_JOB_STATUSES = ["queued", "retry_scheduled", "claimed", "running"] as const

/** Linhas do banco (como a RLS devolve ao dono) → entrada de `deriveOfficeState`. */
export interface OfficeRows {
  office: { consent_at: string | null } | null
  agents: {
    id: string
    kind: OfficeAgentKind
    parent_agent_id: string | null
    name: string
    title: string
    paused: boolean
    connection_id?: string | null
    backup_models?: { connection_id: string; model: string }[]
  }[]
  connections?: { id: string; provider: string; kind: OfficeConnection["kind"]; status: ConnectionStatus; quota_resets_at: string | null }[]
  /** jobs ativos do dono + os jobs-pai deles (para achar quem delegou) */
  jobs: { id: string; public_id: string; agent_id: string; entity_id: string | null; status: string; claimed_at: string | null; started_at: string | null; parent_job_id: string | null; created_at: string }[]
  threads: { id: string; kind: "direta" | "canal" }[]
  workers: { last_seen_at: string | null; enabled: boolean }[]
}

export function officeStateInput(rows: OfficeRows): OfficeStateInput {
  const agentOfJob = new Map(rows.jobs.map((j) => [j.id, j.agent_id]))
  const active = new Set<string>(ACTIVE_JOB_STATUSES)
  const seen = rows.workers.filter((w) => w.enabled && w.last_seen_at).map((w) => w.last_seen_at as string).sort()
  return {
    consent: !!rows.office?.consent_at,
    agents: rows.agents.map((a) => ({
      id: a.id,
      kind: a.kind,
      parentAgentId: a.parent_agent_id,
      name: a.name,
      title: a.title,
      paused: a.paused,
      connectionId: a.connection_id ?? null,
      backupModels: (a.backup_models ?? []).map((b) => ({ connectionId: b.connection_id, model: b.model })),
    })),
    connections: (rows.connections ?? []).map((c) => ({ id: c.id, provider: c.provider, kind: c.kind, status: c.status, quotaResetsAt: c.quota_resets_at })),
    jobs: rows.jobs
      .filter((j) => active.has(j.status))
      .map((j) => ({
        publicId: j.public_id,
        agentId: j.agent_id,
        threadId: j.entity_id,
        status: j.status as OfficeJob["status"],
        claimedAt: j.claimed_at,
        startedAt: j.started_at,
        parentAgentId: j.parent_job_id ? (agentOfJob.get(j.parent_job_id) ?? null) : null,
        createdAt: j.created_at,
      })),
    threads: rows.threads,
    // várias Pontes (PC e notebook): vale o sinal mais recente
    bridge: seen.length ? { lastSeenAt: seen[seen.length - 1] } : null,
  }
}

/** Estado de cada agente, sem nenhum conteúdo de conversa (só ids, nomes e contagens). */
export function deriveOfficeState(input: OfficeStateInput, now: Date): OfficeStateV1 {
  const lastSeen = input.bridge?.lastSeenAt ?? null
  const online = !!lastSeen && now.getTime() - new Date(lastSeen).getTime() <= BRIDGE_ONLINE_MS
  const channels = new Set(input.threads.filter((t) => t.kind === "canal").map((t) => t.id))
  const approvals = input.approvals ?? []
  const maintenance = new Set(input.maintenance ?? [])
  const connections = input.connections ?? []
  const conn = (id: string | null | undefined) => connections.find((c) => c.id === id)
  /** Sem IA disponível (principal e reservas): diz se é falta de cota ou de conexão. */
  const blockedBy = (a: OfficeAgent): "sem_cota" | "sem_conexao" | null => {
    const options = [a.connectionId, ...(a.backupModels ?? []).map((b) => b.connectionId)].filter((id): id is string => !!id)
    if (options.some((id) => connectionUsable(conn(id), now))) return null
    return options.some((id) => conn(id)?.status === "sem_cota") ? "sem_cota" : "sem_conexao"
  }
  // Sem a lista de conexões (dados antigos), não dá para julgar a IA: não marca o agente.
  const judgeConnections = input.connections !== undefined

  const agents = input.agents.map((a) => {
    const mine = input.jobs.filter((j) => j.agentId === a.id)
    const running = mine.filter((j) => RUNNING.has(j.status)).sort((x, y) => (x.claimedAt ?? x.createdAt).localeCompare(y.claimedAt ?? y.createdAt))
    const queued = mine.length - running.length
    const current = running[0] ?? null
    const state: AgentState = approvals.some((p) => p.agentId === a.id && p.gate === "bloqueio")
      ? "bloqueado"
      : approvals.some((p) => p.agentId === a.id && p.gate === "lote")
        ? "aguardando_aprovacao"
        : a.paused
          ? "pausado"
          : current
            ? current.threadId && channels.has(current.threadId)
              ? "conversando"
              : "trabalhando"
            : queued > 0
              ? (judgeConnections && blockedBy(a)) || (online ? "na_fila" : "ponte_desligada")
              : maintenance.has(a.id)
                ? "manutencao"
                : "ocioso"
    return {
      id: a.id,
      name: a.name,
      title: a.title,
      kind: a.kind,
      parent_agent_id: a.parentAgentId,
      connection_id: a.connectionId ?? null,
      state,
      queue: { queued, running: running.length },
      current: current ? { job_id: current.publicId, thread_id: current.threadId, started_at: current.startedAt ?? current.claimedAt ?? null } : null,
    }
  })

  const handoffs = input.jobs
    .filter((j) => j.parentAgentId && j.parentAgentId !== j.agentId)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    .map((j) => ({ from_agent: j.parentAgentId as string, to_agent: j.agentId, job_id: j.publicId, at: j.createdAt }))

  return {
    schema: "office-state/v1",
    generated_at: now.toISOString(),
    consent: input.consent,
    bridge: { online, last_seen_at: lastSeen },
    agents,
    handoffs,
    connections: connections.map((c) => ({ id: c.id, provider: c.provider, kind: c.kind, status: c.status })),
  }
}
