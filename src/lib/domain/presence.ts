/**
 * Presença do time (ADR 0009): on, off ou em compromisso — um status por pessoa, por prioridade.
 *   1 ausente · 2 em reunião · 3 em compromisso · 4 em foco   (automático, pela agenda)
 *   5 online                                                  (automático, app aberto agora)
 *   6 no expediente                                           (semiautomático, check-in do dia até fechar o dia)
 *   7 offline
 * Regras puras, testadas em presence.test.ts.
 */
import { format } from "date-fns"
import { involves, type CalendarEvent, type EventKind } from "./calendar"

/** Check-in do dia (tabela daily_plans): um botão + o foco de hoje; o ritual de fechar o dia usa a mesma linha. */
export interface DailyPlan {
  /** `${memberId}:${yyyy-MM-dd}` */
  id: string
  memberId: string
  date: string
  focus?: string
  checkedInAt?: string
  /** Pulou o check-in hoje (não perguntar de novo). */
  skippedAt?: string
  /** Fase 2: fechou o dia (deixa de contar como "no expediente"). */
  closedAt?: string
  /** Fase 2: nota escrita ao fechar o dia, lida na manhã seguinte. */
  noteForTomorrow?: string
  updatedAt?: string
}

export const planId = (memberId: string, day: Date) => `${memberId}:${format(day, "yyyy-MM-dd")}`

export type PresenceStatus = "ausente" | "reuniao" | "compromisso" | "foco" | "online" | "expediente" | "offline"

export const PRESENCE: Record<PresenceStatus, { label: string; tone: "danger" | "warning" | "brand" | "success" | "info" | "muted" }> = {
  ausente: { label: "Ausente", tone: "muted" },
  reuniao: { label: "Em reunião", tone: "warning" },
  compromisso: { label: "Em compromisso", tone: "warning" },
  foco: { label: "Em foco", tone: "brand" },
  online: { label: "Online", tone: "success" },
  expediente: { label: "No expediente", tone: "info" },
  offline: { label: "Offline", tone: "muted" },
}

export interface Presence {
  status: PresenceStatus
  label: string
  /** "15:00" quando o status tem hora para acabar. */
  until?: string
  /** Do que se trata (título do evento). */
  detail?: string
}

const BY_EVENT: [EventKind, PresenceStatus][] = [
  ["ausencia", "ausente"],
  ["reuniao", "reuniao"],
  ["compromisso", "compromisso"],
  ["foco", "foco"],
]

/** Precisa do check-in de hoje? (não fez nem pulou) */
export function needsCheckIn(plan: DailyPlan | undefined): boolean {
  return !plan?.checkedInAt && !plan?.skippedAt
}

export function presenceOf(memberId: string, now: Date, src: { events: CalendarEvent[]; plan?: DailyPlan; online: boolean }): Presence {
  const t = +now
  const happening = src.events.filter((e) => involves(e, memberId) && +new Date(e.start) <= t && t < +new Date(e.end))
  for (const [kind, status] of BY_EVENT) {
    const e = happening.find((x) => x.kind === kind)
    if (e) return { status, label: PRESENCE[status].label, until: format(new Date(e.end), "HH:mm"), detail: e.title }
  }
  if (src.online) return { status: "online", label: PRESENCE.online.label }

  // Check-in feito hoje e o dia ainda não foi fechado = no expediente (sem horário de término).
  const p = src.plan
  if (p?.checkedInAt && !p.closedAt && p.date === format(now, "yyyy-MM-dd")) {
    return { status: "expediente", label: PRESENCE.expediente.label, detail: p.focus }
  }
  return { status: "offline", label: PRESENCE.offline.label }
}

/** Texto curto para exibir: "Em reunião até 15:00". */
export const presenceText = (p: Presence) => (p.until ? `${p.label} até ${p.until}` : p.label)
