import { describe, expect, it } from "vitest"
import type { Lead, Task, Transaction } from "./types"
import { WON_TAG, planWonLead } from "./won-lead"

const NOW = new Date(2026, 9, 28)
const lead = { id: "l1", name: "Ana", company: "Acme", ownerId: "u1", valueCents: 500_00 } as Lead

describe("piloto: lead ganho → projeto, tarefa e recebimento previsto", () => {
  it("planeja uma tarefa e um recebimento previsto, vinculados ao lead e ao projeto", () => {
    const p = planWonLead(lead, [], [], NOW)
    expect(p.project).toBe("Acme")
    expect(p.task).toMatchObject({ title: "Onboarding: Acme", leadId: "l1", projectName: "Acme", dueDate: "2026-10-31" })
    expect(p.transaction).toMatchObject({ type: "entrada", status: "previsto", amountCents: 500_00, dueDate: "2026-11-27", leadId: "l1", projectName: "Acme" })
  })
  it("é idempotente: não duplica quando já existe", () => {
    const t = { id: "t", leadId: "l1", labels: [WON_TAG] } as Task
    const x = { id: "x", leadId: "l1", status: "previsto", category: "Contrato" } as Transaction
    const p = planWonLead(lead, [t], [x], NOW)
    expect(p.task).toBeNull()
    expect(p.transaction).toBeNull()
  })
  it("sem valor não cria lançamento", () => {
    expect(planWonLead({ ...lead, valueCents: 0 }, [], [], NOW).transaction).toBeNull()
  })
})
