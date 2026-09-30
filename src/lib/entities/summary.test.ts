import { describe, expect, it } from "vitest"
import { searchableEntities, summaryOf, type EntitySnapshot } from "./summary"

const base: EntitySnapshot = { leads: [], tasks: [], notes: [], transactions: [], mindMaps: [], products: [], contents: [], relations: [], goals: [] }

describe("resumo de entidades", () => {
  const s: EntitySnapshot = {
    ...base,
    tasks: [{ id: "t1", title: "Ligar", ownerId: "u1", done: true, createdAt: "2025-10-15" }],
    leads: [{ id: "l1", name: "Costa Lion", company: "Materiais", stage: "ganho", ownerId: "u1", valueCents: 0, nextAction: { text: "x", dueDate: "2025-10-15" }, lastActivityAt: "", createdAt: "" }],
    mindMaps: [{ id: "m1", title: "30/09", nodes: [{ id: "n1", label: "Prospecção", x: 0, y: 0, status: "feito" }], edges: [], updatedAt: "" }],
  }

  it("resume cada tipo com título e se está concluído", () => {
    expect(summaryOf({ type: "task", id: "t1" }, s)).toEqual({ title: "Ligar", subtitle: "feita", done: true })
    expect(summaryOf({ type: "lead", id: "l1" }, s)).toMatchObject({ title: "Costa Lion", done: true })
    expect(summaryOf({ type: "mapNode", id: "m1/n1" }, s)).toEqual({ title: "Prospecção", subtitle: "30/09", done: true })
    expect(summaryOf({ type: "task", id: "sumiu" }, s)).toBeNull()
  })

  it("lista pesquisável junta todos os tipos", () => {
    expect(searchableEntities(s).map((e) => `${e.type}:${e.title}`)).toEqual(["task:Ligar", "lead:Costa Lion", "map:30/09"])
  })
})
