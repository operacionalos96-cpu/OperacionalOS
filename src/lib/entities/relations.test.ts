import { describe, expect, it } from "vitest"
import { blockersOf, presenceOf, relationExists, type PresenceSnapshot } from "./relations"
import { parseRefKey, refKey, type EntityRef, type Relation } from "./types"

const rel = (p: Partial<Relation> & Pick<Relation, "from" | "to">): Relation => ({
  id: Math.random().toString(),
  kind: "relacionado",
  createdBy: "u1",
  createdAt: "2025-10-15T10:00:00Z",
  ...p,
})
const task = (id: string): EntityRef => ({ type: "task", id })
const empty: PresenceSnapshot = { relations: [], tasks: [], leads: [], transactions: [], contents: [], mindMaps: [] }

describe("refs", () => {
  it("refKey e parseRefKey são inversos; tipo desconhecido é recusado", () => {
    expect(refKey({ type: "mapNode", id: "a:b" })).toBe("mapNode:a:b")
    expect(parseRefKey("mapNode:a:b")).toEqual({ type: "mapNode", id: "a:b" })
    expect(parseRefKey("hack:1")).toBeNull()
  })
})

describe("presença (onde aparece)", () => {
  it("junta relações explícitas (com o sentido certo) e ligações que já existiam", () => {
    const s: PresenceSnapshot = {
      ...empty,
      relations: [rel({ from: task("t1"), to: task("t2"), kind: "depende" })],
      tasks: [{ id: "t1", leadId: "l1" }, { id: "t2" }],
      leads: [{ id: "l1", productId: "p1" }],
      transactions: [{ id: "x1", leadId: "l1", productId: "p1" }],
      contents: [{ id: "c1", productId: "p1" }],
      mindMaps: [{ id: "m1", title: "Plano", nodes: [{ id: "n1", label: "Ligar", x: 0, y: 0, taskId: "t1" }, { id: "n2", label: "Oferta", x: 0, y: 60, ref: { type: "product", id: "p1" } }] }],
    }
    const t1 = presenceOf(task("t1"), s)
    expect(t1.map((p) => `${refKey(p.ref)} ${p.via}`)).toEqual(["task:t2 depende de", "mapNode:m1/n1 no mapa · Plano", "lead:l1 lead da tarefa"])
    expect(presenceOf(task("t2"), s).map((p) => p.via)).toEqual(["é pré-requisito de"])
    const p1 = presenceOf({ type: "product", id: "p1" }, s).map((p) => refKey(p.ref))
    expect(p1).toEqual(["mapNode:m1/n2", "lead:l1", "transaction:x1", "content:c1"])
    // O balão mostra o que representa e em que mapa está.
    expect(presenceOf({ type: "mapNode", id: "m1/n1" }, s).map((p) => refKey(p.ref))).toEqual(["task:t1", "map:m1"])
    expect(presenceOf({ type: "lead", id: "l1" }, s).map((p) => refKey(p.ref))).toEqual(["task:t1", "transaction:x1", "product:p1"])
  })
})

describe("bloqueios", () => {
  it("depende de / bloqueado por, só enquanto o outro lado não está feito", () => {
    const relations = [rel({ from: task("a"), to: task("b"), kind: "depende" }), rel({ from: task("c"), to: task("a"), kind: "bloqueia" })]
    const done = new Set<string>()
    const isDone = (r: EntityRef) => done.has(r.id)
    expect(blockersOf(task("a"), relations, isDone).map((r) => r.id)).toEqual(["b", "c"])
    done.add("b")
    expect(blockersOf(task("a"), relations, isDone).map((r) => r.id)).toEqual(["c"])
    expect(blockersOf(task("b"), relations, isDone)).toEqual([])
  })

  it("relationExists evita duplicar (relacionado vale nos dois sentidos)", () => {
    const relations = [rel({ from: task("a"), to: task("b") })]
    expect(relationExists(relations, task("b"), task("a"), "relacionado")).toBe(true)
    expect(relationExists(relations, task("b"), task("a"), "depende")).toBe(false)
  })
})
