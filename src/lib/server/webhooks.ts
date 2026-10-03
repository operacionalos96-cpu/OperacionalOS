import "server-only"
import { randomBytes } from "node:crypto"
import { afterFailure, publicId } from "@/lib/domain/jobs"
import { decrypt, encrypt } from "./crypto"
import { queueConfig } from "./jobs"
import { supabaseAdmin } from "./supabase-admin"
import { DELIVERY_ID_HEADER, EVENT_ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, sign, verify } from "./webhook-signing"

/**
 * Webhooks de SAÍDA (OperacionalOS → n8n, Make, servidor próprio, worker com endpoint).
 * Segredo criptografado no banco (AES-GCM, TOKEN_ENCRYPTION_KEY, amarrado ao id) e
 * mostrado uma vez só. Entrega assíncrona pelo agendador, assinada (HMAC-SHA256),
 * com retry exponencial + jitter e dead letter. Nunca registra segredo em log.
 */
const seal = (id: string, secret: string) => encrypt(secret, "TOKEN_ENCRYPTION_KEY", `webhook:${id}`)
const open = (id: string, sealed: string) => decrypt(sealed, "TOKEN_ENCRYPTION_KEY", `webhook:${id}`)
const newSecret = () => `whsec_${randomBytes(32).toString("base64url")}`

export function checkEndpoint(url: string) {
  try {
    const u = new URL(url)
    const local = /^(localhost|127\.0\.0\.1)$/.test(u.hostname)
    if (u.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) return "use HTTPS"
    if (local && process.env.NODE_ENV === "production") return "endereço local não é permitido em produção"
    if (u.username || u.password) return "não coloque usuário/senha na URL"
    if (/(secret|token|key)=/i.test(u.search)) return "nunca coloque segredo na URL"
    return null
  } catch {
    return "URL inválida"
  }
}

export async function createWebhook(input: { name: string; endpoint: string; eventTypes: string[]; createdBy: string }) {
  const problem = checkEndpoint(input.endpoint)
  if (problem) throw new Error(problem)
  const id = publicId("wh")
  const secret = newSecret()
  const { error } = await supabaseAdmin()
    .from("webhooks")
    .insert({ id, name: input.name.slice(0, 80), endpoint: input.endpoint, secret_enc: seal(id, secret), secret_hint: secret.slice(-4), event_types: input.eventTypes.slice(0, 50), created_by: input.createdBy })
  if (error) throw error
  return { id, secret }
}

/** Troca o segredo: o anterior continua válido (secret_prev) até a próxima troca. */
export async function rotateWebhookSecret(id: string) {
  const db = supabaseAdmin()
  const { data } = await db.from("webhooks").select("secret_enc").eq("id", id).maybeSingle()
  if (!data) throw new Error("webhook não encontrado")
  const secret = newSecret()
  const { error } = await db.from("webhooks").update({ secret_prev_enc: data.secret_enc, secret_enc: seal(id, secret), secret_hint: secret.slice(-4), updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
  return secret
}

type Due = {
  delivery_id: string
  webhook_id: string
  event_id: string
  attempt_count: number
  endpoint: string
  secret_enc: string
  event_type: string
  entity_type: string
  entity_id: string
  actor_type: string
  actor_id: string
  metadata: Record<string, unknown>
  correlation_id: string | null
  causation_id: string | null
  event_created_at: string
}

/** Envia as entregas devidas (chamado pelo agendador). Não bloqueia nenhuma ação do usuário. */
export async function deliverDue(limit = 25) {
  const cfg = await queueConfig()
  const db = supabaseAdmin()
  const { data, error } = await db.rpc("claim_deliveries", { p_limit: limit })
  if (error) throw error
  const due = (data ?? []) as Due[]
  let delivered = 0
  await Promise.all(
    due.map(async (d) => {
      const body = JSON.stringify({
        event_id: d.event_id,
        event_type: d.event_type,
        timestamp: d.event_created_at,
        delivery_id: d.delivery_id,
        data: { entity_type: d.entity_type, entity_id: d.entity_id, actor_type: d.actor_type, actor_id: d.actor_id, metadata: d.metadata, correlation_id: d.correlation_id, causation_id: d.causation_id },
      })
      const ts = Math.floor(Date.now() / 1000)
      let status = 0
      let preview = ""
      let err: string | null = null
      try {
        const res = await fetch(d.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "OperacionalOS-Webhooks/1",
            [SIGNATURE_HEADER]: sign(open(d.webhook_id, d.secret_enc), ts, body),
            [TIMESTAMP_HEADER]: String(ts),
            [EVENT_ID_HEADER]: d.event_id,
            [DELIVERY_ID_HEADER]: d.delivery_id,
          },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(cfg.webhook.timeoutMs),
        })
        status = res.status
        preview = (await res.text().catch(() => "")).slice(0, 500)
        if (status < 200 || status >= 300) err = `HTTP ${status}`
      } catch (e) {
        err = e instanceof Error ? (e.name === "TimeoutError" ? "tempo esgotado" : e.message.slice(0, 200)) : "falha de rede"
      }
      const ok = !err
      const next = ok ? null : afterFailure(d.attempt_count, cfg.webhook.maxAttempts, new Date(), cfg.backoff)
      await db.rpc("finish_delivery", { p_id: d.delivery_id, p_ok: ok, p_status: status || null, p_preview: preview, p_error: err, p_retry_at: next?.availableAt?.toISOString() ?? null })
      if (ok) delivered++
    }),
  )
  return { attempted: due.length, delivered }
}

/**
 * Para webhooks que CHEGAM no OperacionalOS (futuros consumers): valida assinatura,
 * janela de tempo e replay (event_id único no banco) ANTES de processar.
 */
export async function receiveSigned(req: Request, source: string, secrets: string[]) {
  const rawBody = await req.text()
  const cfg = await queueConfig()
  const check = verify({ secrets, signature: req.headers.get(SIGNATURE_HEADER), timestamp: req.headers.get(TIMESTAMP_HEADER), rawBody, toleranceSeconds: cfg.webhook.toleranceSeconds })
  if (!check.ok) return { ok: false as const, status: 401, reason: check.reason }
  const eventId = req.headers.get(EVENT_ID_HEADER)
  if (!eventId) return { ok: false as const, status: 400, reason: "missing_event_id" }
  const { data: first } = await supabaseAdmin().rpc("register_receipt", { p_source: source, p_event_id: eventId })
  if (!first) return { ok: true as const, duplicate: true, body: null } // replay/duplicado: confirma sem processar
  return { ok: true as const, duplicate: false, body: JSON.parse(rawBody) as unknown }
}
