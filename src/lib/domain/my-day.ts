/**
 * Meu Dia (Início e Guia do dia, ADR 0010): UMA função monta todos os blocos a partir das fontes
 * que já existem. Regra de ouro do blueprint: um item nunca aparece em dois blocos — o atraso é um
 * selo dentro do Plano do dia, não uma seção à parte. Testado em my-day.test.ts.
 */
import { addDays, format } from "date-fns"
import { eventsOfDay, involves, type CalendarEvent } from "./calendar"
import { decisionsWaitingFor, inboxOf, isWorkTask } from "./items"
import type { DailyPlan } from "./presence"
import { isTaskFor } from "./rules"
import type { Task } from "./types"
import { doingNow } from "./work-sessions"

export type PlanGroup = "atrasado" | "hoje" | "depois"
export const PLAN_GROUP_LABEL: Record<PlanGroup, string> = { atrasado: "Atrasado", hoje: "Hoje", depois: "Se sobrar tempo" }

export type Badge = "atrasada" | "fazendo" | "andamento" | "sessao" | "colaborando"

export interface PlanItem {
  task: Task
  group: PlanGroup
  badges: Badge[]
}

export interface MyDay {
  /** Linha de hoje (check-in, foco, nota de ontem, sessões). */
  plan?: DailyPlan
  focus?: string
  noteFromYesterday?: string
  /** Sessão por tipo acontecendo agora (bloco de foco com área). */
  session?: CalendarEvent
  agenda: CalendarEvent[]
  planItems: PlanItem[]
  /** Esperando por você: decisões em que a pessoa é decisora. */
  waiting: Task[]
  inboxCount: number
}

const DEPOIS_DAYS = 7

export function myDay(me: string, now: Date, src: { tasks: Task[]; items: Task[]; events: CalendarEvent[]; plans: DailyPlan[] }): MyDay {
  const today = format(now, "yyyy-MM-dd")
  const horizon = format(addDays(now, DEPOIS_DAYS), "yyyy-MM-dd")
  const plan = src.plans.find((p) => p.memberId === me && p.date === today)
  const doing = doingNow(plan)
  const t = +now
  const session = src.events.find((e) => e.kind === "foco" && e.areaId && involves(e, me) && +new Date(e.start) <= t && t < +new Date(e.end))

  const groupOf = (x: Task): PlanGroup | null => {
    if (x.dueDate && x.dueDate < today) return "atrasado"
    if (x.dueDate === today || x.plannedFor === today || doing?.taskId === x.id) return "hoje"
    if (x.status === "andamento" || !x.dueDate || x.dueDate <= horizon) return "depois"
    return null
  }
  const planItems = src.tasks
    .filter((x) => isWorkTask(x) && !x.done && isTaskFor(x, me))
    .flatMap<PlanItem>((x) => {
      const group = groupOf(x)
      if (!group) return []
      const badges: Badge[] = []
      if (group === "atrasado") badges.push("atrasada")
      if (doing?.taskId === x.id) badges.push("fazendo")
      else if (x.status === "andamento") badges.push("andamento")
      if (session && x.areaId === session.areaId) badges.push("sessao")
      if (x.ownerId !== me) badges.push("colaborando")
      return [{ task: x, group, badges }]
    })
    .sort((a, b) => {
      const g = GROUP_ORDER[a.group] - GROUP_ORDER[b.group]
      if (g) return g
      // Fazendo agora e a sessão da vez primeiro; depois a ordem que a pessoa arrastou; depois o prazo.
      const w = weight(b) - weight(a)
      if (w) return w
      return (a.task.order ?? 1e9) - (b.task.order ?? 1e9) || (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999")
    })

  return {
    plan,
    focus: plan?.focus,
    noteFromYesterday: plan?.noteFromYesterday,
    session,
    agenda: eventsOfDay(me, src.events, now),
    planItems,
    waiting: decisionsWaitingFor(me, src.items),
    inboxCount: inboxOf(me, src.items).length,
  }
}

const GROUP_ORDER: Record<PlanGroup, number> = { atrasado: 0, hoje: 1, depois: 2 }
const weight = (i: PlanItem) => (i.badges.includes("fazendo") ? 2 : 0) + (i.badges.includes("sessao") ? 1 : 0)

/** Reordenar o Plano do dia (arrastar): devolve a nova `order` só de quem mudou de lugar. */
export function reorder(ids: string[], items: { id: string; order?: number }[]): { id: string; order: number }[] {
  return ids.flatMap((id, i) => (items.find((x) => x.id === id)?.order === i ? [] : [{ id, order: i }]))
}

/**
 * "Monte o amanhã" (Fechar o dia) ou "Monte o hoje" (Planejar hoje): o que pode entrar no plano do
 * dia `target` — já planejadas para ele primeiro, depois o que vence até ele, depois sem data.
 */
export function planCandidates(me: string, target: Date, tasks: Task[]): { task: Task; planned: boolean }[] {
  const day = format(target, "yyyy-MM-dd")
  const horizon = format(addDays(target, DEPOIS_DAYS), "yyyy-MM-dd")
  return tasks
    .filter((x) => isWorkTask(x) && !x.done && isTaskFor(x, me) && (x.plannedFor === day || !x.dueDate || x.dueDate <= horizon))
    .map((task) => ({ task, planned: task.plannedFor === day || task.dueDate === day }))
    .sort((a, b) => Number(b.planned) - Number(a.planned) || (a.task.dueDate ?? "9999").localeCompare(b.task.dueDate ?? "9999"))
}
