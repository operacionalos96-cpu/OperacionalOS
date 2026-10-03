import { describe, expect, it } from "vitest"
import { DEFAULT_QUEUE_CONFIG, afterFailure, backoffSeconds, idempotencyKey, isPublicId, mergeConfig, pollAdvice, publicId, satisfies, ulid, validateJobResult } from "./jobs"

describe("IDs globais", () => {
  it("ULID com prefixo, 26 caracteres, ordenável por tempo e sem repetir", () => {
    const a = publicId("job", 1_700_000_000_000)
    const b = publicId("job", 1_700_000_000_001)
    expect(isPublicId(a, "job")).toBe(true)
    expect(a < b).toBe(true)
    expect(new Set(Array.from({ length: 2000 }, () => ulid())).size).toBe(2000)
  })
})

describe("schemas de resultado por tipo de job", () => {
  it("análise de site: aceita o formato certo e recusa o inválido (teste 13)", () => {
    const ok = validateJobResult("analyze_website", { summary: "Site antigo", problems: ["sem mobile"], opportunities: ["redesign"], qualification_score: 8, confidence: 0.7 })
    expect(ok.ok).toBe(true)
    const bad = validateJobResult("analyze_website", { summary: "", problems: "lento", qualification_score: 11, confidence: 2 })
    expect(bad.ok).toBe(false)
    expect(!bad.ok && bad.errors.length).toBeGreaterThanOrEqual(4)
    expect(validateJobResult("tipo_inexistente", {}).ok).toBe(false)
  })
  it("feedback: hipóteses exigem teste proposto", () => {
    expect(validateJobResult("analyze_human_feedback", { hypotheses: [{ title: "X", confidence: 0.6, proposed_test: "testar 20 leads" }] }).ok).toBe(true)
    expect(validateJobResult("analyze_human_feedback", { hypotheses: [{ title: "X", confidence: 0.6 }] }).ok).toBe(false)
  })
})

describe("capabilities (teste 12)", () => {
  it("worker só recebe job se tiver TODAS as capabilities", () => {
    expect(satisfies(["web", "mcp_write"], ["reasoning", "web", "mcp_read", "mcp_write"])).toBe(true)
    expect(satisfies(["web", "mcp_write"], ["reasoning", "web", "mcp_read"])).toBe(false)
  })
})

describe("retry com backoff + dead letter (testes 9 e 10)", () => {
  it("dobra a cada tentativa, respeita o teto e espalha com jitter", () => {
    const mid = () => 0.5 // jitter neutro
    expect([1, 2, 3, 4, 5].map((n) => backoffSeconds(n, undefined, mid))).toEqual([60, 120, 240, 480, 960])
    expect(backoffSeconds(20, undefined, mid)).toBe(3600)
    const spread = new Set(Array.from({ length: 50 }, () => backoffSeconds(3)))
    expect(spread.size).toBeGreaterThan(5) // workers não acordam juntos
    for (const s of spread) expect(s).toBeGreaterThanOrEqual(192) // 240 ± 20%
  })
  it("depois do máximo de tentativas vai para dead_letter", () => {
    const now = new Date("2026-10-03T12:00:00Z")
    expect(afterFailure(2, 5, now, undefined, () => 0.5)).toEqual({ status: "retry_scheduled", availableAt: new Date("2026-10-03T12:02:00Z") })
    expect(afterFailure(5, 5, now).status).toBe("dead_letter")
  })
})

describe("polling adaptativo (sem acordar IA)", () => {
  it("com trabalho: logo; vazio: espera cada vez mais", () => {
    expect(pollAdvice(3, 0)).toEqual({ retry_after_seconds: 3, reason: "backlog" })
    expect(pollAdvice(0, 0).retry_after_seconds).toBe(30)
    expect(pollAdvice(0, 300).retry_after_seconds).toBe(60)
    expect(pollAdvice(0, 1200).retry_after_seconds).toBe(300)
    expect(pollAdvice(0, 7200)).toEqual({ retry_after_seconds: 900, reason: "long_idle" })
  })
  it("configuração vem do banco, com padrões para o que faltar ou vier inválido", () => {
    const c = mergeConfig({ leaseSeconds: 120, backoff: { baseSeconds: 10 }, idlePoll: [{ idleFor: 0, wait: 5 }], webhook: { toleranceSeconds: "x" } })
    expect(c.leaseSeconds).toBe(120)
    expect(c.backoff).toEqual({ baseSeconds: 10, capSeconds: 3600, jitter: 0.2 })
    expect(c.idlePoll).toEqual([{ idleFor: 0, wait: 5 }])
    expect(c.webhook.toleranceSeconds).toBe(DEFAULT_QUEUE_CONFIG.webhook.toleranceSeconds)
  })
})

describe("idempotência", () => {
  it("chave determinística: o mesmo trabalho gera a mesma chave (teste 11 completa no banco)", () => {
    expect(idempotencyKey("analyze_website", "lead_123")).toBe("analyze_website:lead_123:v1")
    expect(idempotencyKey("analyze_website", "lead_123", 2)).not.toBe(idempotencyKey("analyze_website", "lead_123"))
  })
})
