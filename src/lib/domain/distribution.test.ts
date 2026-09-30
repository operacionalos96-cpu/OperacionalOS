import { describe, expect, it } from "vitest"
import type { Lead } from "./types"
import { distributeOwners, nextOwner, rebalance } from "./distribution"

const TEAM = ["u1", "u2"]
let n = 0
const lead = (p: Partial<Lead>): Lead => ({
  id: `l${++n}`,
  name: "L",
  stage: "novo",
  ownerId: "u2",
  valueCents: 0,
  nextAction: { text: "x", dueDate: "2025-10-15" },
  lastActivityAt: "2025-10-15T10:00:00Z",
  createdAt: `2025-10-15T10:00:${String(n).padStart(2, "0")}Z`,
  productId: "site",
  ...p,
})

describe("distribuição meio a meio", () => {
  it("próximo lead vai para quem tem menos abertos (ganho/perdido não contam)", () => {
    const leads = [lead({}), lead({}), lead({ ownerId: "u1" }), lead({ ownerId: "u1", stage: "ganho" })]
    expect(nextOwner(leads, TEAM)).toBe("u1")
    expect(nextOwner([], TEAM)).toBe("u1")
  })

  it("importação continua o equilíbrio: 30 com u2 → os próximos 20 vão para u1", () => {
    const leads = Array.from({ length: 30 }, () => lead({}))
    const owners = distributeOwners(20, leads, TEAM, "site")
    expect(owners.every((o) => o === "u1")).toBe(true)
    // u1 tem 20 e u2 tem 30: os próximos 10 alcançam u1; empatados, passam a alternar.
    const more = distributeOwners(12, [...leads, ...owners.map((o) => lead({ ownerId: o }))], TEAM, "site")
    expect(more).toEqual([...Array(10).fill("u1"), "u1", "u2"])
  })

  it("rebalance: 30 x 0 vira 15 x 15, sem mexer em lead já trabalhado", () => {
    const leads = [...Array.from({ length: 29 }, () => lead({})), lead({ stage: "contato" })]
    const moves = rebalance(leads, TEAM, "site")
    expect(moves).toHaveLength(15)
    expect(moves.every((m) => m.ownerId === "u1")).toBe(true)
    const worked = leads.find((l) => l.stage === "contato")!
    expect(moves.some((m) => m.leadId === worked.id)).toBe(false)
    expect(rebalance([lead({}), lead({ ownerId: "u1" })], TEAM)).toEqual([])
  })
})
