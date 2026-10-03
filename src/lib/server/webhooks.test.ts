import { createServer, type IncomingMessage, type Server } from "node:http"
import { randomBytes } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")

// Banco falso: só o que o envio usa (claim_deliveries, finish_delivery, ai_settings).
const finished: Record<string, unknown>[] = []
let due: Record<string, unknown>[] = []
vi.mock("./supabase-admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "claim_deliveries") {
        const d = due
        due = []
        return { data: d, error: null }
      }
      if (fn === "finish_delivery") finished.push(args)
      return { data: null, error: null }
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

let server: Server
let mode: "down" | "up" = "down"
const received: { headers: IncomingMessage["headers"]; body: string }[] = []
let url = ""

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      received.push({ headers: req.headers, body })
      res.writeHead(mode === "down" ? 503 : 200).end(mode === "down" ? "fora do ar" : "ok")
    })
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const addr = server.address()
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/hook`
})
afterAll(() => new Promise<void>((r) => server.close(() => r())))

describe("entrega de webhook (testes 14 e 15)", async () => {
  const { encrypt } = await import("./crypto")
  const { deliverDue } = await import("./webhooks")
  const { verify } = await import("./webhook-signing")
  const secret = "whsec_teste"
  const item = (attempt: number) => ({
    delivery_id: "dlv_1",
    webhook_id: "wh_1",
    event_id: "evt_1",
    attempt_count: attempt,
    endpoint: url,
    secret_enc: encrypt(secret, "TOKEN_ENCRYPTION_KEY", "webhook:wh_1"),
    event_type: "lead.approved",
    entity_type: "lead",
    entity_id: "L1",
    actor_type: "human",
    actor_id: "u1",
    metadata: { name: "Costa Lion" },
    correlation_id: "lead:L1",
    causation_id: null,
    event_created_at: "2026-10-03T12:00:00Z",
  })

  it("endpoint fora do ar → falha registrada com nova tentativa agendada (não trava nada)", async () => {
    due = [item(1)]
    const r = await deliverDue()
    expect(r).toEqual({ attempted: 1, delivered: 0 })
    expect(finished.at(-1)).toMatchObject({ p_id: "dlv_1", p_ok: false, p_status: 503, p_error: "HTTP 503" })
    expect(finished.at(-1)!.p_retry_at).toBeTruthy()
  })

  it("voltou ao ar → entregue, com assinatura válida e cabeçalhos completos", async () => {
    mode = "up"
    due = [item(2)]
    expect(await deliverDue()).toEqual({ attempted: 1, delivered: 1 })
    const last = received.at(-1)!
    expect(last.headers["x-operacionalos-event-id"]).toBe("evt_1")
    expect(last.headers["x-operacionalos-delivery-id"]).toBe("dlv_1")
    const check = verify({ secrets: [secret], signature: String(last.headers["x-operacionalos-signature"]), timestamp: String(last.headers["x-operacionalos-timestamp"]), rawBody: last.body })
    expect(check).toEqual({ ok: true })
    expect(JSON.parse(last.body)).toMatchObject({ event_id: "evt_1", event_type: "lead.approved", delivery_id: "dlv_1", data: { correlation_id: "lead:L1" } })
    expect(last.body).not.toContain(secret) // segredo nunca vai no corpo
  })

  it("esgotou as tentativas → dead letter (sem retry agendado)", async () => {
    mode = "down"
    due = [item(8)]
    await deliverDue()
    expect(finished.at(-1)).toMatchObject({ p_ok: false, p_retry_at: null })
  })
})
