/**
 * Camada de execução do AI Office — regras puras (testadas em jobs.test.ts).
 * O BANCO garante o que precisa ser atômico (claim, lease, idempotência — SQL 0011);
 * aqui fica o que é decisão/validação: IDs, tipos de job, schemas de resultado,
 * capabilities, backoff, polling adaptativo. Nada aqui chama IA.
 */

// ---------- IDs globais (ULID: ordenável por tempo, único, não reutilizável) ----------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

export function ulid(now = Date.now(), random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let time = ""
  let t = now
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = random(16)
  let rand = ""
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32]
  return time + rand
}

export type IdPrefix = "job" | "evt" | "lead" | "agent" | "run" | "learning" | "hyp" | "wh" | "dlv" | "wrk" | "corr" | "lease"
export const publicId = (prefix: IdPrefix, now?: number) => `${prefix}_${ulid(now)}`
export const isPublicId = (v: string, prefix?: IdPrefix) => new RegExp(`^${prefix ?? "[a-z]+"}_[0-9A-HJKMNP-TV-Z]{26}$`).test(v)

// ---------- status ----------

export const JOB_STATUSES = ["queued", "claimed", "running", "completed", "failed", "retry_scheduled", "cancelled", "dead_letter"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

// ---------- tipos de job: quem faz, o que precisa, como validar o resultado ----------

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export interface WebsiteAnalysisResult {
  summary: string
  problems: string[]
  opportunities: string[]
  qualification_score: number
  confidence: number
  site_score?: number
}

export interface FeedbackAnalysisResult {
  patterns: { title: string; description: string; evidence: string; confidence: number }[]
  hypotheses: { title: string; description: string; evidence: string; confidence: number; proposed_test: string }[]
}

export interface ProspectVideoResult {
  video_path: string
  duration_sec: number
  findings: { kind: string; text: string; short: string }[]
}

export interface JobTypeDef<T = unknown> {
  label: string
  agentId: string
  /** O worker precisa ter TODAS. */
  requiredCapabilities: string[]
  maxAttempts: number
  priority: number
  validate: (raw: unknown) => ValidationResult<T>
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null)
const texts = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]).map((x) => x.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems) : null

function validateWebsite(raw: unknown): ValidationResult<WebsiteAnalysisResult> {
  const o = obj(raw)
  if (!o) return { ok: false, errors: ["resultado precisa ser um objeto"] }
  const errors: string[] = []
  const summary = text(o.summary, 2000)
  const problems = texts(o.problems, 30, 300)
  const opportunities = texts(o.opportunities, 20, 500)
  const qualification_score = num(o.qualification_score, 0, 10)
  const confidence = num(o.confidence, 0, 1)
  const site_score = o.site_score === undefined ? undefined : num(o.site_score, 0, 10)
  if (!summary) errors.push("summary: texto obrigatório")
  if (!problems) errors.push("problems: lista de textos")
  if (!opportunities) errors.push("opportunities: lista de textos")
  if (qualification_score === null) errors.push("qualification_score: número de 0 a 10")
  if (confidence === null) errors.push("confidence: número de 0 a 1")
  if (site_score === null) errors.push("site_score: número de 0 a 10 (opcional)")
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { summary: summary!, problems: problems!, opportunities: opportunities!, qualification_score: qualification_score!, confidence: confidence!, ...(site_score !== undefined ? { site_score: site_score! } : {}) } }
}

function validateFeedback(raw: unknown): ValidationResult<FeedbackAnalysisResult> {
  const o = obj(raw)
  if (!o) return { ok: false, errors: ["resultado precisa ser um objeto"] }
  const errors: string[] = []
  const list = (v: unknown, name: string, withTest: boolean) => {
    if (v === undefined) return []
    if (!Array.isArray(v)) {
      errors.push(`${name}: lista`)
      return []
    }
    return v.slice(0, 20).flatMap((x, i) => {
      const p = obj(x)
      const title = text(p?.title, 200)
      const confidence = num(p?.confidence, 0, 1)
      const proposed = withTest ? text(p?.proposed_test, 1000) : ""
      if (!p || !title || confidence === null || proposed === null) {
        errors.push(`${name}[${i}]: precisa de title, confidence 0–1${withTest ? " e proposed_test" : ""}`)
        return []
      }
      return [{ title, description: text(p.description, 2000) ?? "", evidence: text(p.evidence, 2000) ?? "", confidence, ...(withTest ? { proposed_test: proposed! } : {}) }]
    })
  }
  const patterns = list(o.patterns, "patterns", false)
  const hypotheses = list(o.hypotheses, "hypotheses", true) as FeedbackAnalysisResult["hypotheses"]
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { patterns, hypotheses } }
}

