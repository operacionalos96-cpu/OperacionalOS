import { describe, expect, it } from "vitest"
import type { FinanceSettings, Lead, Task, Transaction } from "./types"
import {
  balance,
  balanceSeries,
  cashflowSeries,
  checklistProgress,
  compareTasks,
  dayProgress,
  meaningfulPct,
  delayBand,
  delayHistogram,
  delayTone,
  weekProgress,
  dueBucket,
  expensesByCategory,
  goalProgress,
  isStale,
  leadUrgency,
  leadsNeedingAction,
  monthDelta,
  monthStats,
  nextOccurrence,
  parseQuickAdd,
  assignPeople,
  isTaskFor,
  taskPeople,
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
})

describe("tarefas personalizadas", () => {
  const t = (p: Partial<Task>): Task => ({ id: "t", title: "T", ownerId: "u1", done: false, createdAt: NOW.toISOString(), ...p })

  it("parseQuickAdd extrai prioridade e etiquetas", () => {
    expect(parseQuickAdd("Ligar pro cliente !alta #vendas #Vendas")).toEqual({
      title: "Ligar pro cliente",
      priority: "alta",
      labels: ["vendas"],
    })
    expect(parseQuickAdd("Pagar DAS !!!").priority).toBe("urgente")
    expect(parseQuickAdd("Só texto")).toEqual({ title: "Só texto", priority: undefined, labels: [] })
  })

  it("compareTasks ordena por prazo ou por prioridade", () => {
    const a = t({ id: "a", dueDate: "2025-10-20", priority: "urgente" })
    const b = t({ id: "b", dueDate: "2025-10-16", priority: "baixa" })
    const c = t({ id: "c" })
    expect([a, b, c].sort((x, y) => compareTasks(x, y, "prazo")).map((x) => x.id)).toEqual(["b", "a", "c"])
    expect([c, b, a].sort((x, y) => compareTasks(x, y, "prioridade")).map((x) => x.id)).toEqual(["a", "b", "c"])
  })

  it("nextOccurrence avança conforme a recorrência", () => {
    expect(nextOccurrence("2025-10-15", "diaria", NOW)).toBe("2025-10-16")
    expect(nextOccurrence("2025-10-15", "semanal", NOW)).toBe("2025-10-22")
    expect(nextOccurrence("2025-01-31", "mensal", NOW)).toBe("2025-02-28")
    expect(nextOccurrence(undefined, "diaria", NOW)).toBe("2025-10-16")
  })

  it("checklistProgress e dayProgress", () => {
    expect(checklistProgress({ checklist: [{ id: "1", text: "a", done: true }, { id: "2", text: "b", done: false }] }).pct).toBe(0.5)
    const tasks = [
      t({ id: "1", dueDate: "2025-10-15", done: true, doneAt: NOW.toISOString() }),
      t({ id: "2", dueDate: "2025-10-14" }),
      t({ id: "3", dueDate: "2025-10-20" }),
      t({ id: "4", dueDate: "2025-10-15", ownerId: "u2" }),
    ]
    expect(dayProgress(tasks, "u1", NOW)).toEqual({ done: 1, total: 2, pct: 0.5 })
    expect(dayProgress(tasks, null, NOW).total).toBe(3)
    // Planejada para hoje (Fechar o dia / Plano do dia) também conta, mesmo com prazo depois.
    expect(dayProgress([...tasks, t({ id: "5", dueDate: "2025-10-20", plannedFor: "2025-10-15" })], "u1", NOW).total).toBe(3)
  })
})

describe("compromissos financeiros previstos", () => {
  it("não altera saldo nem resultado até ser realizado", () => {
    const settings = { openingBalanceCents: 100_00, monthlyGoals: {} }
    const txs: Transaction[] = [
      { id: "real", type: "entrada", amountCents: 50_00, category: "Serviços", description: "Recebido", date: "2026-10-05", createdById: "u1" },
      { id: "prev", type: "saida", amountCents: 20_00, category: "Operação", description: "Conta futura", date: "2026-10-28", dueDate: "2026-10-28", status: "previsto", createdById: "u1" },
    ]
    const selectedPeriod = new Date("2026-10-10T12:00:00")
    expect(balance(settings, txs)).toBe(150_00)
    expect(monthStats(txs, selectedPeriod)).toEqual({ income: 50_00, expense: 0, net: 50_00 })
    expect(cashflowSeries(txs, 30, selectedPeriod).reduce((sum, point) => sum + point.saidas, 0)).toBe(0)
    expect(balanceSeries(settings, txs, 3, selectedPeriod).at(-1)?.saldo).toBe(150_00)
  })
})

