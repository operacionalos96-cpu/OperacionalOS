/**
 * Check-in semanal e Semana do time (blueprint, "Rituais"; ADR 0011). Segunda de manhã: o foco da
 * semana (até 3 itens). Sexta à tarde: o que saiu, o que travou, o que precisa de alguém. A página
 * Semana do time junta as respostas com o que cada um fez — a reunião de status, sem reunião.
 * O "feito" é DERIVADO (tarefas, decisões, sessões do "fazendo agora"); só as respostas são
 * guardadas (tabela checkins, 0024). Regras puras, testadas em weekly.test.ts.
 */
import { addDays, differenceInMinutes, format, getDay, parseISO, startOfWeek } from "date-fns"
import type { DailyPlan } from "./presence"
import { doneBetween } from "./team-work"
import type { Task } from "./types"

export type CheckinKind = "segunda" | "sexta"

export interface WeeklyCheckin {
  /** `${memberId}:${semana}:${kind}` */
  id: string
  memberId: string
  /** Segunda-feira da semana (yyyy-MM-dd). */
  week: string
  kind: CheckinKind
  /** Segunda: até 3 focos. */
  focus?: string[]
  /** Sexta. */
  shipped?: string
  blocked?: string
  needs?: string
  /** Quem precisa ajudar (recebe um aviso). */
  needsFrom?: string[]
  answeredAt: string
  updatedAt?: string
}

export const FOCUS_MAX = 3

/** Segunda-feira da semana de `day`. */
export const weekOf = (day: Date) => format(startOfWeek(day, { weekStartsOn: 1 }), "yyyy-MM-dd")
export const checkinId = (memberId: string, week: string, kind: CheckinKind) => `${memberId}:${week}:${kind}`

/**
 * Qual check-in pedir agora (ou nenhum). Segunda (até quarta, para quem faltou na segunda): o foco
 * da semana. Sexta a partir das 14h (e no fim de semana, para quem não respondeu): a retrospectiva.
 */
export function weeklyAsk(memberId: string, now: Date, checkins: WeeklyCheckin[]): CheckinKind | null {
  const week = weekOf(now)
  const has = (kind: CheckinKind) => checkins.some((c) => c.id === checkinId(memberId, week, kind))
  const dow = getDay(now) // 0 domingo … 6 sábado
  if (dow >= 1 && dow <= 3 && !has("segunda")) return "segunda"
  if (((dow === 5 && now.getHours() >= 14) || dow === 6 || dow === 0) && !has("sexta")) return "sexta"
  return null
}

export interface PersonWeek {
  memberId: string
  monday?: WeeklyCheckin
  friday?: WeeklyCheckin
  /** Tarefas concluídas na semana, mais recentes primeiro. */
  done: Task[]
  decided: Task[]
  /** Minutos marcados como "fazendo" na semana, por área (sem área = ""). */
  minutesByArea: Record<string, number>
  minutes: number
}

/** O que cada pessoa planejou, respondeu e fez numa semana (segunda a domingo). */
export function weekSummary(memberIds: string[], week: string, src: { tasks: Task[]; items: Task[]; plans: DailyPlan[]; checkins: WeeklyCheckin[] }, now: Date): PersonWeek[] {
  const start = week
  const end = format(addDays(parseISO(week), 6), "yyyy-MM-dd")
  const inWeek = (iso?: string) => !!iso && iso.slice(0, 10) >= start && iso.slice(0, 10) <= end
  return memberIds.map((memberId) => {
    const minutesByArea: Record<string, number> = {}
    let minutes = 0
    for (const p of src.plans) {
      if (p.memberId !== memberId || !inWeek(p.date)) continue
      for (const s of p.sessions ?? []) {
        const m = Math.max(0, differenceInMinutes(s.end ? new Date(s.end) : now, new Date(s.start)))
        minutesByArea[s.areaId ?? ""] = (minutesByArea[s.areaId ?? ""] ?? 0) + m
        minutes += m
      }
    }
    const done = doneBetween(memberId, src, start, end)
    return {
      memberId,
      monday: src.checkins.find((c) => c.id === checkinId(memberId, week, "segunda")),
      friday: src.checkins.find((c) => c.id === checkinId(memberId, week, "sexta")),
      done: done.tasks,
      decided: done.decisions,
      minutesByArea,
      minutes,
    }
  })
}

/** Quem ainda não respondeu o check-in da semana (para lembrar na página). */
export function missingCheckins(summary: PersonWeek[], kind: CheckinKind): string[] {
  return summary.filter((p) => !(kind === "segunda" ? p.monday : p.friday)).map((p) => p.memberId)
}
