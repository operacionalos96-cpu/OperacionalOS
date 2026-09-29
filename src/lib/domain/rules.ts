/**
 * Regras de negócio puras (sem React, sem storage). Toda função recebe `now`
 * para ser determinística e testável.
 */
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfWeek,
  format,
  getDaysInMonth,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfWeek,
} from "date-fns"
import { ptBR } from "date-fns/locale"
import { OPEN_STAGES, STALE_AFTER_DAYS, isOpenStage } from "./constants"
import type { FinanceSettings, Lead, Priority, Recurrence, Stage, Task, Transaction } from "./types"

// ---------- datas ----------

/** Dias de calendário desde `iso` até `now` (positivo = passado). */
export function daysSince(iso: string, now: Date) {
  return differenceInCalendarDays(now, parseISO(iso))
}

export function isOverdue(iso: string | undefined, now: Date) {
  return !!iso && daysSince(iso, now) > 0
}

export function isDueToday(iso: string | undefined, now: Date) {
  return !!iso && daysSince(iso, now) === 0
}

export function monthKey(date: Date) {
  return format(date, "yyyy-MM")
}

// ---------- leads ----------

export function isStale(lead: Lead, now: Date) {
  return isOpenStage(lead.stage) && daysSince(lead.lastActivityAt, now) >= STALE_AFTER_DAYS
}

export type LeadUrgency = "vencida" | "hoje" | "parado"

/** Por que este lead precisa de atenção (ou null se está em dia). */
export function leadUrgency(lead: Lead, now: Date): LeadUrgency | null {
  if (!isOpenStage(lead.stage)) return null
  if (isOverdue(lead.nextAction.dueDate, now)) return "vencida"
  if (isDueToday(lead.nextAction.dueDate, now)) return "hoje"
  if (isStale(lead, now)) return "parado"
  return null
}

const URGENCY_ORDER: Record<LeadUrgency, number> = { vencida: 0, hoje: 1, parado: 2 }

/** Leads que precisam de ação, do mais urgente ao menos urgente. */
export function leadsNeedingAction(leads: Lead[], now: Date) {
  return leads
    .map((lead) => ({ lead, urgency: leadUrgency(lead, now) }))
    .filter((x): x is { lead: Lead; urgency: LeadUrgency } => x.urgency !== null)
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        a.lead.nextAction.dueDate.localeCompare(b.lead.nextAction.dueDate),
    )
}

export interface StageSummary {
  stage: Stage
  count: number
  valueCents: number
}

export function pipelineSummary(leads: Lead[]) {
  const stages: StageSummary[] = OPEN_STAGES.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage)
    return { stage, count: inStage.length, valueCents: sum(inStage.map((l) => l.valueCents)) }
  })
  return {
    stages,
    count: sum(stages.map((s) => s.count)),
    valueCents: sum(stages.map((s) => s.valueCents)),
  }
}

// ---------- financeiro ----------

function signed(t: Transaction) {
  return t.type === "entrada" ? t.amountCents : -t.amountCents
}

export function balance(settings: FinanceSettings, txs: Transaction[]) {
  return settings.openingBalanceCents + sum(txs.map(signed))
}

export function monthStats(txs: Transaction[], now: Date) {
  const inMonth = txs.filter((t) => isSameMonth(parseISO(t.date), now))
  const income = sum(inMonth.filter((t) => t.type === "entrada").map((t) => t.amountCents))
  const expense = sum(inMonth.filter((t) => t.type === "saida").map((t) => t.amountCents))
  return { income, expense, net: income - expense }
}

/** Variação do caixa no mês atual, em valor e % sobre o saldo do início do mês. */
export function monthDelta(settings: FinanceSettings, txs: Transaction[], now: Date) {
  const { net } = monthStats(txs, now)
  const current = balance(settings, txs)
  const startOfMonthBalance = current - net
  const pct = startOfMonthBalance !== 0 ? net / Math.abs(startOfMonthBalance) : null
  return { net, pct }
}

