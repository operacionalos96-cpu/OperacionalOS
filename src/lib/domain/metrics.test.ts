import { describe, expect, it } from "vitest"
import { METRICS, compute } from "./metrics"
import { balanceAsOf, periodEnd } from "./rules"
import type { FinanceSettings, Transaction } from "./types"

const settings: FinanceSettings = { openingBalanceCents: 1000_00, monthlyGoals: {} }
const tx = (over: Partial<Transaction>): Transaction => ({ id: Math.random().toString(36), type: "entrada", amountCents: 100_00, category: "Serviços", description: "", date: "2026-10-01", createdById: "u1", ...over })
const TODAY = new Date("2026-10-30T12:00:00")

describe("fonte única dos números", () => {
  it("o saldo da Início e o do Financeiro (mês atual) são o mesmo número, mesmo com lançamento de data futura", () => {
    const txs = [
      tx({ amountCents: 500_00, date: "2026-10-10" }),
      tx({ type: "saida", amountCents: 200_00, date: "2026-10-20" }),
      tx({ amountCents: 900_00, date: "2026-11-15" }), // marcado como realizado, mas com data futura
      tx({ amountCents: 50_00, date: "2026-10-25", status: "previsto" }), // previsto não entra
    ]
    const inicio = compute["saldo-caixa"](settings, txs, TODAY)
    const financeiro = balanceAsOf(settings, txs, periodEnd(TODAY, TODAY))
    expect(inicio).toBe(financeiro)
    expect(inicio).toBe(1300_00)
  })

  it("toda métrica tem nome e uma explicação curta em linguagem simples", () => {
    for (const [id, m] of Object.entries(METRICS)) {
      expect(m.label.length, id).toBeGreaterThan(2)
      expect(m.help.length, id).toBeGreaterThan(20)
      expect(m.help.length, `${id}: explicação longa demais para um balão`).toBeLessThanOrEqual(140)
      expect(m.help, `${id}: evite símbolos de fórmula na explicação`).not.toMatch(/[÷−]/)
    }
  })
})
