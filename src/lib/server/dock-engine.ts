/**
 * Ferramentas do motor do HZK Dock (Ponte HZK no PC), servidas por /api/workers/<ferramenta> e /api/mcp
 * com o token oos_ do PC (escopo office:engine). Contrato: nota 42, F5.2. Migrations 0027 e 0028.
 *
 * Regras:
 *  - toda ferramenta exige o lease da entrega e confere, no banco, que o PC é quem segurou a entrega,
 *    está ligado e é do mesmo dono (private.office_engine_job);
 *  - o motor nunca escolhe o dono nem a origem: o banco calcula pela entrega;
 *  - nenhum argumento carrega segredo; textos têm teto de tamanho.
 *
 * O acesso ao banco é injetado (rpc), para os testes rodarem contra o Postgres de teste com as migrations reais.
 * Este arquivo não importa "server-only" nem o Supabase: quem liga ao Supabase é worker-tools.ts.
 */

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>
type Args = Record<string, unknown>

export class EngineArgError extends Error {
  status = 400
}

const ID = {
  job: /^job_[0-9A-HJKMNP-TV-Z]{26}$/,
  agent: /^agt_[0-9A-HJKMNP-TV-Z]{26}$/,
  connection: /^con_[0-9A-HJKMNP-TV-Z]{26}$/,
  skill: /^skl_[0-9A-HJKMNP-TV-Z]{26}$/,
  approval: /^apr_[0-9A-HJKMNP-TV-Z]{26}$/,
  lease: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  slug: /^[a-z][a-z0-9_]{1,60}$/,
}

function id(a: Args, k: string, re: RegExp): string {
  const v = a[k]
  if (typeof v !== "string" || !re.test(v)) throw new EngineArgError(`parâmetro "${k}" inválido`)
  return v
}
function text(a: Args, k: string, max: number, required = false): string | null {
  const v = a[k]
  if (v === undefined || v === null || v === "") {
    if (required) throw new EngineArgError(`parâmetro "${k}" é obrigatório`)
    return null
  }
  if (typeof v !== "string") throw new EngineArgError(`parâmetro "${k}" inválido`)
  if (v.length > max) throw new EngineArgError(`parâmetro "${k}" grande demais (máx. ${max})`)
  return v
}
function int(a: Args, k: string, min: number, max: number, dflt: number): number {
  const v = a[k]
  if (v === undefined || v === null) return dflt
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new EngineArgError(`parâmetro "${k}" inválido`)
  return v
}
function obj(a: Args, k: string, maxBytes: number, required = false): Record<string, unknown> | null {
  const v = a[k]
  if (v === undefined || v === null) {
    if (required) throw new EngineArgError(`parâmetro "${k}" é obrigatório`)
    return null
  }
  if (typeof v !== "object" || Array.isArray(v)) throw new EngineArgError(`parâmetro "${k}" deve ser um objeto`)
  if (JSON.stringify(v).length > maxBytes) throw new EngineArgError(`parâmetro "${k}" grande demais`)
  return v as Record<string, unknown>
}
const lease = (a: Args) => ({ job: id(a, "job_id", ID.job), lease: id(a, "lease_id", ID.lease) })

export interface EngineTool {
  description: string
  input: Record<string, unknown>
  run: (workerId: string, a: Args) => Promise<unknown>
}

const jobProps = { job_id: { type: "string" }, lease_id: { type: "string" } }
const schema = (required: string[], extra: Record<string, unknown> = {}) => ({ type: "object", properties: { ...jobProps, ...extra }, required: ["job_id", "lease_id", ...required] })