export function goalProgress(settings: FinanceSettings, txs: Transaction[], now: Date) {
  const target = settings.monthlyGoals[monthKey(now)] ?? 0
  const achieved = monthStats(txs, now).income
  const pct = target > 0 ? achieved / target : 0
  const expectedPct = now.getDate() / getDaysInMonth(now)
  // Em risco: mais de 10 p.p. atrás do ritmo linear esperado para hoje.
  const atRisk = target > 0 && pct < 1 && pct < expectedPct - 0.1
  return { target, achieved, pct, expectedPct, atRisk, hasGoal: target > 0 }
}

export interface ChartPoint {
  label: string
  entradas: number
  saidas: number
}

/** Últimos 30 dias por dia, ou últimos 90 dias por semana. Valores em reais. */
export function cashflowSeries(txs: Transaction[], range: 30 | 90, now: Date): ChartPoint[] {
  const today = startOfDay(now)
  const bucketDays = range === 30 ? 1 : 7
  const buckets = Math.ceil(range / bucketDays)
  const start = addDays(today, -(buckets * bucketDays) + 1)

  const points: ChartPoint[] = Array.from({ length: buckets }, (_, i) => {
    const d = addDays(start, i * bucketDays)
    return {
      label: format(d, range === 30 ? "dd/MM" : "dd MMM", { locale: ptBR }),
      entradas: 0,
      saidas: 0,
    }
  })

  for (const t of txs) {
    const idx = Math.floor(differenceInCalendarDays(parseISO(t.date), start) / bucketDays)
    if (idx < 0 || idx >= buckets) continue
    points[idx][t.type === "entrada" ? "entradas" : "saidas"] += t.amountCents / 100
  }
  return points
}

/** Saldo ao fim de cada dia dos últimos `days` dias (centavos). */
export function balanceSeries(settings: FinanceSettings, txs: Transaction[], days: number, now: Date) {
  const today = startOfDay(now)
  const start = addDays(today, -(days - 1))
  const startKey = format(start, "yyyy-MM-dd")
  let running = settings.openingBalanceCents + sum(txs.filter((t) => t.date < startKey).map(signed))
  const byDay = new Map<string, number>()
  for (const t of txs) if (t.date >= startKey) byDay.set(t.date, (byDay.get(t.date) ?? 0) + signed(t))
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i)
    const key = format(d, "yyyy-MM-dd")
    running += byDay.get(key) ?? 0
    return { key, label: format(d, "dd MMM", { locale: ptBR }), saldo: running }
  })
}

/** Saídas do mês por categoria, da maior para a menor (centavos). */
export function expensesByCategory(txs: Transaction[], now: Date) {
  const map = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== "saida" || !isSameMonth(parseISO(t.date), now)) continue
    map.set(t.category, (map.get(t.category) ?? 0) + t.amountCents)
  }
  const total = sum([...map.values()])
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents, pct: total ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents)
}

// ---------- tarefas e agenda ----------

export type TaskBucket = "atrasadas" | "hoje" | "semana" | "depois" | "sem_prazo" | "feitas"

export const TASK_BUCKETS: { id: TaskBucket; label: string }[] = [
  { id: "atrasadas", label: "Atrasadas" },
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "depois", label: "Depois" },
  { id: "sem_prazo", label: "Sem prazo" },
  { id: "feitas", label: "Concluídas" },
]

function weekEnd(now: Date) {
  return endOfWeek(now, { weekStartsOn: 1 })
}

export function dueBucket(dueDate: string | undefined, now: Date): Exclude<TaskBucket, "feitas"> {
  if (!dueDate) return "sem_prazo"
  const d = daysSince(dueDate, now)
  if (d > 0) return "atrasadas"
  if (d === 0) return "hoje"
  if (parseISO(dueDate) <= weekEnd(now)) return "semana"
  return "depois"
}

