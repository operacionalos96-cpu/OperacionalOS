/**
 * Agenda (calendário, ADR 0010): junta num lugar só o que tem dia e hora — eventos da agenda,
 * prazos de tarefas e prazos de conteúdos. Não guarda nada: lê as fontes de sempre. Filtra por
 * pessoa. Testado em agenda.test.ts.
 */
import { addDays, eachDayOfInterval, format, isSameDay, max, min, startOfDay } from "date-fns"
import { involves, type CalendarEvent, type EventKind } from "./calendar"
import type { ContentItem } from "./content"
import { isWorkTask } from "./items"
import { isTaskFor } from "./rules"
import type { Task } from "./types"

export interface AgendaEntry {
  /** Único na tela (o mesmo evento aparece em cada dia que atravessa). */
  key: string
  source: "evento" | "tarefa" | "conteudo"
  refId: string
  title: string
  /** yyyy-MM-dd */
  day: string
  allDay: boolean
  /** Horário dentro do dia (eventos com hora). */
  start?: Date
  end?: Date
  kind?: EventKind
  areaId?: string
  done?: boolean
}

export function agendaEntries(from: Date, to: Date, src: { events: CalendarEvent[]; tasks: Task[]; content: ContentItem[] }, personId?: string): AgendaEntry[] {
  const first = startOfDay(from)
  const last = startOfDay(to)
  const inRange = (d: string) => d >= format(first, "yyyy-MM-dd") && d <= format(last, "yyyy-MM-dd")
  const out: AgendaEntry[] = []

  for (const e of src.events) {
    if (personId && !involves(e, personId)) continue
    const s = new Date(e.start)
    const f = new Date(e.end)
    if (f < first || s > addDays(last, 1)) continue
    const allDay = e.kind === "ausencia"
    for (const d of eachDayOfInterval({ start: max([startOfDay(s), first]), end: min([startOfDay(+f - 1), last]) })) {
      out.push({
        key: `${e.id}:${format(d, "yyyy-MM-dd")}`,
        source: "evento",
        refId: e.id,
        title: e.title,
        day: format(d, "yyyy-MM-dd"),
        allDay,
        start: allDay ? undefined : isSameDay(s, d) ? s : startOfDay(d),
        end: allDay ? undefined : isSameDay(f, d) ? f : addDays(startOfDay(d), 1),
        kind: e.kind,
        areaId: e.areaId,
      })
    }
  }
  for (const t of src.tasks) {
    if (!isWorkTask(t) || !t.dueDate || !inRange(t.dueDate.slice(0, 10))) continue
    if (personId && !isTaskFor(t, personId)) continue
    out.push({ key: `t:${t.id}`, source: "tarefa", refId: t.id, title: t.title, day: t.dueDate.slice(0, 10), allDay: true, areaId: t.areaId, done: t.done })
  }
  for (const c of src.content) {
    if (!c.dueDate || c.stage === "publicado" || !inRange(c.dueDate.slice(0, 10))) continue
    if (personId && c.ownerId !== personId) continue
    out.push({ key: `c:${c.id}`, source: "conteudo", refId: c.id, title: c.title, day: c.dueDate.slice(0, 10), allDay: true })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || Number(b.allDay) - Number(a.allDay) || +(a.start ?? 0) - +(b.start ?? 0))
}

/** Colunas lado a lado para eventos que se sobrepõem no mesmo dia (visão Dia/Semana). */
export function lanes(entries: AgendaEntry[]): { entry: AgendaEntry; lane: number; lanes: number }[] {
  const timed = entries.filter((e) => !e.allDay && e.start && e.end).sort((a, b) => +a.start! - +b.start!)
  const out: { entry: AgendaEntry; lane: number; lanes: number }[] = []
  let group: typeof out = []
  let groupEnd = 0
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1))
    for (const g of group) out.push({ ...g, lanes: n })
    group = []
  }
  for (const e of timed) {
    if (group.length && +e.start! >= groupEnd) flush()
    const ends: number[] = []
    for (const g of group) ends[g.lane] = Math.max(ends[g.lane] ?? 0, +g.entry.end!)
    let lane = ends.findIndex((end) => end <= +e.start!)
    if (lane === -1) lane = ends.length
    group.push({ entry: e, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, +e.end!)
  }
  flush()
  return out
}
