import { describe, expect, it } from "vitest"
import { conflictsFor, eventsOfDay, peopleOf, type CalendarEvent } from "./calendar"
import { needsCheckIn, presenceOf, presenceText, type DailyPlan } from "./presence"

// Datas em horário local (sem "Z"), como o app usa.
const at = (hhmm: string, day = "2026-11-02") => new Date(`${day}T${hhmm}:00`)
const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: Math.random().toString(36).slice(2),
  title: "Evento",
  kind: "reuniao",
  start: at("14:00").toISOString(),
  end: at("15:00").toISOString(),
  ownerId: "u1",
  participantIds: [],
  createdBy: "u1",
  createdAt: "2026-11-01",
  ...over,
})
const plan = (over: Partial<DailyPlan> = {}): DailyPlan => ({ id: "u2:2026-11-02", memberId: "u2", date: "2026-11-02", startTime: "09:00", endTime: "18:00", checkedInAt: "2026-11-02T09:05:00", ...over })

describe("presença: um status por pessoa, por prioridade", () => {
  const reuniao = ev({ title: "Call com coprodutor", participantIds: ["u2"] })

  it("em reunião (como participante) vence estar online; mostra até quando", () => {
    const p = presenceOf("u2", at("14:30"), { events: [reuniao], online: true, plan: plan() })
    expect(p).toMatchObject({ status: "reuniao", until: "15:00", detail: "Call com coprodutor" })
    expect(presenceText(p)).toBe("Em reunião até 15:00")
  })

  it("ausência vence tudo; compromisso vence foco", () => {
    const evs = [ev({ kind: "foco", ownerId: "u2" }), ev({ kind: "compromisso", ownerId: "u2" }), ev({ kind: "ausencia", ownerId: "u2", start: at("00:00").toISOString(), end: at("23:59").toISOString() })]
    expect(presenceOf("u2", at("14:30"), { events: evs, online: true }).status).toBe("ausente")
    expect(presenceOf("u2", at("14:30"), { events: evs.slice(0, 2), online: true }).status).toBe("compromisso")
  })

  it("sem evento: app aberto = online", () => {
    expect(presenceOf("u2", at("16:00"), { events: [reuniao], online: true }).status).toBe("online")
  })

  it("app fechado, mas fez check-in e está no horário = no expediente (até o fim do horário)", () => {
    expect(presenceOf("u2", at("16:00"), { events: [], online: false, plan: plan() })).toMatchObject({ status: "expediente", until: "18:00" })
  })

  it("sem check-in, ou fora do horário informado = offline", () => {
    expect(presenceOf("u2", at("16:00"), { events: [], online: false }).status).toBe("offline")
    expect(presenceOf("u2", at("19:00"), { events: [], online: false, plan: plan() }).status).toBe("offline")
    expect(presenceOf("u2", at("16:00", "2026-11-03"), { events: [], online: false, plan: plan() }).status).toBe("offline")
  })

  it("check-in só é pedido uma vez por dia (feito ou pulado)", () => {
    expect(needsCheckIn(undefined)).toBe(true)
    expect(needsCheckIn(plan())).toBe(false)
    expect(needsCheckIn(plan({ checkedInAt: undefined, skippedAt: "2026-11-02T09:00:00" }))).toBe(false)
  })
})

describe("agenda: reuniões e conflitos", () => {
  const existente = ev({ title: "Call com coprodutor", ownerId: "u2" })

  it("pessoas da reunião = dono + participantes, sem repetir", () => {
    expect(peopleOf({ ownerId: "u1", participantIds: ["u2", "u1"] })).toEqual(["u1", "u2"])
  })

  it("avisa quem já está ocupado no horário; encostar no fim não é conflito", () => {
    const nova = { id: "n", ownerId: "u1", participantIds: ["u2"], start: at("14:30").toISOString(), end: at("15:30").toISOString() }
    expect(conflictsFor(nova, [existente]).map((c) => `${c.memberId}:${c.event.title}`)).toEqual(["u2:Call com coprodutor"])
    expect(conflictsFor({ ...nova, start: at("15:00").toISOString(), end: at("16:00").toISOString() }, [existente])).toEqual([])
  })

  it("editar a própria reunião não conflita com ela mesma", () => {
    expect(conflictsFor(existente, [existente])).toEqual([])
  })

  it("agenda do dia da pessoa, em ordem de horário", () => {
    const manha = ev({ ownerId: "u2", start: at("09:00").toISOString(), end: at("10:00").toISOString(), title: "Manhã" })
    const outroDia = ev({ ownerId: "u2", start: at("09:00", "2026-11-05").toISOString(), end: at("10:00", "2026-11-05").toISOString() })
    expect(eventsOfDay("u2", [existente, manha, outroDia], at("08:00")).map((e) => e.title)).toEqual(["Manhã", "Call com coprodutor"])
  })
})
