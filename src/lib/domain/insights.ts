/**
 * Fase 2 — integração entre abas. Funções puras, testadas em insights.test.ts:
 * metas (progresso automático), movimento da equipe e clientes.
 */
import type { Activity, Lead, Task, Transaction } from "./types"

// ---------- metas ----------

/** De onde vem o progresso: à mão, entradas no período, vendas fechadas ou tarefas ligadas à meta. */
export type GoalSource = "manual" | "receita" | "vendas" | "tarefas"

export interface Goal {
  id: string
  title: string
  source: GoalSource
  /** Alvo: centavos (receita) ou quantidade (manual/vendas). Em "tarefas" o alvo é o total de tarefas ligadas. */
  target: number
  /** Só para "manual". */
  current?: number
  /** Filtra receita/vendas por produto. */
  productId?: string
  /** Período (YYYY-MM-DD, inclusive). */
  start: string
  end: string
  ownerId?: string
  createdAt: string
  updatedAt?: string
}

export const GOAL_SOURCES: { id: GoalSource; label: string; hint: string }[] = [
  { id: "receita", label: "Receita", hint: "Soma das entradas no período" },
  { id: "vendas", label: "Vendas", hint: "Leads ganhos no período" },
  { id: "tarefas", label: "Tarefas ligadas", hint: "Tarefas conectadas à meta que estão feitas" },
  { id: "manual", label: "Manual", hint: "Você atualiza o número" },
]

const inRange = (iso: string | undefined, g: Pick<Goal, "start" | "end">) => !!iso && iso.slice(0, 10) >= g.start && iso.slice(0, 10) <= g.end

export function goalValue(
  g: Goal,
  s: {
    transactions: Pick<Transaction, "type" | "amountCents" | "date" | "productId">[]
    leads: Pick<Lead, "stage" | "closedAt" | "productId">[]
    /** Tarefas ligadas a esta meta (por Conexões). */
    linkedTasks?: Pick<Task, "done">[]
  },
): { value: number; target: number; pct: number } {
  let value = g.current ?? 0
  let target = g.target
  if (g.source === "receita")
    value = s.transactions.filter((t) => t.type === "entrada" && inRange(t.date, g) && (!g.productId || t.productId === g.productId)).reduce((a, t) => a + t.amountCents, 0)
  if (g.source === "vendas") value = s.leads.filter((l) => l.stage === "ganho" && inRange(l.closedAt, g) && (!g.productId || l.productId === g.productId)).length
  if (g.source === "tarefas") {
    const tasks = s.linkedTasks ?? []
    value = tasks.filter((t) => t.done).length
    target = tasks.length
  }
  return { value, target, pct: target > 0 ? Math.min(value / target, 1) : 0 }
}

// ---------- movimento da equipe ----------

export interface FeedEvent {
  at: string
  who?: string
  text: string
  ref?: { type: "lead" | "task" | "transaction"; id: string }
}

/** O que a equipe fez por último (conversas, tarefas feitas, vendas, lançamentos). Mais recente primeiro. */
export function teamFeed(
  s: {
    activities: Pick<Activity, "leadId" | "text" | "authorId" | "createdAt" | "kind">[]
    tasks: Pick<Task, "id" | "title" | "done" | "doneAt" | "ownerId">[]
    leads: Pick<Lead, "id" | "name" | "stage" | "closedAt" | "ownerId" | "valueCents">[]
    transactions: Pick<Transaction, "id" | "type" | "description" | "date" | "createdById" | "amountCents">[]
  },
  money: (cents: number) => string,
  limit = 12,
): FeedEvent[] {
  const leadName = new Map(s.leads.map((l) => [l.id, l.name]))
  const out: FeedEvent[] = [
    ...s.activities.map((a) => ({
      at: a.createdAt,
      who: a.authorId,
      text: `${a.text || a.kind} · ${leadName.get(a.leadId) ?? "lead"}`,
      ref: { type: "lead" as const, id: a.leadId },
    })),
    ...s.tasks.filter((t) => t.done && t.doneAt).map((t) => ({ at: t.doneAt!, who: t.ownerId, text: `concluiu “${t.title}”`, ref: { type: "task" as const, id: t.id } })),
    ...s.leads
      .filter((l) => l.stage === "ganho" && l.closedAt)
      .map((l) => ({ at: l.closedAt!, who: l.ownerId, text: `fechou ${l.name}${l.valueCents ? ` · ${money(l.valueCents)}` : ""}`, ref: { type: "lead" as const, id: l.id } })),
    ...s.transactions.map((t) => ({
      at: t.date,
      who: t.createdById,
      text: `${t.type === "entrada" ? "lançou entrada" : "lançou saída"} ${money(t.amountCents)} · ${t.description}`,
      ref: { type: "transaction" as const, id: t.id },
    })),
  ]
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit)
}

// ---------- clientes ----------

export interface ClientRow<L> {
  lead: L
  /** Total recebido (entradas ligadas ao lead). */
  totalCents: number
  purchases: number
  lastAt?: string
}

/** Cliente = lead ganho. Quanto já pagou, quantas entradas e a última. Quem mais pagou primeiro. */
export function clients<L extends Pick<Lead, "id" | "stage" | "closedAt">>(leads: L[], transactions: Pick<Transaction, "type" | "leadId" | "amountCents" | "date">[]): ClientRow<L>[] {
  return leads
    .filter((l) => l.stage === "ganho")
    .map((lead) => {
      const txs = transactions.filter((t) => t.type === "entrada" && t.leadId === lead.id)
      const lastAt = [lead.closedAt, ...txs.map((t) => t.date)].filter(Boolean).sort().at(-1)
      return { lead, totalCents: txs.reduce((a, t) => a + t.amountCents, 0), purchases: txs.length, lastAt }
    })
    .sort((a, b) => b.totalCents - a.totalCents || (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
}
