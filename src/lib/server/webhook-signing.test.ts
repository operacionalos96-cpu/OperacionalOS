import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

describe("assinatura de webhook", async () => {
  const { sign, verify } = await import("./webhook-signing")
  const body = JSON.stringify({ event_id: "evt_1", event_type: "lead.approved", data: { id: "x" } })
  const now = 1_790_000_000_000
  const ts = Math.floor(now / 1000)

  it("assinatura válida passa (formato v1=hex)", () => {
    const sig = sign("segredo", ts, body)
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/)
    expect(verify({ secrets: ["segredo"], signature: sig, timestamp: String(ts), rawBody: body, now })).toEqual({ ok: true })
  })

  it("assinatura inválida, corpo alterado ou segredo errado: recusa (teste 3)", () => {
    const sig = sign("segredo", ts, body)
    expect(verify({ secrets: ["outro"], signature: sig, timestamp: String(ts), rawBody: body, now })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verify({ secrets: ["segredo"], signature: sig, timestamp: String(ts), rawBody: body + " ", now })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verify({ secrets: ["segredo"], signature: "v1=abc", timestamp: String(ts), rawBody: body, now }).ok).toBe(false)
  })

  it("timestamp vencido (fora dos 5 min) ou ausente: recusa (teste 4)", () => {
    const old = ts - 301
    expect(verify({ secrets: ["segredo"], signature: sign("segredo", old, body), timestamp: String(old), rawBody: body, now })).toEqual({ ok: false, reason: "expired" })
    expect(verify({ secrets: ["segredo"], signature: sign("segredo", ts, body), timestamp: null, rawBody: body, now }).ok).toBe(false)
    // trocar o timestamp invalida a assinatura (não dá para "renovar" um pedido antigo)
    expect(verify({ secrets: ["segredo"], signature: sign("segredo", old, body), timestamp: String(ts), rawBody: body, now })).toEqual({ ok: false, reason: "bad_signature" })
  })

  it("rotação: aceita o segredo novo e o anterior durante a troca", () => {
    const sig = sign("antigo", ts, body)
    expect(verify({ secrets: ["novo", "antigo"], signature: sig, timestamp: String(ts), rawBody: body, now }).ok).toBe(true)
  })
})
