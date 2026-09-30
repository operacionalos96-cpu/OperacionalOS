import { describe, expect, it } from "vitest"
import { kindCounts, mapProgress, nodeKind, nodeStatus, resolveLinkedTask, taskStatus } from "./mindmap"

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