/** Caminho do vídeo: sempre dentro de funil/leads/ (o worker só consegue subir para lá). */
export const PROSPECT_VIDEO_PATH = /^funil\/leads\/[A-Za-z0-9_-]{1,64}\/job_[0-9A-HJKMNP-TV-Z]{26}\/video\.mp4$/

function validateProspectVideo(raw: unknown): ValidationResult<ProspectVideoResult> {
  const o = obj(raw)
  if (!o) return { ok: false, errors: ["resultado precisa ser um objeto"] }
  const errors: string[] = []
  const video_path = typeof o.video_path === "string" && PROSPECT_VIDEO_PATH.test(o.video_path) ? o.video_path : null
  const duration_sec = num(o.duration_sec, 5, 600)
  const findings = Array.isArray(o.findings)
    ? o.findings.slice(0, 6).flatMap((x) => {
        const f = obj(x)
        const kind = text(f?.kind, 40)
        const t = text(f?.text, 300)
        const short = text(f?.short, 60)
        return kind && t && short ? [{ kind, text: t, short }] : []
      })
    : []
  if (!video_path) errors.push("video_path: funil/leads/<lead>/<job>/video.mp4 (use create_upload_urls)")
  if (duration_sec === null) errors.push("duration_sec: número de 5 a 600")
  if (!findings.length) errors.push("findings: ao menos 1 ponto observado no site ({kind, text, short})")
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { video_path: video_path!, duration_sec: duration_sec!, findings } }
}

export const JOB_TYPES: Record<string, JobTypeDef> = {
  analyze_website: {
    label: "Analisar site",
    agentId: "web-analyst",
    requiredCapabilities: ["web", "mcp_write"],
    maxAttempts: 5,
    priority: 50,
    validate: validateWebsite,
  },
  analyze_human_feedback: {
    label: "Analisar feedback humano",
    agentId: "intelligence",
    requiredCapabilities: ["reasoning", "mcp_read"],
    maxAttempts: 3,
    priority: 20,
    validate: validateFeedback,
  },
  render_prospect_video: {
    label: "Gerar vídeo de análise",
    agentId: "video-studio",
    requiredCapabilities: ["video_render"],
    maxAttempts: 3,
    priority: 60,
    validate: validateProspectVideo,
  },
}

export function validateJobResult(jobType: string, raw: unknown): ValidationResult<unknown> {
  const def = JOB_TYPES[jobType]
  if (!def) return { ok: false, errors: [`tipo de job desconhecido: ${jobType}`] }
  return def.validate(raw)
}

/** O worker tem todas as capabilities que o job exige? */
export const satisfies = (required: string[], worker: string[]) => required.every((c) => worker.includes(c))

// ---------- configuração (padrões; o banco pode sobrescrever em ai_settings) ----------

export interface QueueConfig {
  leaseSeconds: number
  backoff: { baseSeconds: number; capSeconds: number; jitter: number }
  /** Fila com trabalho compatível: consulte de novo logo. */
  backlogPollSeconds: number
  /** Fila vazia: quanto esperar, conforme há quanto tempo está vazia (segundos). */
  idlePoll: { idleFor: number; wait: number }[]
  maxLongPollSeconds: number
  webhook: { maxAttempts: number; toleranceSeconds: number; timeoutMs: number }
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  leaseSeconds: 600,
  backoff: { baseSeconds: 60, capSeconds: 3600, jitter: 0.2 },
  backlogPollSeconds: 3,
  idlePoll: [
    { idleFor: 0, wait: 30 },
    { idleFor: 120, wait: 60 },
    { idleFor: 600, wait: 300 },
    { idleFor: 3600, wait: 900 },
  ],
  maxLongPollSeconds: 25,
  webhook: { maxAttempts: 8, toleranceSeconds: 300, timeoutMs: 8000 },
}

