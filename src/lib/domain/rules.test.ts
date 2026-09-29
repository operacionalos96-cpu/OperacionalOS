import { describe, expect, it } from "vitest"
import type { FinanceSettings, Lead, Task, Transaction } from "./types"
import {
  attentionItems,
  balance,
  cashflowSeries,
  dueBucket,
  goalProgress,
  isStale,
  leadUrgency,
  leadsNeedingAction,
  monthDelta,
  myAgenda,
  pipelineSummary,
} from "./rules"

// Quarta, 15/10/2025 às 10h (local)
const NOW = new Date(2025, 9, 15, 10)

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    name: "Lead",
    stage: "contato",
    ownerId: "u1",
    valueCents: 100_00,
    nextAction: { text: "Ligar", dueDate: "2025-10-20" },
    lastActivityAt: new Date(2025, 9, 14).toISOString(),
    createdAt: new Date(2025, 9, 1).toISOString(),
    ...p,
  }
}

function tx(p: Partial<Transaction>): Transaction {
  return { id: Math.random().toString(), type: "entrada", amountCents: 0, category: "Outros", description: "", date: "2025-10-01", createdById: "u1", ...p }
}

const settings: FinanceSettings = { openingBalanceCents: 1000_00, monthlyGoals: { "2025-10": 1000_00 } }

describe("leads", () => {
  it("fica parado após 7 dias sem atividade", () => {
    expect(isStale(lead({ lastActivityAt: new Date(2025, 9, 9).toISOString() }), NOW)).toBe(false)
    expect(isStale(lead({ lastActivityAt: new Date(2025, 9, 8).toISOString() }), NOW)).toBe(true)
  })

  it("leads fechados nunca ficam parados nem urgentes", () => {
    const old = new Date(2025, 5, 1).toISOString()
    const won = lead({ stage: "ganho", lastActivityAt: old, nextAction: { text: "x", dueDate: "2025-06-01" } })
    expect(isStale(won, NOW)).toBe(false)
    expect(leadUrgency(won, NOW)).toBeNull()
  })

  it("prioriza vencida > hoje > parado", () => {
    const leads = [
      lead({ id: "parado", lastActivityAt: new Date(2025, 9, 1).toISOString() }),
      lead({ id: "hoje", nextAction: { text: "x", dueDate: "2025-10-15" } }),
      lead({ id: "vencida", nextAction: { text: "x", dueDate: "2025-10-13" } }),
      lead({ id: "ok" }),
    ]
    expect(leadsNeedingAction(leads, NOW).map((x) => x.lead.id)).toEqual(["vencida", "hoje", "parado"])
  })

  it("resume só estágios abertos", () => {
    const s = pipelineSummary([lead(), lead({ stage: "proposta", valueCents: 50_00 }), lead({ stage: "ganho" })])
    expect(s.count).toBe(2)
    expect(s.valueCents).toBe(150_00)
  })
})

describe("financeiro", () => {
  const txs = [
    tx({ type: "entrada", amountCents: 500_00, date: "2025-10-02" }),
    tx({ type: "saida", amountCents: 200_00, date: "2025-10-05" }),
    tx({ type: "entrada", amountCents: 300_00, date: "2025-09-20" }),
  ]

  it("saldo = saldo inicial + entradas - saídas", () => {
    expect(balance(settings, txs)).toBe(1600_00)
  })

  it("variação do mês considera só o mês atual", () => {
    const d = monthDelta(settings, txs, NOW)
    expect(d.net).toBe(300_00)
    expect(d.pct).toBeCloseTo(300 / 1300)
  })

  it("meta em risco quando abaixo do ritmo esperado", () => {
    const g = goalProgress(settings, txs, NOW)
    expect(g.achieved).toBe(500_00)
    expect(g.pct).toBe(0.5)
    expect(g.atRisk).toBe(false) // esperado ~48%
    const late = goalProgress(settings, txs, new Date(2025, 9, 28))
    expect(late.atRisk).toBe(true)
  })

  it("série de 30 dias agrupa por dia e ignora fora do período", () => {
    const series = cashflowSeries(txs, 30, NOW)
    expect(series).toHaveLength(30)
    expect(series.reduce((a, p) => a + p.entradas, 0)).toBe(800)
    expect(cashflowSeries(txs, 90, NOW)).toHaveLength(13)
  })
})

describe("tarefas e agenda", () => {
  it("classifica prazos", () => {
    expect(dueBucket("2025-10-14", NOW)).toBe("atrasadas")
    expect(dueBucket("2025-10-15", NOW)).toBe("hoje")
    expect(dueBucket("2025-10-19", NOW)).toBe("semana") // domingo
    expect(dueBucket("2025-10-20", NOW)).toBe("depois")
    expect(dueBucket(undefined, NOW)).toBe("sem_prazo")
  })

  it("agenda inclui só itens meus até o fim da semana", () => {
    const tasks: Task[] = [
      { id: "t1", title: "Minha", ownerId: "u1", dueDate: "2025-10-16", done: false, createdAt: "" },
      { id: "t2", title: "Dele", ownerId: "u2", dueDate: "2025-10-16", done: false, createdAt: "" },
      { id: "t3", title: "Feita", ownerId: "u1", dueDate: "2025-10-16", done: true, createdAt: "" },
    ]
    const leads = [lead({ nextAction: { text: "Ligar", dueDate: "2025-10-14" } }), lead({ id: "l2", ownerId: "u2" })]
    const agenda = myAgenda("u1", leads, tasks, NOW)
    expect(agenda.map((i) => i.id)).toEqual(["l1", "t1"])
    expect(agenda[0].bucket).toBe("atrasadas")
  })

  it("itens de atenção limitados e ordenados por gravidade", () => {
    const leads = [
      lead({ id: "a", lastActivityAt: new Date(2025, 8, 1).toISOString() }),
      lead({ id: "b", nextAction: { text: "x", dueDate: "2025-10-10" } }),
    ]
    const tasks: Task[] = [{ id: "t", title: "Atrasada", ownerId: "u1", dueDate: "2025-10-14", done: false, createdAt: "" }]
    const { items, total } = attentionItems({ leads, tasks, txs: [], settings }, NOW, 2)
    expect(total).toBe(4) // 2 leads + 1 tarefa + meta (0% com ~48% esperado)
    expect(items.map((i) => i.kind)).toEqual(["acao_vencida", "tarefa_atrasada"])
  })
})
