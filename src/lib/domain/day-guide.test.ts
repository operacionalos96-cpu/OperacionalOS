import { describe, expect, it } from "vitest"
import type { CalendarEvent } from "./calendar"
import { became, checkInStreak, dayPlan, dayProgress, greeting, guideMood, lastDayCaptures } from "./day-guide"
import type { DailyPlan } from "./presence"
import type { PersonWork } from "./team-work"
import type { Task } from "./types"

// Segunda-feira, 2 de novembro de 2026, horário local.
const at = (hhmm: string, day = "2026-11-02") => new Date(`${day}T${hhmm}:00`)
const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: "T", ownerId: "u2", done: false, createdAt: "2026-10-01T10:00:00", ...over })
const work = (over: Partial<PersonWork> = {}): PersonWork => ({ areas: [], open: [], overdue: [], decisionsWaiting: [], done: [], ...over })

describe("guia do dia: saudação", () => {
  const base = { firstTime: false, seenToday: false, pending: 2 }
  it("muda com a hora, a primeira vez, a volta no mesmo dia e o dia da semana", () => {
    expect(greeting("Igor", at("08:00"), { ...base, firstTime: true }).line).toMatch(/guia do dia/)
    expect(greeting("Igor", at("15:00"), { ...base, seenToday: true })).toEqual({ title: "De volta, Igor?", line: "Faltam 2 coisas na sua lista de hoje." })
    expect(greeting("Igor", at("08:00"), base).title).toBe("Bom dia, Igor!")
    expect(greeting("Igor", at("08:00"), base).line).toMatch(/Semana nova/)
    expect(greeting("Igor", at("14:00", "2026-11-06"), base).line).toMatch(/Sexta/)
    expect(greeting("Igor", at("23:30", "2026-11-04"), base).title).toMatch(/até tarde/)
  })
})

describe("guia do dia: por onde começar", () => {
  it("ordem: atrasadas, decisões, reuniões que ainda vão acontecer, tarefas de hoje, caixa de entrada", () => {
    const atrasada = task({ title: "Atrasada", dueDate: "2026-10-30" })
    const hoje = task({ title: "Hoje", dueDate: "2026-11-02" })
    const decisao = task({ title: "Decidir preço", kind: "decision" })
    const reuniao: CalendarEvent = { id: "e1", title: "Call", kind: "reuniao", start: at("14:00").toISOString(), end: at("15:00").toISOString(), ownerId: "u1", participantIds: ["u2"], createdBy: "u1", createdAt: "x" }
    const jaPassou: CalendarEvent = { ...reuniao, id: "e0", title: "Daily", start: at("08:00").toISOString(), end: at("08:30").toISOString() }
    const captura = task({ kind: "idea", inbox: true, createdById: "u2" })
    const steps = dayPlan("u2", at("13:30"), {
      work: work({ open: [atrasada, hoje], overdue: [atrasada], decisionsWaiting: [decisao] }),
      events: [reuniao, jaPassou],
      items: [captura, decisao],
    })
    expect(steps.map((s) => s.kind)).toEqual(["atrasada", "decisao", "reuniao", "hoje", "caixa"])
    expect(steps[2].hint).toBe("Começa em 30 min · 14:00–15:00")
    expect(steps[0]).toMatchObject({ hint: "Atrasada desde 30/10", taskId: atrasada.id })
  })

  it("o humor do orbe: atrasada = foco; tudo entregue = festa", () => {
    expect(guideMood([{ id: "1", kind: "atrasada", title: "", hint: "", href: "" }], { done: 0, total: 1 })).toBe("focus")
    expect(guideMood([], { done: 3, total: 3 })).toBe("party")
    expect(guideMood([], { done: 0, total: 0 })).toBe("calm")
  })

  it("progresso do dia: concluídas hoje x o que vence até hoje", () => {
    const tasks = [task({ done: true, doneAt: "2026-11-02T10:00:00" }), task({ dueDate: "2026-11-02" }), task({ dueDate: "2026-11-09" }), task({ ownerId: "u1", dueDate: "2026-11-01" })]
    expect(dayProgress("u2", at("12:00"), tasks)).toEqual({ done: 1, total: 2 })
  })
})

describe("guia do dia: o que você anotou no último dia", () => {
  it("na segunda, mostra o que foi anotado na sexta e o que cada coisa virou", () => {
    const fri = "2026-10-30T16:00:00"
    const all = [
      task({ title: "Ideia A", kind: "idea", createdById: "u2", origin: "captura", createdAt: fri }),
      task({ title: "Vira tarefa", kind: "task", createdById: "u2", origin: "captura", createdAt: fri, done: true }),
      task({ title: "Na caixa", kind: "note", inbox: true, createdById: "u2", origin: "captura", createdAt: fri }),
      task({ title: "De outra pessoa", createdById: "u1", origin: "captura", createdAt: fri }),
    ]
    const r = lastDayCaptures("u2", at("09:00"), all)
    expect(r?.day).toBe("2026-10-30")
    expect(r?.list.map((x) => `${x.item.title}:${x.became}`)).toEqual(["Ideia A:ideia", "Vira tarefa:feita", "Na caixa:caixa"])
    expect(became(task({ archivedAt: "2026-10-31" }))).toBe("arquivada")
  })

  it("nada anotado nos últimos dias = nada a mostrar", () => {
    expect(lastDayCaptures("u2", at("09:00"), [])).toBeNull()
  })
})

describe("guia do dia: sequência de check-ins", () => {
  const p = (date: string): DailyPlan => ({ id: `u2:${date}`, memberId: "u2", date, checkedInAt: `${date}T09:00:00` })
  it("conta dias seguidos; o fim de semana sem check-in não quebra", () => {
    const plans = [p("2026-11-02"), p("2026-10-30"), p("2026-10-29"), p("2026-10-27")]
    expect(checkInStreak("u2", at("10:00"), plans)).toBe(3)
    // Antes do check-in de hoje, a sequência de ontem continua valendo.
    expect(checkInStreak("u2", at("08:00"), plans.slice(1))).toBe(2)
  })
})
