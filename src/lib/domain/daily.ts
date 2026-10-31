/**
 * Reunião diária (ADR 0010): quando todos do time fizeram check-in, o "Pronto" libera; cada um marca
 * o seu; com todos prontos, aparece "entrar na reunião". Quem está ausente na agenda hoje não conta.
 * Tudo vem das linhas do dia (daily_plans) — nada guardado à parte. Testado em my-day.test.ts.
 */
import { format } from "date-fns"
import { eventsOfDay, type CalendarEvent } from "./calendar"
import type { DailyPlan } from "./presence"

/** Configuração do time (team_settings, documento "time"). */
export interface TeamSettings {
  id: string
  /** Reunião diária: horário ("09:30") e link (Meet, Zoom…). */
  daily?: { time?: string; link?: string }
  updatedAt?: string
}
export const TEAM_SETTINGS_ID = "time"

export interface DailyState {
  /** Quem conta hoje (time menos quem está ausente). */
  expected: string[]
  missingCheckIn: string[]
  ready: string[]
  /** checkin: esperando check-ins · liberado: pode marcar pronto · todos: todos prontos. */
  phase: "checkin" | "liberado" | "todos"
}

export function dailyState(teamIds: string[], plans: DailyPlan[], events: CalendarEvent[], now: Date): DailyState {
  const today = format(now, "yyyy-MM-dd")
  const away = (id: string) => eventsOfDay(id, events, now).some((e) => e.kind === "ausencia")
  const expected = teamIds.filter((id) => !away(id))
  const planOf = (id: string) => plans.find((p) => p.memberId === id && p.date === today)
  const missingCheckIn = expected.filter((id) => !planOf(id)?.checkedInAt)
  const ready = expected.filter((id) => !!planOf(id)?.readyAt)
  const phase = missingCheckIn.length || !expected.length ? "checkin" : ready.length === expected.length ? "todos" : "liberado"
  return { expected, missingCheckIn, ready, phase }
}
