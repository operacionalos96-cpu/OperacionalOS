/**
 * "Fazendo agora" e o período do dia (ADR 0010). Cada vez que a pessoa começa uma tarefa, abre uma
 * sessão na linha do dia dela (daily_plans); pausar, concluir ou começar outra fecha a sessão.
 * A sessão aberta é o "fazendo agora" que o time vê; as fechadas contam o que foi feito em cada
 * período. Pausa com motivo (ADR 0015) fica na mesma linha: abrir uma pausa fecha a sessão, e
 * voltar ao trabalho fecha a pausa. Uma fonte só (a linha do dia) e regras puras, testadas em
 * my-day.test.ts.
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

export type PauseReason = "almoco" | "intervalo" | "academia" | "saude" | "pessoal" | "outro"

export const PAUSE_REASONS: { id: PauseReason; label: string }[] = [
  { id: "almoco", label: "Almoço" },
  { id: "intervalo", label: "Café / intervalo" },
  { id: "academia", label: "Academia" },
  { id: "saude", label: "Médico / dentista" },
  { id: "pessoal", label: "Compromisso pessoal" },
  { id: "outro", label: "Outro" },
]

/** Pausa com motivo: o time vê "Em pausa · Almoço desde 12:10"; o registro fica no dia da pessoa. */
export interface Pause {
  reason: PauseReason
  /** Texto livre, usado quando o motivo é "outro" (ou para detalhar). */
  note?: string
  start: string
  end?: string
}

export const doingNow = (plan: DailyPlan | undefined): WorkSession | undefined => plan?.sessions?.find((s) => !s.end)
export const pausedNow = (plan: DailyPlan | undefined): Pause | undefined => plan?.pauses?.find((p) => !p.end)

/** "Almoço" · "Almoço: com cliente" · "banco" (motivo "outro" mostra só o texto). */
export function pauseLabel(p: Pick<Pause, "reason" | "note">): string {
  const base = PAUSE_REASONS.find((r) => r.id === p.reason)?.label ?? "Pausa"
  const note = p.note?.trim()
  if (!note) return base
  return p.reason === "outro" ? note : `${base}: ${note}`
}

const close = <T extends { end?: string }>(list: T[], at: string): T[] => list.map((s) => (s.end ? s : { ...s, end: at }))

/** Começa uma tarefa: fecha a que estava aberta (uma por vez) e a pausa, e abre a nova. Devolve a linha do dia atualizada. */
export function startTask(plan: DailyPlan, task: Pick<Task, "id" | "title" | "areaId">, now: Date): DailyPlan {
  const at = now.toISOString()
  if (doingNow(plan)?.taskId === task.id && !pausedNow(plan)) return plan
  return {
    ...plan,
    sessions: [...close(plan.sessions ?? [], at), { taskId: task.id, title: task.title, areaId: task.areaId, start: at }],
    ...(plan.pauses ? { pauses: close(plan.pauses, at) } : {}),
  }
}

/** Pausa com motivo: fecha a tarefa em andamento (se houver) e abre a pausa. Trocar de motivo fecha a anterior. */
export function pauseWork(plan: DailyPlan, reason: PauseReason, note: string | undefined, now: Date): DailyPlan {
  const at = now.toISOString()
  const clean = note?.trim() || undefined
  return {
    ...plan,
    sessions: close(plan.sessions ?? [], at),
    pauses: [...close(plan.pauses ?? [], at), { reason, ...(clean ? { note: clean } : {}), start: at }],
  }
}

/** Volta da pausa sem escolher tarefa (só fecha a pausa). */
export function endPause(plan: DailyPlan, now: Date): DailyPlan {
  if (!pausedNow(plan)) return plan
  return { ...plan, pauses: close(plan.pauses ?? [], now.toISOString()) }
}

/** Última tarefa da linha do dia (para "Voltar" retomar de onde parou). */
export const lastSession = (plan: DailyPlan | undefined): WorkSession | undefined => plan?.sessions?.at(-1)

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
  /** Pausas que começaram no período (motivo e minutos); não somam em `minutes` (tempo trabalhado). */
  pauses: { label: string; start: string; minutes: number; running: boolean }[]
}

/** O que a pessoa fez em cada período do dia (pela hora em que começou), com os minutos por tarefa. */
export function periodOfDay(plan: DailyPlan | undefined, now: Date): PeriodSummary[] {
  const out = new Map<DayPeriod, PeriodSummary>()
  for (const s of plan?.sessions ?? []) {
    const start = new Date(s.start)
    const minutes = Math.max(0, differenceInMinutes(s.end ? new Date(s.end) : now, start))
    const period = periodOf(start)
    const row = out.get(period) ?? { period, minutes: 0, tasks: [], pauses: [] }
    const t = row.tasks.find((x) => x.taskId === s.taskId)
    if (t) {
      t.minutes += minutes
      t.running ||= !s.end
    } else row.tasks.push({ taskId: s.taskId, title: s.title, minutes, running: !s.end })
    row.minutes += minutes
    out.set(period, row)
  }
  for (const p of plan?.pauses ?? []) {
    const start = new Date(p.start)
    const period = periodOf(start)
    const row = out.get(period) ?? { period, minutes: 0, tasks: [], pauses: [] }
    row.pauses.push({ label: pauseLabel(p), start: p.start, minutes: Math.max(0, differenceInMinutes(p.end ? new Date(p.end) : now, start)), running: !p.end })
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
/** O que mudou entre duas versões da linha do dia de alguém (base dos avisos para CEO e founders). */
export type DayChange = { kind: "checkin"; focus?: string } | { kind: "start"; title: string } | { kind: "pause"; label: string }

export function dayChanges(prev: DailyPlan | undefined, next: DailyPlan): DayChange[] {
  const out: DayChange[] = []
  if (next.checkedInAt && !prev?.checkedInAt) out.push({ kind: "checkin", focus: next.focus?.trim() || undefined })
  const startsBefore = new Set((prev?.sessions ?? []).map((s) => s.start))
  const started = (next.sessions ?? []).find((s) => !s.end && !startsBefore.has(s.start))
  if (started) out.push({ kind: "start", title: started.title })
  const pausesBefore = new Set((prev?.pauses ?? []).map((p) => p.start))
  const paused = (next.pauses ?? []).find((p) => !p.end && !pausesBefore.has(p.start))
  if (paused) out.push({ kind: "pause", label: pauseLabel(paused) })
  return out
}

export function syncWithStatus(plan: DailyPlan, task: Pick<Task, "id" | "title" | "areaId">, next: "afazer" | "andamento" | "feito", now: Date): DailyPlan {
  if (next === "andamento") return startTask(plan, task, now)
  return doingNow(plan)?.taskId === task.id ? stopTask(plan, now) : plan
}
