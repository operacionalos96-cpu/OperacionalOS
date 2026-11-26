import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { publicId } from "@/lib/domain/jobs"
import { rateHit } from "./rate-limit"
import { supabaseAdmin } from "./supabase-admin"

/**
 * Workers (Claude, ChatGPT, Gemini, automações…) se autenticam com um token próprio.
 * No banco fica só o HASH (sha256). O token aparece uma única vez, ao criar.
 * Escopos dizem o que cada worker pode fazer — conteúdo de lead/site nunca muda escopo.
 */
export const SCOPES = {
  "queue:read": "Ver status da fila e a própria configuração",
  "jobs:claim": "Pegar jobs da fila",
  "jobs:execute": "Iniciar, renovar, reportar, concluir, falhar e devolver os PRÓPRIOS jobs",
  "context:read": "Ler o contexto do job (dados do lead etc.)",
  "knowledge:read": "Ler aprendizados e hipóteses",
  "whatsapp:funnel": "Extensão do WhatsApp: achar lead pelo número, ver o passo do funil e registrar envio/resposta",
  "office:engine": "Motor do HZK Dock no PC liberado: contexto da entrega, mensagens do bot, porteiro, cota e uso (só as entregas do dono do PC)",
} as const
export type Scope = keyof typeof SCOPES

export const CAPABILITIES = ["reasoning", "web", "filesystem", "mcp_read", "mcp_write", "video_render"] as const

export interface Worker {
  id: string
  name: string
  agent_id: string | null
  engine: string | null
  capabilities: string[]
  scopes: Scope[]
  /** Membro (team id) que criou o token — é quem "assina" o que a extensão registrar. */
  createdBy: string | null
  /** Dono do trabalhador pessoal (PC liberado, 0026/0028). null = trabalhador da empresa. */
  ownerTeamId: string | null
  /** nuvem = motor do Dock no servidor (0030): só por dentro do servidor, nunca por token */
  kind: "servico" | "pc" | "nuvem"
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

export function newToken() {
  const token = `oos_${randomBytes(32).toString("base64url")}`
  return { token, token_hash: hash(token), token_hint: token.slice(-4) }
}

export async function createWorker(input: { name: string; agentId?: string; engine?: string; capabilities: string[]; scopes: Scope[]; createdBy: string }) {
  const { token, token_hash, token_hint } = newToken()
  const id = publicId("wrk")
  const caps = input.capabilities.filter((c) => (CAPABILITIES as readonly string[]).includes(c))
  const scopes = input.scopes.filter((s) => s in SCOPES)
  const { error } = await supabaseAdmin()
    .from("workers")
    .insert({ id, name: input.name.slice(0, 80), agent_id: input.agentId ?? null, engine: input.engine?.slice(0, 40) ?? null, capabilities: caps, scopes, token_hash, token_hint, created_by: input.createdBy })
  if (error) throw error
  return { id, token }
}

export async function rotateWorkerToken(id: string) {
  const { token, token_hash, token_hint } = newToken()
  const { error } = await supabaseAdmin().from("workers").update({ token_hash, token_hint }).eq("id", id)
  if (error) throw error
  return token
}

export class WorkerAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

/** Autentica pelo cabeçalho Authorization: Bearer oos_… — e limita uso por worker. */
export async function authWorker(req: Request): Promise<Worker> {
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""
  if (!/^oos_[A-Za-z0-9_-]{30,}$/.test(token)) throw new WorkerAuthError("token ausente ou inválido", 401)
  const { data } = await supabaseAdmin()
    .from("workers")
    .select("id, name, agent_id, engine, capabilities, scopes, enabled, created_by, owner_team_id, kind, pc_status")
    .eq("token_hash", hash(token))
    .maybeSingle()
  if (!data || !data.enabled) throw new WorkerAuthError("token ausente ou inválido", 401)
  // PC liberado só vale aprovado (o banco já impede ligado sem aprovação; aqui é a segunda trava)
  if (data.kind === "pc" && (data.pc_status !== "aprovado" || !data.owner_team_id)) throw new WorkerAuthError("token ausente ou inválido", 401)
  // motor na nuvem não tem token (0030); se alguém achar um que bata com o hash, aqui ele não entra
  if (data.kind === "nuvem") throw new WorkerAuthError("token ausente ou inválido", 401)
  if (!(await rateHit(`worker:${data.id}`, 240, 60))) throw new WorkerAuthError("muitas requisições — respeite retry_after_seconds", 429)
  await supabaseAdmin().from("workers").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id)
  return { id: data.id, name: data.name, agent_id: data.agent_id, engine: data.engine, capabilities: data.capabilities ?? [], scopes: (data.scopes ?? []) as Scope[], createdBy: data.created_by ?? null, ownerTeamId: data.owner_team_id ?? null, kind: data.kind === "pc" ? "pc" : "servico" }
}

export function requireScope(w: Worker, scope: Scope) {
  if (!w.scopes.includes(scope)) throw new WorkerAuthError(`sem permissão: precisa do escopo ${scope}`, 403)
}
