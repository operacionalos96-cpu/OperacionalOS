import { describe, expect, it } from "vitest"
import { BOARD_FORMAT, boardColor, boardMode, boardStats, boundsOf, displaySize, exportBoard, fitImage, linksOf, mapsLinkedTo, parseBoard, pickSides, searchBoard, statsText } from "./board"
import { boardTemplate } from "../board-templates"
import type { MindMap, MindMapNode } from "./types"

const n = (id: string, extra: Partial<MindMapNode> = {}): MindMapNode => ({ id, label: id, x: 0, y: 0, ...extra })

describe("modo do mapa", () => {
  it("mapas antigos (sem modo) são estruturados", () => {
    expect(boardMode({})).toBe("estruturado")
    expect(boardMode({ mode: "lousa" })).toBe("lousa")
  })
})

describe("cores", () => {
  it("neutro usa o tema; matiz usa oklch", () => {
    expect(boardColor(undefined, "ink")).toBe("var(--foreground)")
    expect(boardColor(150, "stroke")).toContain("oklch(0.62 0.2 150)")
    expect(boardColor(75, "onSolid")).toBe(boardColor(undefined, "onSolid"))
  })
})

describe("lado da conexão", () => {
  const box = (x: number, y: number) => ({ x, y, width: 100, height: 60 })
  it("lado a lado → direita/esquerda", () => {
    expect(pickSides(box(0, 0), box(300, 10))).toEqual({ source: "r", target: "l" })
    expect(pickSides(box(300, 0), box(0, 10))).toEqual({ source: "l", target: "r" })
  })
  it("um sobre o outro → base/topo", () => {
    expect(pickSides(box(0, 0), box(10, 300))).toEqual({ source: "b", target: "t" })
    expect(pickSides(box(0, 300), box(10, 0))).toEqual({ source: "t", target: "b" })
  })
})

describe("vínculos", () => {
  const maps: MindMap[] = [
    { id: "m1", title: "Lançamento", updatedAt: "", mode: "lousa", nodes: [n("a", { taskId: "t1" }), n("b", { ref: { type: "product", id: "p1" } }), n("c")], edges: [] },
    { id: "m2", title: "Processo", updatedAt: "", nodes: [n("x", { taskId: "t1", leadId: "l1" })], edges: [] },
  ]
  it("lista o que um elemento liga", () => {
    expect(linksOf(maps[1].nodes[0])).toEqual([{ type: "task", id: "t1" }, { type: "lead", id: "l1" }])
    expect(linksOf(n("z"))).toEqual([])
  })
  it("acha os mapas que citam uma entidade", () => {
    expect(mapsLinkedTo(maps, { type: "task", id: "t1" })).toEqual([
      { mapId: "m1", title: "Lançamento", mode: "lousa", nodeIds: ["a"] },
      { mapId: "m2", title: "Processo", mode: "estruturado", nodeIds: ["x"] },
    ])
    expect(mapsLinkedTo(maps, { type: "product", id: "p1" })).toHaveLength(1)
    expect(mapsLinkedTo(maps, { type: "goal", id: "g" })).toEqual([])
  })
})

describe("resumo, busca e enquadramento", () => {
  const nodes = [n("Pesquisa de mercado", { type: "sticky" }), n("Orçamento", { type: "shape", description: "valores do mês" }), n("", { type: "image" })]
  it("conta e descreve", () => {
    const s = boardStats({ nodes: [...nodes, n("t", { taskId: "x" })], edges: [{ id: "e", source: "a", target: "b" }] })
    expect(s).toMatchObject({ total: 4, connections: 1, linked: 1 })
    expect(statsText({ nodes, edges: [] })).toBe("1 nota · 1 forma · 1 imagem")
  })
  it("busca sem acento e sem caixa, inclusive na descrição", () => {
    expect(searchBoard(nodes, "orcamento")).toEqual([{ id: "Orçamento", label: "Orçamento", kind: "forma" }])
    expect(searchBoard(nodes, "VALORES")).toHaveLength(1)
    expect(searchBoard(nodes, "  ")).toEqual([])
  })
  it("envolve os elementos", () => {
    expect(boundsOf([{ x: 0, y: 0, width: 100, height: 50 }, { x: 300, y: 200, width: 100, height: 100 }])).toEqual({ x: 0, y: 0, width: 400, height: 300 })
    expect(boundsOf([])).toBeNull()
  })
})

