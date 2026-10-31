/**
 * "Fazendo agora" e o período do dia (ADR 0010). Cada vez que a pessoa começa uma tarefa, abre uma
 * sessão na linha do dia dela (daily_plans); pausar, concluir ou começar outra fecha a sessão.
 * A sessão aberta é o "fazendo agora" que o time vê; as fechadas contam o que foi feito em cada
 * período. Uma fonte só (a linha do dia) e regras puras, testadas em my-day.test.ts.
 */
import { differenceInMinutes } from "date-fns"
import type { DailyPlan } from "./presence"
import type { Task } from "./types"

export interface WorkSession {
  taskId: string
  title: string
  /** Área da tarefa: base das sessões por tipo (comercial, conteúdo…). */
  areaId?: string
  start: string
  end?: string
}

export const doingNow = (plan: DailyPlan | undefined): WorkSession | undefined => plan?.sessions?.find((s) => !s.end)

const close = (list: WorkSession[], at: string) => list.map((s) => (s.end ? s : { ...s, end: at }))

/** Começa uma tarefa: fecha a que estava aberta (uma por vez) e abre a nova. Devolve a linha do dia atualizada. */
export function startTask(plan: DailyPlan, task: Pick<Task, "id" | "title" | "areaId">, now: Date): DailyPlan {
  const at = now.toISOString()
  if (doingNow(plan)?.taskId === task.id) return plan
  return { ...plan, sessions: [...close(plan.sessions ?? [], at), { taskId: task.id, title: task.title, areaId: task.areaId, start: at }] }
}

/** Pausa (ou conclui) o que está fazendo. */
export function stopTask(plan: DailyPlan, now: Date): DailyPlan {
  if (!doingNow(plan)) return plan
  return { ...plan, sessions: close(plan.sessions ?? [], now.toISOString()) }
}

export type DayPeriod = "manha" | "tarde" | "noite"
export const PERIOD_LABEL: Record<DayPeriod, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" }
const periodOf = (d: Date): DayPeriod => (d.getHours() < 12 ? "manha" : d.getHours() < 18 ? "tarde" : "noite")

export interface PeriodSummary {
  period: DayPeriod
  minutes: number
  tasks: { taskId: string; title: string; minutes: number; running: boolean }[]
}

/** O que a pessoa fez em cada período do dia (pela hora em que começou), com os minutos por tarefa. */
export function periodOfDay(plan: DailyPlan | undefined, now: Date): PeriodSummary[] {
  const out = new Map<DayPeriod, PeriodSummary>()
  for (const s of plan?.sessions ?? []) {
    const start = new Date(s.start)
    const minutes = Math.max(0, differenceInMinutes(s.end ? new Date(s.end) : now, start))
    const period = periodOf(start)
    const row = out.get(period) ?? { period, minutes: 0, tasks: [] }
    const t = row.tasks.find((x) => x.taskId === s.taskId)
    if (t) {
      t.minutes += minutes
      t.running ||= !s.end
    } else row.tasks.push({ taskId: s.taskId, title: s.title, minutes, running: !s.end })
    row.minutes += minutes
    out.set(period, row)
  }
  return (["manha", "tarde", "noite"] as const).flatMap((p) => (out.has(p) ? [out.get(p)!] : []))
}

/** "1h20" / "35 min" */
export function minutesText(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`
}

/**
 * Fase da tarefa (sistema de sempre: a fazer → em andamento → feita) e tempo andam juntos, por uma
 * regra só: entrar em "andamento" abre o tempo (e pausa o anterior); concluir ou voltar para "a
 * fazer" fecha o tempo desta tarefa. A fase continua na tarefa; o tempo, na linha do dia.
 */
export function syncWithStatus(plan: DailyPlan, task: Pick<Task, "id" | "title" | "areaId">, next: "afazer" | "andamento" | "feito", now: Date): DailyPlan {
  if (next === "andamento") return startTask(plan, task, now)
  return doingNow(plan)?.taskId === task.id ? stopTask(plan, now) : plan
}
