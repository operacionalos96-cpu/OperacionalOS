/**
 * Agenda interna do time (HZK OS): reuniões, compromissos, blocos de foco e ausências.
 * Fonte da presença automática (presence.ts). Quando o Google Calendar entrar, ele só alimenta
 * esta mesma estrutura. Regras puras, testadas em calendar.test.ts.
 */
import { format } from "date-fns"

export type EventKind = "reuniao" | "compromisso" | "foco" | "ausencia"

export const EVENT_KINDS: { id: EventKind; label: string; hint: string }[] = [
  { id: "reuniao", label: "Reunião", hint: "Com outras pessoas do time" },
  { id: "compromisso", label: "Compromisso", hint: "Fora do time: cliente, médico, banco…" },
  { id: "foco", label: "Foco", hint: "Tempo reservado para trabalhar sem interrupção" },
  { id: "ausencia", label: "Ausência", hint: "Folga, férias, viagem" },
]

export interface CalendarEvent {
  id: string
  title: string
  kind: EventKind
  /** Início e fim (ISO com hora). */
  start: string
  end: string
  /** Dono do evento (quem marcou ou de quem é o compromisso). */
  ownerId: string
  /** Demais pessoas da reunião. */
  participantIds: string[]
  location?: string
  notes?: string
  createdBy: string
  createdAt: string
  updatedAt?: string
}

/** Todas as pessoas do evento (dono + participantes), sem repetir. */
export const peopleOf = (e: Pick<CalendarEvent, "ownerId" | "participantIds">) => [...new Set([e.ownerId, ...(e.participantIds ?? [])])]

export const involves = (e: CalendarEvent, memberId: string) => peopleOf(e).includes(memberId)

const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) => +new Date(a.start) < +new Date(b.end) && +new Date(a.end) > +new Date(b.start)

/** Eventos de uma pessoa num dia (local), em ordem de horário. */
export function eventsOfDay(memberId: string, events: CalendarEvent[], day: Date): CalendarEvent[] {
  const key = format(day, "yyyy-MM-dd")
  return events
    .filter((e) => involves(e, memberId) && format(new Date(e.start), "yyyy-MM-dd") <= key && format(new Date(e.end), "yyyy-MM-dd") >= key)
    .sort((a, b) => a.start.localeCompare(b.start))
}

export interface Conflict {
  memberId: string
  event: CalendarEvent
}

/** Quem da nova reunião já está ocupado nesse horário (e com o quê). */
export function conflictsFor(candidate: Pick<CalendarEvent, "id" | "start" | "end" | "ownerId" | "participantIds">, events: CalendarEvent[]): Conflict[] {
  const out: Conflict[] = []
  for (const memberId of peopleOf(candidate)) {
    for (const e of events) {
      if (e.id !== candidate.id && involves(e, memberId) && overlaps(candidate, e)) out.push({ memberId, event: e })
    }
  }
  return out
}

/** "14:00–15:00" no horário local. */
export const timeRange = (e: Pick<CalendarEvent, "start" | "end">) => `${format(new Date(e.start), "HH:mm")}–${format(new Date(e.end), "HH:mm")}`