export function dockEngineTools(rpc: Rpc): Record<string, EngineTool> {
  const check = (workerId: string, job: string, leaseId: string) =>
    rpc("office_engine_check", { p_worker_id: workerId, p_job_public_id: job, p_lease_id: leaseId }) as Promise<string>

  return {
    office_get_delivery: {
      description: "Contexto da entrega do Dock (office-delivery/v1): bot, conversa, IAs em ordem, skills e conectores que o bot pode usar.",
      input: schema([]),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        return rpc("office_delivery", { p_worker_id: w, p_job_public_id: job, p_lease_id: l })
      },
    },
    office_get_skill: {
      description: "Pacote hzk-skill/v1 de uma skill da entrega. Confira sha256(body + \"\\n\" + files_text).",
      input: schema(["skill_id", "version"], { skill_id: { type: "string" }, version: { type: "number" } }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        const rows = (await rpc("office_skill_package", {
          p_worker_id: w, p_job_public_id: job, p_lease_id: l, p_skill: id(a, "skill_id", ID.skill), p_version: int(a, "version", 1, 100000, 0),
        })) as unknown[]
        return Array.isArray(rows) ? rows[0] ?? null : rows
      },
    },
    office_post_message: {
      description: "Grava a mensagem do bot com a IA que respondeu (e a troca para a reserva, se houve).",
      input: schema(["seq", "body", "connection_id"], {
        seq: { type: "number" }, kind: { type: "string" }, body: { type: "string" }, report: { type: "object" },
        connection_id: { type: "string" }, model: { type: "string" }, fallback_from: { type: "string" }, fallback_reason: { type: "string" },
      }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        const kind = text(a, "kind", 20) ?? "texto"
        if (!["texto", "relatorio", "progresso", "aviso"].includes(kind)) throw new EngineArgError(`parâmetro "kind" inválido`)
        const args = {
          p_job_public_id: job, p_lease_id: l, p_seq: int(a, "seq", 0, 999, 0), p_kind: kind,
          p_body: text(a, "body", 32000, true), p_report: obj(a, "report", 30000),
          p_connection_id: id(a, "connection_id", ID.connection), p_model: text(a, "model", 120),
          p_fallback_from: text(a, "fallback_from", 120), p_fallback_reason: text(a, "fallback_reason", 200),
        }
        await check(w, job, l)
        return { message_id: await rpc("office_post_agent_message", args) }
      },
    },
    office_request_action: {
      description: "Porteiro: TODA ação de conector da empresa passa aqui antes de acontecer, inclusive leitura.",
      input: schema(["agent_id", "connector_id", "action_key", "connection_id", "idempotency_key"], {
        agent_id: { type: "string" }, connector_id: { type: "string" }, action_key: { type: "string" }, connection_id: { type: "string" },
        item_count: { type: "number" }, tainted: { type: "boolean" }, origin_detail: { type: "string" }, title: { type: "string" },
        summary: { type: "string" }, draft: { type: "object" }, idempotency_key: { type: "string" },
      }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        const key = text(a, "idempotency_key", 100, true) as string
        if (key.length < 8) throw new EngineArgError(`parâmetro "idempotency_key" inválido`)
        const rows = (await rpc("office_request_action", {
          p_worker_id: w, p_job_public_id: job, p_lease_id: l, p_agent_id: id(a, "agent_id", ID.agent),
          p_connector_id: id(a, "connector_id", ID.slug), p_action_key: id(a, "action_key", ID.slug),
          p_connection_id: id(a, "connection_id", ID.connection), p_item_count: int(a, "item_count", 1, 100000, 1),
          p_tainted: a.tainted === true, p_origin_detail: text(a, "origin_detail", 300), p_title: text(a, "title", 160),
          p_summary: text(a, "summary", 2000), p_draft: obj(a, "draft", 30000), p_idempotency_key: key,
        })) as unknown[]
        return Array.isArray(rows) ? rows[0] : rows
      },
    },
    office_take_approval: {
      description: "Entrega office_action: pega o rascunho aprovado para executar (uma vez só).",
      input: schema(["approval_id"], { approval_id: { type: "string" } }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        const apr = id(a, "approval_id", ID.approval)
        await check(w, job, l)
        const rows = (await rpc("office_take_approval", { p_job_public_id: job, p_lease_id: l, p_approval_id: apr })) as unknown[]
        return { action: Array.isArray(rows) ? rows[0] ?? null : rows }
      },
    },
    office_finish_action: {
      description: "Relata o fim da ação aprovada (executada ou falhou).",
      input: schema(["approval_id", "ok"], { approval_id: { type: "string" }, ok: { type: "boolean" }, result: { type: "string" } }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        const apr = id(a, "approval_id", ID.approval)
        await check(w, job, l)
        await rpc("office_finish_action", { p_job_public_id: job, p_lease_id: l, p_approval_id: apr, p_ok: a.ok === true, p_result: text(a, "result", 2000) })
        return { ok: true }
      },
    },
    office_report_connection: {
      description: "Estado de uma IA da entrega: conectada, sem_cota (com resets_at) ou erro.",
      input: schema(["connection_id", "status"], { connection_id: { type: "string" }, status: { type: "string" }, resets_at: { type: "string" } }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        const status = text(a, "status", 20, true) as string
        if (!["conectada", "sem_cota", "erro"].includes(status)) throw new EngineArgError(`parâmetro "status" inválido`)
        const resets = text(a, "resets_at", 40)
        if (resets && Number.isNaN(Date.parse(resets))) throw new EngineArgError(`parâmetro "resets_at" inválido`)
        await rpc("office_report_connection", { p_worker_id: w, p_job_public_id: job, p_lease_id: l, p_connection: id(a, "connection_id", ID.connection), p_status: status, p_resets_at: resets })
        return { ok: true }
      },
    },
    office_record_usage: {
      description: "Uso da entrega (tokens e tempo), só o dono vê.",
      input: schema(["connection_id"], { connection_id: { type: "string" }, model: { type: "string" }, input_tokens: { type: "number" }, output_tokens: { type: "number" }, duration_ms: { type: "number" }, fallback_from: { type: "string" } }),
      run: async (w, a) => {
        const { job, lease: l } = lease(a)
        await rpc("office_record_usage", {
          p_worker_id: w, p_job_public_id: job, p_lease_id: l, p_connection: id(a, "connection_id", ID.connection), p_model: text(a, "model", 120),
          p_input_tokens: int(a, "input_tokens", 0, 50_000_000, 0), p_output_tokens: int(a, "output_tokens", 0, 50_000_000, 0),
          p_duration_ms: int(a, "duration_ms", 0, 86_400_000, 0), p_fallback_from: text(a, "fallback_from", 120),
        })
        return { ok: true }
      },
    },
    office_set_pc_pending: {
      description: "Avisa que há (lote/bloqueio) ou não há (null) confirmação pendente no PC para um bot. Só o tipo, nunca o conteúdo.",
      input: { type: "object", properties: { agent_id: { type: "string" }, gate: { type: ["string", "null"] } }, required: ["agent_id"] },
      run: async (w, a) => {
        const gate = a.gate === null || a.gate === undefined ? null : text(a, "gate", 10)
        if (gate !== null && !["lote", "bloqueio"].includes(gate)) throw new EngineArgError(`parâmetro "gate" inválido`)
        await rpc("office_set_pc_pending", { p_worker_id: w, p_agent: id(a, "agent_id", ID.agent), p_gate: gate })
        return { ok: true }
      },
    },
  }
}

/** Resultado de uma entrega do Dock ao concluir (complete_job). As mensagens já foram gravadas uma a uma. */
export function validateOfficeResult(jobType: string, raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  if (!o) return { ok: false, errors: ["o resultado deve ser um objeto"] }
  const ids = o.message_ids
  if (!Array.isArray(ids) || ids.length > 20 || !ids.every((x) => typeof x === "string" && /^msg_[0-9A-HJKMNP-TV-Z]{26}$/.test(x)))
    return { ok: false, errors: ["message_ids: lista de até 20 ids msg_…"] }
  if (jobType === "office_reply" && ids.length === 0) return { ok: false, errors: ["office_reply precisa de pelo menos uma mensagem"] }
  const conn = o.connection_id
  if (conn !== undefined && conn !== null && (typeof conn !== "string" || !ID.connection.test(conn))) return { ok: false, errors: ["connection_id inválido"] }
  const value: Record<string, unknown> = { message_ids: ids }
  if (conn) value.connection_id = conn
  if (typeof o.fallback === "boolean") value.fallback = o.fallback
  if (typeof o.tainted === "boolean") value.tainted = o.tainted
  return { ok: true, value }
}

export const OFFICE_JOB_TYPES = new Set(["office_reply", "office_action"])