export function taskBucket(task: Task, now: Date): TaskBucket {
  return task.done ? "feitas" : dueBucket(task.dueDate, now)
}

const PRIORITY_WEIGHT: Record<Priority, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 }

export type TaskSort = "prazo" | "prioridade"

/** Prazo: data e depois prioridade. Prioridade: prioridade e depois data. Sem valor vai para o fim. */
export function compareTasks(a: Task, b: Task, sort: TaskSort = "prazo") {
  const pa = a.priority ? PRIORITY_WEIGHT[a.priority] : 9
  const pb = b.priority ? PRIORITY_WEIGHT[b.priority] : 9
  const da = a.dueDate ?? "9999"
  const db = b.dueDate ?? "9999"
  return sort === "prioridade" ? pa - pb || da.localeCompare(db) : da.localeCompare(db) || pa - pb
}

export function checklistProgress(task: Pick<Task, "checklist">) {
  const items = task.checklist ?? []
  const done = items.filter((i) => i.done).length
  return { done, total: items.length, pct: items.length ? done / items.length : 0 }
}

/** Próximo prazo de uma tarefa recorrente, a partir do prazo atual (ou de hoje, se não tiver). */
export function nextOccurrence(dueDate: string | undefined, recurrence: Recurrence, now: Date) {
  const base = dueDate ? parseISO(dueDate) : startOfDay(now)
  const next = recurrence === "diaria" ? addDays(base, 1) : recurrence === "semanal" ? addWeeks(base, 1) : addMonths(base, 1)
  return format(next, "yyyy-MM-dd")
}

/**
 * Atalhos no campo rápido: "Ligar pro cliente !alta #vendas".
 * `!urgente|!alta|!media|!baixa` (ou !!!, !!, !) definem prioridade; `#palavra` vira etiqueta.
 */
export function parseQuickAdd(input: string): { title: string; priority?: Priority; labels: string[] } {
  let priority: Priority | undefined
  const labels: string[] = []
  const words = input.split(/\s+/).filter((w) => {
    const lower = w.toLowerCase()
    const byName: Record<string, Priority> = {
      "!urgente": "urgente",
      "!!!": "urgente",
      "!alta": "alta",
      "!!": "alta",
      "!media": "media",
      "!média": "media",
      "!": "media",
      "!baixa": "baixa",
    }
    if (byName[lower]) {
      priority = byName[lower]
      return false
    }
    if (/^#[\p{L}\p{N}_-]+$/u.test(w)) {
      const label = w.slice(1).toLowerCase()
      if (!labels.includes(label)) labels.push(label)
      return false
    }
    return true
  })
  return { title: words.join(" ").trim(), priority, labels }
}

/** Progresso do dia: tarefas com prazo hoje (ou atrasadas) já concluídas vs. total. */
export function dayProgress(tasks: Task[], userId: string | null, now: Date) {
  const todayKey = format(now, "yyyy-MM-dd")
  const mine = tasks.filter((t) => (userId === null || t.ownerId === userId) && t.dueDate)
  const doneToday = mine.filter((t) => t.done && t.doneAt && daysSince(t.doneAt, now) === 0 && t.dueDate! <= todayKey).length
  const pending = mine.filter((t) => !t.done && t.dueDate! <= todayKey).length
  const total = doneToday + pending
  return { done: doneToday, total, pct: total ? doneToday / total : 0 }
}

export interface AgendaItem {
  kind: "task" | "lead"
  id: string
  title: string
  context?: string
  dueDate: string
  bucket: "atrasadas" | "hoje" | "semana"
  priority?: Priority
}

