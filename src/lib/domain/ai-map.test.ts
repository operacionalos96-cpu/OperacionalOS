import { describe, expect, it } from "vitest"
import { buildPrompt, outlineText, parseAiResult, validateAiRequest } from "./ai-map"

describe("IA no mapa", () => {
  it("valida o pedido e corta tamanhos", () => {
    expect(validateAiRequest({ action: "apagar", focus: { label: "x" }, outline: "" })).toBeNull()
    expect(validateAiRequest({ action: "expandir", focus: { label: "  " }, outline: "" })).toBeNull()
    const r = validateAiRequest({ action: "expandir", mapTitle: "M", focus: { label: "Oferta" }, outline: "a".repeat(9000) })!
    expect(r.outline).toHaveLength(6000)
    expect(r.focus.label).toBe("Oferta")
  })

  it("monta a lista numerada e o pedido certo para cada ação", () => {
    const text = outlineText([
      { number: "1", depth: 0, node: { label: "Operação" } },
      { number: "1.1", depth: 1, node: { label: "" } },
    ])
    expect(text).toBe("1 Operação\n  1.1 (sem texto)")
    const p = buildPrompt({ action: "resumir", mapTitle: "M", focus: { label: "Operação" }, outline: text })
    expect(p).toContain('{"summary"')
    expect(buildPrompt({ action: "lacunas", mapTitle: "M", focus: { label: "Operação" }, outline: text })).toContain('{"items"')
  })

  it("lê a resposta: tira marcadores, repetidos e o que já existe; aceita ```json", () => {
    const raw = '```json\n{"items": ["1. Definir preço", "Definir preço", "- Oferta", "", 3, "Testar anúncio"]}\n```'
    expect(parseAiResult("expandir", raw, ["oferta"])).toEqual({ items: ["Definir preço", "Testar anúncio"] })
    expect(parseAiResult("expandir", "não é json")).toBeNull()
    expect(parseAiResult("resumir", { summary: "  Tudo certo.  " })).toEqual({ summary: "Tudo certo." })
    expect(parseAiResult("resumir", { items: [] })).toBeNull()
  })
})