describe("gráficos do financeiro", () => {
  const tx = (p: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(),
    type: "entrada",
    amountCents: 0,
    category: "Outros",
    description: "",
    date: "2025-10-15",
    createdById: "u1",
    ...p,
  })

  it("balanceSeries acumula o saldo dia a dia", () => {
    const txs = [
      tx({ date: "2025-10-01", amountCents: 1000 }),
      tx({ date: "2025-10-14", amountCents: 500 }),
      tx({ date: "2025-10-15", type: "saida", amountCents: 200 }),
    ]
    const s = balanceSeries({ openingBalanceCents: 100, monthlyGoals: {} }, txs, 3, NOW)
    expect(s.map((p) => p.saldo)).toEqual([1100, 1600, 1400])
    expect(s[2].key).toBe("2025-10-15")
  })

  it("expensesByCategory soma só as saídas do mês", () => {
    const r = expensesByCategory(
      [
        tx({ type: "saida", category: "Marketing", amountCents: 300 }),
        tx({ type: "saida", category: "Impostos", amountCents: 100 }),
        tx({ type: "saida", category: "Marketing", amountCents: 100, date: "2025-09-30" }),
        tx({ type: "entrada", category: "Serviços", amountCents: 999 }),
      ],
      NOW,
    )
    expect(r).toEqual([
      { category: "Marketing", cents: 300, pct: 0.75 },
      { category: "Impostos", cents: 100, pct: 0.25 },
    ])
  })
})

describe("tarefas colaborativas", () => {
  const base = { id: "t", title: "Gravar vídeo", done: false, createdAt: NOW.toISOString(), dueDate: "2025-10-15" }

  it("assignPeople: primeiro é o principal, o resto colaboradores", () => {
    expect(assignPeople(["u2", "u1"])).toEqual({ ownerId: "u2", collaborators: ["u1"] })
    expect(assignPeople(["u1", "u1"])).toEqual({ ownerId: "u1", collaborators: undefined })
  })

  it("tarefa dos dois aparece na agenda e no progresso de cada um", () => {
    const shared: Task = { ...base, ownerId: "u1", collaborators: ["u2"] }
    expect(taskPeople(shared)).toEqual(["u1", "u2"])
    expect(isTaskFor(shared, "u2")).toBe(true)
    expect(dayProgress([shared], "u2", NOW).total).toBe(1)
    expect(isTaskFor({ ...base, ownerId: "u1" }, "u2")).toBe(false)
  })
})

describe("variação percentual com sentido", () => {
  it("some quando a base é pequena demais (|%| > 300%)", () => {
    expect(meaningfulPct(0.12)).toBe(0.12)
    expect(meaningfulPct(-2.5)).toBe(-2.5)
    expect(meaningfulPct(110)).toBeNull()
    expect(meaningfulPct(null)).toBeNull()
  })
})

describe("atraso do lead", () => {
  it("tom, faixa e histograma", () => {
    expect([3, 7, 29, 30].map(delayTone)).toEqual(["neutral", "warning", "warning", "danger"])
    expect([14, 15, 29, 30].map(delayBand)).toEqual(["ate14", "15-29", "15-29", "30+"])
    expect(delayHistogram([0, 7, 8, 20, 45, 31]).map((b) => b.count)).toEqual([2, 1, 1, 2])
  })
})

describe("faixa da semana", () => {
  it("por dia: concluídas do que vencia naquele dia", () => {
    const now = new Date("2025-10-15T12:00:00") // quarta
    const tasks: Task[] = [
      { id: "a", title: "a", ownerId: "u1", dueDate: "2025-10-13", done: true, createdAt: "" },
      { id: "b", title: "b", ownerId: "u1", dueDate: "2025-10-13", done: false, createdAt: "" },
      { id: "c", title: "c", ownerId: "u1", dueDate: "2025-10-15", done: true, createdAt: "" },
      { id: "d", title: "d", ownerId: "u2", dueDate: "2025-10-15", done: false, createdAt: "" },
    ]
    const w = weekProgress(tasks, "u1", now)
    expect(w).toHaveLength(7)
    expect(w[0]).toMatchObject({ date: "2025-10-13", done: 1, total: 2, pct: 0.5 })
    expect(w[2]).toMatchObject({ date: "2025-10-15", pct: 1, today: true })
  })
})