describe("imagens", () => {
  it("reduz mantendo proporção e nunca amplia", () => {
    expect(fitImage(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 })
    expect(fitImage(300, 200, 1000)).toEqual({ width: 300, height: 200 })
    expect(fitImage(0, 10)).toEqual({ width: 0, height: 0 })
  })
  it("tamanho no quadro", () => {
    expect(displaySize(720, 360)).toEqual({ width: 360, height: 180 })
    expect(displaySize(100, 50)).toEqual({ width: 100, height: 50 })
  })
})

describe("exportar e importar", () => {
  const map: MindMap = { id: "m", title: "Plano", updatedAt: "", mode: "lousa", nodes: [n("a"), n("b")], edges: [{ id: "e", source: "a", target: "b" }] }
  it("ida e volta mantém tudo", () => {
    const file = JSON.parse(JSON.stringify(exportBoard(map)))
    expect(file.format).toBe(BOARD_FORMAT)
    const r = parseBoard(file)
    expect(r.ok && r.board).toMatchObject({ title: "Plano", mode: "lousa", nodes: map.nodes, edges: map.edges })
    expect(r.ok && r.dropped).toBe(0)
  })
  it("descarta o inválido e as ligações órfãs, sem recusar o resto", () => {
    const r = parseBoard({ format: BOARD_FORMAT, version: 1, title: " ", nodes: [n("a"), n("a"), { id: 3 }, n("b")], edges: [{ id: "e1", source: "a", target: "b" }, { id: "e2", source: "a", target: "zzz" }] })
    expect(r.ok && r.board.nodes.map((x) => x.id)).toEqual(["a", "b"])
    expect(r.ok && r.board.edges).toHaveLength(1)
    expect(r.ok && r.dropped).toBe(3)
    expect(r.ok && r.board.title).toBe("Mapa importado")
  })
  it("recusa arquivo alheio ou de versão mais nova", () => {
    expect(parseBoard({ foo: 1 }).ok).toBe(false)
    expect(parseBoard({ format: BOARD_FORMAT, version: 99, nodes: [], edges: [] }).ok).toBe(false)
    expect(parseBoard({ format: BOARD_FORMAT, version: 1, nodes: "x", edges: [] }).ok).toBe(false)
  })
})

describe("modelos de lousa", () => {
  it.each(["lousa-branca", "lousa-brainstorm", "lousa-retro", "lousa-fluxo"] as const)("%s: modo lousa, ids únicos e ligações válidas", (id) => {
    const m = boardTemplate(id)
    expect(m.mode).toBe("lousa")
    const ids = m.nodes.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of m.edges) {
      expect(ids).toContain(e.source)
      expect(ids).toContain(e.target)
    }
  })
})

import { presenceOf } from "../entities/relations"
describe("elementos da lousa aparecem como vínculo da tarefa/produto (Conexões)", () => {
  it("tarefa e produto ligados a elementos listam o mapa de origem", () => {
    const maps = [{ id: "m1", title: "Plano", nodes: [n("a", { type: "sticky", taskId: "t1" }), n("b", { type: "shape", ref: { type: "product", id: "p1" } })], edges: [] }]
    const snap = { leads: [], tasks: [], notes: [], transactions: [], mindMaps: maps, products: [], contents: [], relations: [], goals: [], members: [] } as never
    const t = presenceOf({ type: "task", id: "t1" }, snap)
    const p = presenceOf({ type: "product", id: "p1" }, snap)
    expect(t.map((r) => r.ref)).toEqual([{ type: "mapNode", id: "m1/a" }])
    expect(p.map((r) => r.ref)).toEqual([{ type: "mapNode", id: "m1/b" }])
  })
})
