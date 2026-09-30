import { describe, expect, it } from "vitest"
import { mapProgress, nodeStatus } from "./mindmap"

const node = (p: object) => ({ id: Math.random().toString(), label: "Etapa", x: 0, y: 0, ...p })

describe("status do mapa", () => {
  it("sem tarefa: usa o status do item (padrão a fazer)", () => {
    expect(nodeStatus({}, [])).toBe("afazer")
    expect(nodeStatus({ status: "andamento" }, [])).toBe("andamento")
    expect(nodeStatus({ status: "feito" }, [])).toBe("feito")
  })

  it("com tarefa vinculada: a tarefa concluída manda no feito", () => {
    const tasks = [{ id: "t1", done: true }, { id: "t2", done: false }]
    expect(nodeStatus({ taskId: "t1" }, tasks)).toBe("feito")
    expect(nodeStatus({ taskId: "t2", status: "feito" }, tasks)).toBe("afazer")
    expect(nodeStatus({ taskId: "t2", status: "andamento" }, tasks)).toBe("andamento")
    expect(nodeStatus({ taskId: "sumiu", status: "feito" }, tasks)).toBe("feito")
  })

  it("progresso ignora itens vazios", () => {
    const p = mapProgress(
      { nodes: [node({ status: "feito" }), node({ status: "andamento" }), node({}), node({ label: "  " })] },
      [],
    )
    expect(p).toEqual({ afazer: 1, andamento: 1, feito: 1, total: 3, pct: 1 / 3 })
  })
})
