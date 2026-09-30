import { describe, expect, it } from "vitest"
import { outline, ancestors, areaAround, descendants, focusSet, hiddenByCollapse, ideaNodes, kindCounts, mapProgress, membersOf, nodeKind, nodeStatus, resolveLinkedTask, taskStatus } from "./mindmap"
import type { MindMapNode } from "./types"

const NOW = new Date(2025, 9, 15, 10)
const node = (p: object) => ({ id: Math.random().toString(), label: "Etapa", x: 0, y: 0, ...p })
const task = (p: object) => ({ id: "t", done: false, createdAt: "2025-10-01T10:00:00Z", ...p })

describe("status do mapa", () => {
  it("sem tarefa: usa o status do item (padrão a fazer)", () => {
    expect(nodeStatus({}, [], NOW)).toBe("afazer")
    expect(nodeStatus({ status: "andamento" }, [], NOW)).toBe("andamento")
    expect(nodeStatus({ status: "feito" }, [], NOW)).toBe("feito")
  })

  it("com tarefa: a tarefa manda (feita / em andamento / a fazer)", () => {
    const tasks = [task({ id: "t1", done: true }), task({ id: "t2" }), task({ id: "t3", status: "andamento" })]
    expect(nodeStatus({ taskId: "t1" }, tasks, NOW)).toBe("feito")
    expect(nodeStatus({ taskId: "t2", status: "feito" }, tasks, NOW)).toBe("afazer")
    expect(nodeStatus({ taskId: "t3" }, tasks, NOW)).toBe("andamento")
    expect(nodeStatus({ taskId: "sumiu", status: "feito" }, tasks, NOW)).toBe("feito")
    expect(taskStatus({ done: false, status: "andamento" })).toBe("andamento")
  })

  it("tarefa diária: feita hoje → item feito; no dia seguinte volta a 'a fazer'", () => {
    const today = [
      task({ id: "d1", recurrence: "diaria", done: true, doneAt: "2025-10-15T09:00:00", dueDate: "2025-10-15" }),
      task({ id: "d2", recurrence: "diaria", seriesId: "d1", dueDate: "2025-10-16" }),
    ]
    // O item continua ligado à primeira tarefa (d1), mas acompanha a série.
    expect(nodeStatus({ taskId: "d1" }, today, NOW)).toBe("feito")
    expect(resolveLinkedTask("d1", today, NOW)?.task.id).toBe("d2")
    const tomorrow = new Date(2025, 9, 16, 10)
    expect(nodeStatus({ taskId: "d1" }, today, tomorrow)).toBe("afazer")
  })

  it("progresso ignora itens vazios", () => {
    const p = mapProgress({ nodes: [node({ status: "feito" }), node({ status: "andamento" }), node({}), node({ label: "  " })] }, [], NOW)
    expect(p).toEqual({ afazer: 1, andamento: 1, feito: 1, total: 3, pct: 1 / 3 })
  })
})

describe("texto proporcional ao balão", () => {
  it("caixa maior → letra maior, já nos primeiros aumentos", async () => {
    const { fitFontSize } = await import("./mindmap")
    const t = { title: "Prospecção" }
    const small = fitFontSize({ width: 160, height: 50 }, t)
    const medium = fitFontSize({ width: 220, height: 70 }, t)
    const large = fitFontSize({ width: 360, height: 120 }, t)
    expect(small).toBeLessThan(medium)
    expect(medium).toBeLessThan(large)
    expect(medium).toBeGreaterThanOrEqual(small + 4) // cresce logo, não só em caixas enormes
  })
  it("texto longo ou com descrição fica menor para caber", async () => {
    const { fitFontSize } = await import("./mindmap")
    const box = { width: 300, height: 100 }
    expect(fitFontSize(box, { title: "Prospecção de 50 empresas por semana no WhatsApp" })).toBeLessThan(fitFontSize(box, { title: "Prospecção" }))
    expect(fitFontSize(box, { title: "Prospecção", description: "Ligar e mandar mensagem para as empresas da lista" })).toBeLessThan(fitFontSize(box, { title: "Prospecção" }))
  })
})

describe("tipos de balão", () => {
  it("sem escolha: deduz pelo vínculo", () => {
    expect(nodeKind({})).toBe("ideia")
    expect(nodeKind({ taskId: "t" })).toBe("tarefa")
    expect(nodeKind({ leadId: "l" }, "proposta")).toBe("venda")
    expect(nodeKind({ leadId: "l" }, "ganho")).toBe("cliente")
  })

  it("escolhido à mão vence o vínculo", () => {
    expect(nodeKind({ kind: "meta", taskId: "t" })).toBe("meta")
  })

  it("contador: só tipos presentes, na ordem, ignora balão sem texto", () => {
    const counts = kindCounts([node({ taskId: "a" }), node({ taskId: "b" }), node({}), node({ label: " " }), node({ kind: "decisao" })])
    expect(counts.map((c) => [c.id, c.count])).toEqual([["ideia", 1], ["tarefa", 2], ["decisao", 1]])
  })
})

