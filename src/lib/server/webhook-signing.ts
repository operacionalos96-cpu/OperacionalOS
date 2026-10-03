import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Assinatura dos webhooks do OperacionalOS (saída e entrada usam a mesma regra):
 *
 *   X-OperacionalOS-Signature: v1=<hex(HMAC-SHA256(secret, timestamp + "." + corpo_cru))>
 *   X-OperacionalOS-Timestamp: <segundos unix>
 *   X-OperacionalOS-Event-ID / X-OperacionalOS-Delivery-ID
 *
 * Quem recebe: corpo CRU → timestamp dentro da janela → HMAC em tempo constante →
 * event_id ainda não visto (replay) → só então processa. Aceita mais de um segredo
 * (atual + anterior) para trocar a chave sem derrubar ninguém.
 */
export const SIGNATURE_HEADER = "x-operacionalos-signature"
export const TIMESTAMP_HEADER = "x-operacionalos-timestamp"
export const EVENT_ID_HEADER = "x-operacionalos-event-id"
export const DELIVERY_ID_HEADER = "x-operacionalos-delivery-id"

export function sign(secret: string, timestamp: number | string, rawBody: string) {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`
}

export type VerifyResult = { ok: true } | { ok: false; reason: "missing_headers" | "bad_timestamp" | "expired" | "bad_signature" }

export function verify(opts: { secrets: string[]; signature: string | null; timestamp: string | null; rawBody: string; now?: number; toleranceSeconds?: number }): VerifyResult {
  const { signature, timestamp, rawBody, secrets } = opts
  if (!signature || !timestamp || !secrets.length) return { ok: false, reason: "missing_headers" }
  const ts = Number(timestamp)
  if (!Number.isInteger(ts)) return { ok: false, reason: "bad_timestamp" }
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000)
  if (Math.abs(nowSec - ts) > (opts.toleranceSeconds ?? 300)) return { ok: false, reason: "expired" }
  const got = Buffer.from(signature)
  for (const s of secrets) {
    const want = Buffer.from(sign(s, ts, rawBody))
    if (got.length === want.length && timingSafeEqual(got, want)) return { ok: true }
  }
  return { ok: false, reason: "bad_signature" }
}
