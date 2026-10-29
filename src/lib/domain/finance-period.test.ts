import { describe, expect, it } from "vitest"
import type { Transaction } from "./types"
import { planSettlement, balanceAsOf, inPeriod, periodEnd, plannedStats, transactionState } from "./rules"

const settings = { openingBalanceCents: 100_00, monthlyGoals: {} }
const NOW = new Date(2026, 9, 28, 10)
const tx = (p: Partial<Transaction>): Transaction => ({ id: "t", type: "saida", amountCents: 10_00, category: "Op", description: "x", date: "2026-10-01", createdById: "u", ...p })

describe("período financeiro", () => {
  it("saldo ao fim de um mês passado ignora movimentos posteriores", () => {
    const txs = [tx({ id: "a", type: "entrada", amountCents: 50_00, date: "2026-08-10" }), tx({ id: "b", type: "entrada", amountCents: 70_00, date: "2026-10-05" })]
    expect(balanceAsOf(settings, txs, periodEnd(new Date(2026, 8, 10), NOW))).toBe(150_00)
    expect(balanceAsOf(settings, txs, periodEnd(new Date(2026, 9, 10), NOW))).toBe(220_00)
  })
  it("período de mês passado termina no último dia; o atual termina hoje", () => {
    expect(periodEnd(new Date(2026, 8, 1), NOW).getDate()).toBe(30)
    expect(periodEnd(new Date(2026, 9, 1), NOW).getDate()).toBe(28)
  })
  it("estado: vencido, parcial, previsto e realizado", () => {
    expect(transactionState(tx({ status: "previsto", dueDate: "2026-10-10", date: "2026-10-10" }), NOW)).toBe("vencido")
    expect(transactionState(tx({ status: "previsto", dueDate: "2026-11-10", date: "2026-11-10", amountCents: 5_00, originalCents: 10_00 }), NOW)).toBe("parcial")
    expect(transactionState(tx({ status: "previsto", dueDate: "2026-11-10", date: "2026-11-10" }), NOW)).toBe("previsto")
    expect(transactionState(tx({}), NOW)).toBe("realizado")
  })
  it("contas pertencem ao mês do vencimento (previsto) ou da data efetiva (realizado)", () => {
    expect(inPeriod(tx({ status: "previsto", dueDate: "2026-11-02", date: "2026-11-02" }), new Date(2026, 10, 1))).toBe(true)
    expect(inPeriod(tx({ status: "previsto", dueDate: "2026-11-02", date: "2026-11-02" }), new Date(2026, 9, 1))).toBe(false)
    expect(inPeriod(tx({ date: "2026-10-30", dueDate: "2026-09-30" }), new Date(2026, 9, 1))).toBe(true)
  })
  it("previsto separado do realizado, com vencido destacado", () => {
    const txs = [
      tx({ id: "1", status: "previsto", dueDate: "2026-10-10", date: "2026-10-10", amountCents: 30_00 }),
      tx({ id: "2", status: "previsto", dueDate: "2026-10-30", date: "2026-10-30", amountCents: 20_00 }),
      tx({ id: "3", type: "entrada", status: "previsto", dueDate: "2026-10-29", date: "2026-10-29", amountCents: 90_00 }),
      tx({ id: "4", status: "previsto", dueDate: "2026-12-01", date: "2026-12-01", amountCents: 999_00 }),
    ]
    expect(plannedStats(txs, new Date(2026, 9, 1), NOW)).toEqual({ incomeOpen: 90_00, expenseOpen: 50_00, incomeOverdue: 0, expenseOverdue: 30_00, netOpen: 40_00 })
  })
  it("baixa parcial deixa o restante em aberto; total quita", () => {
    const t = tx({ status: "previsto", amountCents: 100_00, dueDate: "2026-10-10", date: "2026-10-10" })
    expect(planSettlement(t, "2026-10-12", 40_00)).toMatchObject({ full: false, paid: 40_00, remaining: 60_00, originalCents: 100_00 })
    expect(planSettlement(t, "2026-10-12")).toMatchObject({ full: true, paid: 100_00 })
    expect(planSettlement(t, "2026-10-12", 500_00).full).toBe(true)
  })
})