describe("grupos (áreas)", () => {
  const area = { id: "g", x: 0, y: 0, width: 300, height: 200 }
  it("anda junto quem tem o centro dentro da área", () => {
    const boxes = [
      area,
      { id: "dentro", x: 20, y: 60, width: 120, height: 40 },
      { id: "metade-fora", x: 250, y: 60, width: 120, height: 40 }, // centro em x=310
      { id: "longe", x: 500, y: 500, width: 120, height: 40 },
    ]
    expect(membersOf(area, boxes)).toEqual(["dentro"])
  })

  it("área criada envolve os balões com folga e espaço para o título", () => {
    const a = areaAround([
      { id: "a", x: 100, y: 100, width: 120, height: 40 },
      { id: "b", x: 300, y: 200, width: 120, height: 40 },
    ])
    expect(a).toEqual({ x: 68, y: 28, width: 384, height: 244 })
    expect(membersOf({ id: "g", ...a }, [{ id: "a", x: 100, y: 100, width: 120, height: 40 }])).toEqual(["a"])
  })

  it("áreas não contam como itens nem no progresso", () => {
    const nodes = [node({}), node({ type: "group", label: "Fase 1" })] as MindMapNode[]
    expect(ideaNodes(nodes)).toHaveLength(1)
    expect(mapProgress({ nodes }, [], NOW).total).toBe(1)
    expect(kindCounts(nodes).map((c) => c.count)).toEqual([1])
  })
})

describe("ramos: recolher e foco", () => {
  // raiz → a → a1, raiz → b; relação a1 ⇢ b não é hierarquia
  const edges = [
    { source: "raiz", target: "a" },
    { source: "a", target: "a1" },
    { source: "raiz", target: "b" },
    { source: "a1", target: "b", kind: "relacao" as const },
  ]
  it("descendentes seguem só a hierarquia", () => {
    expect([...descendants("a", edges)]).toEqual(["a1"])
    expect(descendants("raiz", edges)).toEqual(new Set(["a", "a1", "b"]))
  })
  it("não trava com ciclo", () => {
    expect(descendants("x", [{ source: "x", target: "y" }, { source: "y", target: "x" }])).toEqual(new Set(["y"]))
    expect(ancestors("x", [{ source: "x", target: "y" }, { source: "y", target: "x" }])).toEqual(new Set(["y"]))
  })
  it("recolher esconde o ramo inteiro, mas não o próprio item", () => {
    expect(hiddenByCollapse([{ id: "a", collapsed: true }, { id: "raiz" }], edges)).toEqual(new Set(["a1"]))
    expect(hiddenByCollapse([{ id: "raiz", collapsed: true }], edges)).toEqual(new Set(["a", "a1", "b"]))
  })
  it("foco = item + ramo abaixo + caminho até a raiz", () => {
    expect(focusSet("a", edges)).toEqual(new Set(["a", "a1", "raiz"]))
  })
})

describe("lista (outline) e ordem da apresentação", () => {
  const n = (id: string, x: number, y: number, extra: object = {}) => ({ id, label: id, x, y, ...extra })
  it("numera raiz → filhos na ordem vertical, sem grupos e sem relações", () => {
    const nodes = [n("raiz", 0, 0), n("b", 240, 80), n("a", 240, -80), n("a1", 480, -80), n("g", 0, 0, { type: "group" as const }), n("solto", 0, 300)]
    const edges = [
      { source: "raiz", target: "b" },
      { source: "raiz", target: "a" },
      { source: "a", target: "a1" },
      { source: "b", target: "solto", kind: "relacao" as const },
    ]
    expect(outline(nodes, edges).map((r) => `${r.number} ${r.node.id} ${r.depth}`)).toEqual(["1 raiz 0", "1.1 a 1", "1.1.1 a1 2", "1.2 b 1", "2 solto 0"])
  })
  it("ciclo não trava e cada item aparece uma vez", () => {
    const rows = outline([n("x", 0, 0), n("y", 0, 50)], [{ source: "x", target: "y" }, { source: "y", target: "x" }])
    expect(rows.map((r) => r.node.id).sort()).toEqual(["x", "y"])
  })
  it("balão ligado a produto é do tipo Produto", () => {
    expect(nodeKind({ ref: { type: "product", id: "p" } })).toBe("produto")
  })
})