/** Tudo que é responsabilidade de `userId` até o fim desta semana (inclui atrasados). */
export function myAgenda(userId: string, leads: Lead[], tasks: Task[], now: Date): AgendaItem[] {
  const items: AgendaItem[] = []
  for (const t of tasks) {
    if (t.done || t.ownerId !== userId || !t.dueDate) continue
    const bucket = dueBucket(t.dueDate, now)
    if (bucket === "atrasadas" || bucket === "hoje" || bucket === "semana") {
      const lead = t.leadId ? leads.find((l) => l.id === t.leadId) : undefined
      items.push({ kind: "task", id: t.id, title: t.title, context: lead?.name, dueDate: t.dueDate, bucket, priority: t.priority })
    }
  }
  for (const l of leads) {
    if (l.ownerId !== userId || !isOpenStage(l.stage)) continue
    const bucket = dueBucket(l.nextAction.dueDate, now)
    if (bucket === "atrasadas" || bucket === "hoje" || bucket === "semana") {
      items.push({ kind: "lead", id: l.id, title: l.nextAction.text, context: l.name, dueDate: l.nextAction.dueDate, bucket })
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

// ---------- itens de atenção (Dashboard) ----------

export interface AttentionItem {
  id: string
  severity: 3 | 2 | 1
  kind: "acao_vencida" | "tarefa_atrasada" | "meta" | "lead_parado"
  title: string
  detail: string
  ownerId?: string
  leadId?: string
  taskId?: string
}

export function attentionItems(
  input: { leads: Lead[]; tasks: Task[]; txs: Transaction[]; settings: FinanceSettings },
  now: Date,
  limit = 5,
): { items: AttentionItem[]; total: number } {
  const items: (AttentionItem & { sortDays: number })[] = []

  for (const l of input.leads) {
    const urgency = leadUrgency(l, now)
    if (urgency === "vencida") {
      const d = daysSince(l.nextAction.dueDate, now)
      items.push({
        id: `lead-${l.id}`,
        severity: 3,
        kind: "acao_vencida",
        title: l.name,
        detail: `${l.nextAction.text} · venceu há ${d} ${d === 1 ? "dia" : "dias"}`,
        ownerId: l.ownerId,
        leadId: l.id,
        sortDays: d,
      })
    } else if (urgency === "parado") {
      const d = daysSince(l.lastActivityAt, now)
      items.push({
        id: `lead-${l.id}`,
        severity: 1,
        kind: "lead_parado",
        title: l.name,
        detail: `Sem atividade há ${d} dias`,
        ownerId: l.ownerId,
        leadId: l.id,
        sortDays: d,
      })
    }
  }

  for (const t of input.tasks) {
    if (t.done || !isOverdue(t.dueDate, now)) continue
    const d = daysSince(t.dueDate!, now)
    items.push({
      id: `task-${t.id}`,
      severity: 3,
      kind: "tarefa_atrasada",
      title: t.title,
      detail: `Tarefa atrasada há ${d} ${d === 1 ? "dia" : "dias"}`,
      ownerId: t.ownerId,
      taskId: t.id,
      sortDays: d,
    })
  }

  const goal = goalProgress(input.settings, input.txs, now)
  if (goal.atRisk) {
    items.push({
      id: "meta",
      severity: 2,
      kind: "meta",
      title: "Meta do mês em risco",
      detail: `${Math.round(goal.pct * 100)}% atingido · o ritmo esperado hoje é ${Math.round(goal.expectedPct * 100)}%`,
      sortDays: 0,
    })
  }

  items.sort((a, b) => b.severity - a.severity || b.sortDays - a.sortDays)
  const visible: AttentionItem[] = items.slice(0, limit).map((item) => {
    const rest: AttentionItem & { sortDays?: number } = { ...item }
    delete rest.sortDays
    return rest
  })
  return { items: visible, total: items.length }
}

// ---------- utils ----------

export function sum(values: number[]) {
  return values.reduce((acc, v) => acc + v, 0)
}

export function weekRange(now: Date) {
  return { start: startOfWeek(now, { weekStartsOn: 1 }), end: weekEnd(now) }
}
