import { describe, expect, it } from "vitest"
import { agendaEntries, lanes } from "./agenda"
import type { CalendarEvent } from "./calendar"
import type { Task } from "./types"

const at = (hhmm: string, day = "2026-11-02") => new Date(`${day}T${hhmm}:00`)
const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: "e", title: "E", kind: "reuniao", start: at("09:00").toISOString(), end: at("10:00").toISOString(), ownerId: "u1", participantIds: [], createdBy: "u1", createdAt: "x", ...over })
const task = (over: Partial<Task>): Task => ({ id: "t", title: "T", ownerId: "u2", done: false, createdAt: "x", ...over })

describe("agenda: eventos, prazos de tarefas e de conteúdos num lugar só", () => {
  const week = [at("00:00"), at("00:00", "2026-11-08")] as const

  it("junta as três fontes, só no período, e filtra por pessoa", () => {
    const src = {
      events: [ev({ id: "call", participantIds: ["u2"] }), ev({ id: "fora", start: at("09:00", "2026-11-20").toISOString(), end: at("10:00", "2026-11-20").toISOString() })],
      tasks: [task({ id: "t1", dueDate: "2026-11-03" }), task({ id: "t2", ownerId: "u1", dueDate: "2026-11-03" }), task({ id: "ideia", kind: "idea", dueDate: "2026-11-03" })],
      content: [{ id: "c1", title: "Reels", format: "reels" as const, stage: "roteiro" as const, ownerId: "u2", dueDate: "2026-11-04", assets: [], posts: [], createdAt: "x" }],
    }
    expect(agendaEntries(...week, src).map((e) => e.key)).toEqual(["call:2026-11-02", "t:t1", "t:t2", "c:c1"])
    expect(agendaEntries(...week, src, "u2").map((e) => e.refId)).toEqual(["call", "t1", "c1"])
  })

  it("ausência de vários dias aparece em cada dia, como dia todo", () => {
    const ferias = ev({ id: "f", kind: "ausencia", ownerId: "u2", start: at("00:00", "2026-11-03").toISOString(), end: at("23:59", "2026-11-05").toISOString() })
    expect(agendaEntries(...week, { events: [ferias], tasks: [], content: [] }).map((e) => [e.day, e.allDay])).toEqual([
      ["2026-11-03", true],
      ["2026-11-04", true],
      ["2026-11-05", true],
    ])
  })

  it("eventos sobrepostos ficam lado a lado", () => {
    const es = agendaEntries(...week, {
      events: [ev({ id: "a" }), ev({ id: "b", start: at("09:30").toISOString(), end: at("11:00").toISOString() }), ev({ id: "c", start: at("11:00").toISOString(), end: at("12:00").toISOString() })],
      tasks: [],
      content: [],
    })
    expect(lanes(es).map((l) => [l.entry.refId, l.lane, l.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ])
  })
})
