import { describe, expect, it } from "vitest"
import type { Lead, Task, Transaction } from "./types"
import { WON_TAG, planWonLead, wonLeadId, wonLeadRecords } from "./won-lead"

const NOW = new Date(2026, 9, 28)
const lead = { id: "l1", name: "Ana", company: "Acme", ownerId: "u1", valueCents: 500_00 } as Lead

describe("piloto: lead ganho → projeto, tarefa e recebimento previsto", () => {
  it("planeja a tarefa e o contrato em duas parcelas: 50% na entrada (hoje) e 50% na conclusão", () => {
    const p = planWonLead(lead, [], [], NOW)
    expect(p.project).toBe("Acme")
    expect(p.task).toMatchObject({ title: "Onboarding: Acme", leadId: "l1", projectName: "Acme", dueDate: "2026-10-31" })
    expect(p.transactions).toHaveLength(2)
    expect(p.transactions[0]).toMatchObject({ type: "entrada", status: "previsto", amountCents: 250_00, dueDate: "2026-10-28", description: "Contrato Acme · 50% na entrada", leadId: "l1", projectName: "Acme" })
    expect(p.transactions[1]).toMatchObject({ type: "entrada", status: "previsto", amountCents: 250_00, dueDate: "2026-11-27", description: "Contrato Acme · 50% na conclusão", leadId: "l1", projectName: "Acme" })
  })
  it("centavo ímpar fica na entrada e a soma bate com o contrato", () => {
    const [a, b] = planWonLead({ ...lead, valueCents: 999_99 }, [], [], NOW).transactions
    expect([a.amountCents, b.amountCents]).toEqual([500_00, 499_99])
    expect(planWonLead({ ...lead, valueCents: 1 }, [], [], NOW).transactions.map((t) => t.amountCents)).toEqual([1])
  })
  it("depois da baixa da entrada, não recria as parcelas", () => {
    const paid = { id: "won-tx-l1", leadId: "l1", status: "realizado", category: "Contrato" } as Transaction
    expect(planWonLead(lead, [], [paid], NOW).transactions).toEqual([])
  })
  it("é idempotente: não duplica quando já existe", () => {
    const t = { id: "t", leadId: "l1", labels: [WON_TAG] } as Task
    const x = { id: "x", leadId: "l1", status: "previsto", category: "Contrato" } as Transaction
    const p = planWonLead(lead, [t], [x], NOW)
    expect(p.task).toBeNull()
    expect(p.transactions).toEqual([])
  })
  it("sem valor não cria lançamento", () => {
    expect(planWonLead({ ...lead, valueCents: 0 }, [], [], NOW).transactions).toEqual([])
  })
})

describe("registros do lead ganho (automação no servidor)", () => {
  it("monta tarefa e recebimento completos, com ids estáveis por lead", () => {
    const r = wonLeadRecords(lead, [], [], NOW)
    expect(r.task).toMatchObject({ id: "won-task-l1", done: false, createdAt: NOW.toISOString(), leadId: "l1", labels: [WON_TAG] })
    expect(r.transactions.map((t) => [t.id, t.amountCents, t.createdById])).toEqual([["won-tx-l1", 250_00, "u1"], ["won-tx2-l1", 250_00, "u1"]])
    expect(wonLeadRecords(lead, [], [], new Date(2027, 0, 1)).task?.id).toBe(r.task?.id)
  })
  it("não gera nada quando já foi feito (idempotente)", () => {
    const first = wonLeadRecords(lead, [], [], NOW)
    const again = wonLeadRecords(lead, [first.task!], first.transactions, NOW)
    expect(again).toEqual({ task: null, transactions: [] })
  })
  it("ids cabem no limite do banco (64) mesmo com id de lead longo", () => {
    const longId = "x".repeat(64)
    expect(wonLeadId("task", longId).length).toBeLessThanOrEqual(64)
    expect(wonLeadId("task", longId)).not.toBe(wonLeadId("tx", longId))
    expect(wonLeadId("tx2", longId).length).toBeLessThanOrEqual(64)
    expect(wonLeadId("tx2", longId)).not.toBe(wonLeadId("tx", longId))
  })
})
