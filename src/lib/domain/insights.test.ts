import { describe, expect, it } from "vitest"
import { clients, goalValue, teamFeed, type Goal } from "./insights"

const goal = (p: Partial<Goal>): Goal => ({ id: "g", title: "Meta", source: "manual", target: 10, start: "2026-09-01", end: "2026-09-30", createdAt: "", ...p })
const tx = (p: object) => ({ type: "entrada" as const, amountCents: 100, date: "2026-09-10", description: "x", createdById: "u1", id: Math.random().toString(), ...p })

describe("metas", () => {
  it("receita: soma entradas do período (e do produto, se houver)", () => {
    const transactions = [tx({ amountCents: 500 }), tx({ amountCents: 300, productId: "p" }), tx({ type: "saida", amountCents: 999 }), tx({ date: "2026-10-01" })]
    expect(goalValue(goal({ source: "receita", target: 1000 }), { transactions, leads: [] })).toEqual({ value: 800, target: 1000, pct: 0.8 })
    expect(goalValue(goal({ source: "receita", target: 1000, productId: "p" }), { transactions, leads: [] }).value).toBe(300)
  })
  it("vendas: leads ganhos fechados no período", () => {
    const leads = [
      { stage: "ganho" as const, closedAt: "2026-09-05T10:00:00Z" },
      { stage: "ganho" as const, closedAt: "2026-08-30T10:00:00Z" },
      { stage: "proposta" as const },
    ]
    expect(goalValue(goal({ source: "vendas", target: 4 }), { transactions: [], leads }).pct).toBe(0.25)
  })
  it("tarefas: feitas / ligadas; manual usa o número; nunca passa de 100%", () => {
    expect(goalValue(goal({ source: "tarefas" }), { transactions: [], leads: [], linkedTasks: [{ done: true }, { done: false }] })).toEqual({ value: 1, target: 2, pct: 0.5 })
    expect(goalValue(goal({ current: 15 }), { transactions: [], leads: [] }).pct).toBe(1)
  })
})

describe("movimento da equipe e clientes", () => {
  const leads = [
    { id: "l1", name: "Ana", stage: "ganho" as const, closedAt: "2026-09-20T12:00:00Z", ownerId: "u1", valueCents: 29700 },
    { id: "l2", name: "Bia", stage: "ganho" as const, closedAt: "2026-09-01T12:00:00Z", ownerId: "u2", valueCents: 0 },
    { id: "l3", name: "Caio", stage: "novo" as const, ownerId: "u2", valueCents: 0 },
  ]
  it("feed junta tudo e ordena do mais recente", () => {
    const feed = teamFeed(
      {
        activities: [{ leadId: "l3", text: "Ligou", authorId: "u2", createdAt: "2026-09-25T09:00:00Z", kind: "ligacao" }],
        tasks: [{ id: "t", title: "Proposta", done: true, doneAt: "2026-09-21T09:00:00Z", ownerId: "u1" }],
        leads,
        transactions: [tx({ id: "x", date: "2026-09-22" })],
      },
      (c) => `R$${c / 100}`,
    )
    expect(feed.map((f) => f.text)).toEqual(["Ligou · Caio", "lançou entrada R$1 · x", "concluiu “Proposta”", "fechou Ana · R$297", "fechou Bia"])
  })
  it("clientes: só ganhos, quem mais pagou primeiro", () => {
    const rows = clients(leads, [tx({ leadId: "l2", amountCents: 900 }), tx({ leadId: "l1", amountCents: 100 }), tx({ leadId: "l2", type: "saida" })])
    expect(rows.map((r) => [r.lead.id, r.totalCents, r.purchases])).toEqual([["l2", 900, 1], ["l1", 100, 1]])
  })
})