/** Mescla o que veio do banco com os padrões (só números válidos entram). */
export function mergeConfig(override: unknown): QueueConfig {
  const o = obj(override) ?? {}
  const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d)
  const b = obj(o.backoff) ?? {}
  const w = obj(o.webhook) ?? {}
  const idle = Array.isArray(o.idlePoll)
    ? (o.idlePoll as unknown[]).flatMap((x) => {
        const s = obj(x)
        return s && typeof s.idleFor === "number" && typeof s.wait === "number" ? [{ idleFor: s.idleFor, wait: s.wait }] : []
      })
    : []
  const d = DEFAULT_QUEUE_CONFIG
  return {
    leaseSeconds: n(o.leaseSeconds, d.leaseSeconds),
    backoff: { baseSeconds: n(b.baseSeconds, d.backoff.baseSeconds), capSeconds: n(b.capSeconds, d.backoff.capSeconds), jitter: Math.min(1, n(b.jitter, d.backoff.jitter)) },
    backlogPollSeconds: n(o.backlogPollSeconds, d.backlogPollSeconds),
    idlePoll: idle.length ? idle.sort((a, z) => a.idleFor - z.idleFor) : d.idlePoll,
    maxLongPollSeconds: Math.min(55, n(o.maxLongPollSeconds, d.maxLongPollSeconds)),
    webhook: { maxAttempts: n(w.maxAttempts, d.webhook.maxAttempts), toleranceSeconds: n(w.toleranceSeconds, d.webhook.toleranceSeconds), timeoutMs: n(w.timeoutMs, d.webhook.timeoutMs) },
  }
}

// ---------- retry com backoff exponencial + jitter ----------

/** Espera antes da tentativa `attempt` (1 = primeira repetição): base·2^(n−1), com teto e ±jitter. */
export function backoffSeconds(attempt: number, cfg = DEFAULT_QUEUE_CONFIG.backoff, random = Math.random) {
  const raw = Math.min(cfg.capSeconds, cfg.baseSeconds * 2 ** Math.max(0, attempt - 1))
  const spread = raw * cfg.jitter
  return Math.max(1, Math.round(raw - spread + random() * 2 * spread))
}

/** Depois de uma falha: tenta de novo mais tarde ou vai para a dead letter. */
export function afterFailure(attemptCount: number, maxAttempts: number, now: Date, cfg = DEFAULT_QUEUE_CONFIG.backoff, random = Math.random) {
  if (attemptCount >= maxAttempts) return { status: "dead_letter" as const, availableAt: null }
  return { status: "retry_scheduled" as const, availableAt: new Date(now.getTime() + backoffSeconds(attemptCount, cfg, random) * 1000) }
}

// ---------- polling adaptativo (decidido pelo servidor, sem IA) ----------

export function pollAdvice(compatibleQueued: number, idleSeconds: number, cfg = DEFAULT_QUEUE_CONFIG) {
  if (compatibleQueued > 0) return { retry_after_seconds: cfg.backlogPollSeconds, reason: "backlog" as const }
  let wait = cfg.idlePoll[0]?.wait ?? 30
  for (const step of cfg.idlePoll) if (idleSeconds >= step.idleFor) wait = step.wait
  return { retry_after_seconds: wait, reason: idleSeconds >= (cfg.idlePoll.at(-1)?.idleFor ?? Infinity) ? ("long_idle" as const) : ("queue_empty" as const) }
}

// ---------- idempotência: chaves determinísticas ----------

export const idempotencyKey = (jobType: string, entityId: string, version: string | number = 1) => `${jobType}:${entityId}:v${version}`

// ---------- saúde do worker (só o que temos evidência: heartbeat/atividade) ----------

export type WorkerHealth = "online" | "idle" | "offline"
/** online = heartbeat há < 2 min; idle = < 30 min; offline = mais que isso (ou nunca). Não diz se o app está aberto. */
export function workerHealth(lastSeenAt: string | null | undefined, now = Date.now()): WorkerHealth {
  if (!lastSeenAt) return "offline"
  const s = (now - new Date(lastSeenAt).getTime()) / 1000
  return s < 120 ? "online" : s < 1800 ? "idle" : "offline"
}

const JOB_VERB: Record<string, string> = {
  "job.created": "criado",
  "job.claimed": "assumido",
  "job.started": "iniciado",
  "job.progress": "progresso",
  "job.completed": "concluído",
  "job.failed": "falhou",
  "job.lease_expired": "lease expirou",
  "job.dead_lettered": "foi para a dead letter",
  "job.released": "devolvido à fila",
  "job.retried": "reenfileirado por humano",
  "job.cancelled": "cancelado",
}

/** "Job Analisar site concluído", "Job … progresso: abrindo o site". */
export function describeJobEvent(type: string, metadata: Record<string, unknown>) {
  const label = JOB_TYPES[String(metadata.job_type)]?.label ?? String(metadata.job_type ?? "job")
  const extra = typeof metadata.message === "string" && metadata.message ? `: ${metadata.message}` : typeof metadata.error === "string" ? ` — ${metadata.error}` : ""
  return `Job ${label} ${JOB_VERB[type] ?? type.replace("job.", "")}${extra}`
}
