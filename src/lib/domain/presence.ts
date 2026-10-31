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
import type { WorkSession } from "./work-sessions"

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
  /** Fechou o dia (deixa de contar como "no expediente"). */
  closedAt?: string
  /** Nota que a pessoa escreveu ao fechar o dia anterior, para ler hoje (gravada na linha de hoje). */
  noteFromYesterday?: string
  /** "Fazendo agora" e o período do dia (src/lib/domain/work-sessions.ts). */
  sessions?: WorkSession[]
  /** Pronto para a reunião diária (src/lib/domain/daily.ts). */
  readyAt?: string
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
  /** Do que se trata (título do evento, "Fazendo: …" ou o foco do dia). */
  detail?: string
  /** "10:20": desde quando está fazendo a tarefa atual. */
  since?: string
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
  // O que está fazendo agora (tarefa começada hoje) vira o detalhe do status.
  const p = src.plan?.date === format(now, "yyyy-MM-dd") ? src.plan : undefined
  const doing = p?.sessions?.find((s) => !s.end)
  const doingDetail = doing ? `Fazendo: ${doing.title}` : undefined
  if (src.online) return { status: "online", label: PRESENCE.online.label, detail: doingDetail, since: doing && format(new Date(doing.start), "HH:mm") }

  // Check-in feito hoje (ou tarefa em andamento) e o dia ainda não foi fechado = no expediente.
  if ((p?.checkedInAt || doing) && !p?.closedAt) {
    return { status: "expediente", label: PRESENCE.expediente.label, detail: doingDetail ?? p?.focus, since: doing && format(new Date(doing.start), "HH:mm") }
  }
  return { status: "offline", label: PRESENCE.offline.label }
}

/** Texto curto para exibir: "Em reunião até 15:00". */
export const presenceText = (p: Presence) => (p.until ? `${p.label} até ${p.until}` : p.label)
