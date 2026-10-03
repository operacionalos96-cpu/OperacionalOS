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

  it("pedido livre: exige o pedido e monta o prompt com as operações", () => {
    expect(validateAiRequest({ action: "pedido", focus: { label: "Mapa" }, outline: "1 A" })).toBeNull()
    const r = validateAiRequest({ action: "pedido", focus: { label: "Mapa" }, outline: "1 A", request: "  sugira passos  " })!
    expect(r.request).toBe("sugira passos")
    const p = buildPrompt(r)
    expect(p).toContain('"sugira passos"')
    expect(p).toContain('"op":"adicionar"')
  })

  it("pedido livre: lê o plano com desconfiança", () => {
    const raw = {
      answer: "  Faltam métricas. ",
      organize: true,
      ops: [
        { op: "adicionar", ref: "n1", parent: "1.2", label: "Funil" },
        { op: "adicionar", parent: "n1", label: "Topo" }, // pai = balão novo criado antes
        { op: "adicionar", parent: "n9", label: "Pai inexistente" }, // vira solto
        { op: "adicionar", label: "" }, // sem texto: fora
        { op: "renomear", target: "1", label: "Operação" },
        { op: "renomear", target: "abc", label: "x" }, // número inválido: fora
        { op: "anotar", target: "1.1", kind: "citacao", text: "", app: "Hotmart" },
        { op: "anotar", target: "1.1", kind: "estranho", text: "ok" }, // tipo desconhecido → comentário
        { op: "apagar_tudo" }, // desconhecida: fora
        { op: "remover", target: "1.3" },
      ],
    }
    const r = parseAiResult("pedido", raw)
    expect(r).toEqual({
      plan: {
        answer: "Faltam métricas.",
        organize: true,
        ops: [
          { op: "adicionar", ref: "n1", parent: "1.2", label: "Funil" },
          { op: "adicionar", parent: "n1", label: "Topo" },
          { op: "adicionar", label: "Pai inexistente" },
          { op: "renomear", target: "1", label: "Operação" },
          { op: "anotar", target: "1.1", kind: "citacao", text: "", app: "Hotmart" },
          { op: "anotar", target: "1.1", kind: "comentario", text: "ok" },
          { op: "remover", target: "1.3" },
        ],
      },
    })
    expect(parseAiResult("pedido", { answer: "", ops: [] })).toBeNull()
    const many = { ops: Array.from({ length: 50 }, (_, i) => ({ op: "adicionar", label: `x${i}` })) }
    expect((parseAiResult("pedido", many) as { plan: { ops: unknown[] } }).plan.ops).toHaveLength(30)
  })

  it("hierarquia: aceita só números da lista e níveis válidos", () => {
    expect(validateAiRequest({ action: "hierarquia", focus: { label: "Raiz" }, outline: "1 Raiz" })?.action).toBe("hierarquia")
    expect(buildPrompt({ action: "hierarquia", mapTitle: "M", focus: { label: "Raiz" }, outline: "1 Raiz" })).toContain('{"levels"')
    const r = parseAiResult("hierarquia", { levels: { "1": 1, "1.1": 2.4, "1.2": 99, "x": 2, "1.3": "3", "1.4": 0 } })
    expect(r).toEqual({ levels: { "1": 1, "1.1": 2, "1.2": 12, "1.4": 1 } })
    expect(parseAiResult("hierarquia", { levels: {} })).toBeNull()
  })
})
