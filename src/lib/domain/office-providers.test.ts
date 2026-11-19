import { describe, expect, it } from "vitest"
import { OFFICE_PROVIDERS, isFreeCost, providerInfo } from "./office-providers"

describe("catálogo de provedores", () => {
  it("ids únicos e no formato aceito pelo banco", () => {
    const ids = OFFICE_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9_]{1,30}$/)
  })

  it("primeira leva da Ponte: só grátis e sem aviso de termos", () => {
    const first = OFFICE_PROVIDERS.filter((p) => p.wave === 1)
    expect(first.map((p) => p.id)).toEqual(["ollama", "lmstudio", "openrouter"])
    for (const p of first) {
      expect(isFreeCost(p.cost)).toBe(true)
      expect(p.terms).toBeUndefined()
    }
  })

  it("toda assinatura vem com o aviso de termos; imagem existe em algum provedor", () => {
    for (const p of OFFICE_PROVIDERS.filter((x) => x.kind === "assinatura")) expect(p.terms, p.id).toBeTruthy()
    expect(providerInfo("claude_code")?.terms).toMatch(/chave de API/)
    expect(OFFICE_PROVIDERS.some((p) => p.capabilities.includes("imagem"))).toBe(true)
    expect(isFreeCost("pago")).toBe(false)
  })
})
