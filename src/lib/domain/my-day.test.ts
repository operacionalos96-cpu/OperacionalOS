import { describe, expect, it } from "vitest"
import type { CalendarEvent } from "./calendar"
import { dailyParticipants, dailyState } from "./daily"
import { myDay, planCandidates, reorder } from "./my-day"
import { presenceOf, type DailyPlan } from "./presence"
import type { Task } from "./types"
import { dayChanges, doingNow, endPause, ROUTINES, routineOf, minutesText, pauseLabel, pausedNow, pauseWork, periodOfDay, startTask, stopTask, syncWithStatus } from "./work-sessions"

// Segunda-feira, 2 de novembro de 2026, horário local.
const at = (hhmm: string, day = "2026-11-02") => new Date(`${day}T${hhmm}:00`)
const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: "T", ownerId: "u2", done: false, createdAt: "2026-10-01T10:00:00", ...over })
const plan = (over: Partial<DailyPlan> = {}): DailyPlan => ({ id: "u2:2026-11-02", memberId: "u2", date: "2026-11-02", ...over })
const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: "e", title: "E", kind: "reuniao", start: at("09:00").toISOString(), end: at("10:00").toISOString(), ownerId: "u2", participantIds: [], createdBy: "u2", createdAt: "x", ...over })

describe("Meu Dia: um item nunca aparece em dois blocos", () => {
  const tasks = [
    task({ id: "atr", dueDate: "2026-10-30" }),
    task({ id: "hoje", dueDate: "2026-11-02" }),
    task({ id: "plan", plannedFor: "2026-11-02" }),
    task({ id: "semData" }),
    task({ id: "longe", dueDate: "2026-12-20" }),
    task({ id: "feita", dueDate: "2026-11-02", done: true }),
    task({ id: "outro", ownerId: "u1", dueDate: "2026-11-02" }),
    task({ id: "colab", ownerId: "u1", collaborators: ["u2"], dueDate: "2026-11-02" }),
  ]
  const decision = task({ id: "dec", kind: "decision", decision: { options: [], door: "reversivel", involves: [], status: "pendente", deciderIds: ["u2"] } })

  it("atrasado, hoje e se sobrar tempo; fora: feita, de outra pessoa e prazo distante", () => {
    const d = myDay("u2", at("10:00"), { tasks, items: [decision], events: [], plans: [] })
    const by = (g: string) => d.planItems.filter((i) => i.group === g).map((i) => i.task.id)
    expect(by("atrasado")).toEqual(["atr"])
    expect(by("hoje").sort()).toEqual(["colab", "hoje", "plan"])
    expect(by("depois")).toEqual(["semData"])
    expect(d.planItems.find((i) => i.task.id === "colab")?.badges).toContain("colaborando")
    expect(d.waiting.map((t) => t.id)).toEqual(["dec"])
    const ids = [...d.planItems.map((i) => i.task.id), ...d.waiting.map((t) => t.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("fazendo agora e a sessão da vez sobem; a ordem arrastada vale dentro do grupo", () => {
    const a = task({ id: "a", dueDate: "2026-11-02", order: 0 })
    const b = task({ id: "b", dueDate: "2026-11-02", order: 1, areaId: "comercial" })
    const c = task({ id: "c", dueDate: "2026-11-02", order: 2 })
    const sessao = ev({ kind: "foco", areaId: "comercial", start: at("09:00").toISOString(), end: at("11:00").toISOString() })
    const doing = plan({ sessions: [{ taskId: "c", title: "c", start: at("09:30").toISOString() }] })
    const d = myDay("u2", at("10:00"), { tasks: [a, b, c], items: [], events: [sessao], plans: [doing] })
    expect(d.planItems.map((i) => i.task.id)).toEqual(["c", "b", "a"])
    expect(d.session?.areaId).toBe("comercial")
    expect(reorder(["a", "c", "b"], [a, b, c])).toEqual([
      { id: "c", order: 1 },
      { id: "b", order: 2 },
    ])
  })
})

describe("fazendo agora e período do dia", () => {
  it("uma tarefa por vez: começar outra fecha a anterior; pausar fecha", () => {
    let p = startTask(plan(), { id: "t1", title: "Roteiro" }, at("09:00"))
    p = startTask(p, { id: "t2", title: "Proposta" }, at("10:30"))
    expect(doingNow(p)?.taskId).toBe("t2")
    expect(p.sessions?.[0].end).toBe(at("10:30").toISOString())
    expect(startTask(p, { id: "t2", title: "Proposta" }, at("10:40"))).toBe(p)
    p = stopTask(p, at("12:15"))
    expect(doingNow(p)).toBeUndefined()
    p = startTask(p, { id: "t1", title: "Roteiro" }, at("14:00"))
    const per = periodOfDay(p, at("14:45"))
    expect(per.map((x) => [x.period, x.minutes])).toEqual([
      ["manha", 90 + 105],
      ["tarde", 45],
    ])
    expect(per[1].tasks[0]).toMatchObject({ title: "Roteiro", running: true })
    expect(minutesText(105)).toBe("1h45")
  })

  it("o time vê o que a pessoa está fazendo, mesmo com o app fechado", () => {
    const p = startTask(plan({ checkedInAt: at("08:55").toISOString() }), { id: "t1", title: "Roteiro" }, at("09:00"))
    expect(presenceOf("u2", at("10:00"), { events: [], online: true, plan: p })).toMatchObject({ status: "online", detail: "Fazendo: Roteiro", since: "09:00" })
    expect(presenceOf("u2", at("10:00"), { events: [], online: false, plan: p })).toMatchObject({ status: "expediente", detail: "Fazendo: Roteiro" })
  })
})

describe("pausa com motivo (ADR 0015)", () => {
  it("pausar fecha a tarefa e abre a pausa; começar de novo fecha a pausa", () => {
    let p = startTask(plan(), { id: "t1", title: "Roteiro" }, at("09:00"))
    p = pauseWork(p, "almoco", undefined, at("12:00"))
    expect(doingNow(p)).toBeUndefined()
    expect(p.sessions?.[0].end).toBe(at("12:00").toISOString())
    expect(pausedNow(p)).toMatchObject({ reason: "almoco", start: at("12:00").toISOString() })
    p = startTask(p, { id: "t1", title: "Roteiro" }, at("13:10"))
    expect(pausedNow(p)).toBeUndefined()
    expect(p.pauses?.[0].end).toBe(at("13:10").toISOString())
    expect(doingNow(p)?.start).toBe(at("13:10").toISOString())
  })

  it("trocar o motivo fecha a pausa anterior; voltar sem tarefa só fecha a pausa", () => {
    let p = pauseWork(plan(), "intervalo", undefined, at("10:00"))
    p = pauseWork(p, "outro", "  banco  ", at("10:15"))
    expect(p.pauses?.map((x) => !!x.end)).toEqual([true, false])
    expect(pauseLabel(pausedNow(p)!)).toBe("banco")
    expect(pauseLabel({ reason: "saude", note: "dentista" })).toBe("Médico / dentista: dentista")
    p = endPause(p, at("11:00"))
    expect(pausedNow(p)).toBeUndefined()
    expect(endPause(p, at("11:05"))).toBe(p)
  })

  it("o time vê \"Em pausa · Almoço desde 12:00\", mesmo com o app fechado; a agenda vence", () => {
    const p = pauseWork(plan({ checkedInAt: at("08:55").toISOString() }), "almoco", undefined, at("12:00"))
    expect(presenceOf("u2", at("12:30"), { events: [], online: true, plan: p })).toMatchObject({ status: "pausa", detail: "Almoço", since: "12:00" })
    expect(presenceOf("u2", at("12:30"), { events: [], online: false, plan: p }).status).toBe("pausa")
    expect(presenceOf("u2", at("12:30"), { events: [ev({ start: at("12:00").toISOString(), end: at("13:00").toISOString() })], online: true, plan: p }).status).toBe("reuniao")
    expect(presenceOf("u2", at("12:30"), { events: [], online: false, plan: { ...p, closedAt: at("12:20").toISOString() } }).status).toBe("offline")
  })

  it("pausas aparecem no período do dia, sem contar como tempo trabalhado", () => {
    let p = startTask(plan(), { id: "t1", title: "Roteiro" }, at("09:00"))
    p = pauseWork(p, "academia", undefined, at("10:00"))
    const [manha] = periodOfDay(p, at("10:45"))
    expect(manha.minutes).toBe(60)
    expect(manha.pauses).toEqual([{ label: "Academia", start: at("10:00").toISOString(), minutes: 45, running: true }])
  })
})

describe("avisos para CEO e founders: o que mudou no dia de alguém", () => {
  it("check-in, início de tarefa e pausa viram avisos; regravar o mesmo dia não repete", () => {
    const antes = plan()
    const checkin = { ...antes, checkedInAt: at("09:00").toISOString(), focus: "Proposta" }
    expect(dayChanges(antes, checkin)).toEqual([{ kind: "checkin", focus: "Proposta" }])
    const comecou = startTask(checkin, { id: "t1", title: "Roteiro" }, at("09:05"))
    expect(dayChanges(checkin, comecou)).toEqual([{ kind: "start", title: "Roteiro" }])
    const pausou = pauseWork(comecou, "almoco", undefined, at("12:00"))
    expect(dayChanges(comecou, pausou)).toEqual([{ kind: "pause", label: "Almoço" }])
    expect(dayChanges(pausou, { ...pausou, focus: "outra" })).toEqual([])
    expect(dayChanges(comecou, stopTask(comecou, at("10:00")))).toEqual([])
  })

  it("linha nova do dia já com check-in e tarefa conta como os dois avisos", () => {
    const novo = startTask(plan({ checkedInAt: at("09:00").toISOString() }), { id: "t1", title: "Roteiro" }, at("09:01"))
    expect(dayChanges(undefined, novo).map((c) => c.kind)).toEqual(["checkin", "start"])
  })
})

describe("reunião diária", () => {
  const p = (id: string, over: Partial<DailyPlan> = {}): DailyPlan => ({ id: `${id}:2026-11-02`, memberId: id, date: "2026-11-02", ...over })
  const team = ["u1", "u2", "u3"]

  it("o Pronto só libera com o check-in de todos; com todos prontos, a reunião", () => {
    const now = at("09:10")
    expect(dailyState(team, [p("u1", { checkedInAt: "x" }), p("u2", { checkedInAt: "x" })], [], now)).toMatchObject({ phase: "checkin", missingCheckIn: ["u3"] })
    const all = team.map((id) => p(id, { checkedInAt: "x" }))
    expect(dailyState(team, all, [], now).phase).toBe("liberado")
    expect(dailyState(team, all.map((x) => ({ ...x, readyAt: "y" })), [], now).phase).toBe("todos")
  })

  it("quem está ausente na agenda não trava a daily", () => {
    const folga = ev({ kind: "ausencia", ownerId: "u3", start: at("00:00").toISOString(), end: at("23:59").toISOString() })
    expect(dailyState(team, [p("u1", { checkedInAt: "x" }), p("u2", { checkedInAt: "x" })], [folga], at("09:10"))).toMatchObject({ phase: "liberado", expected: ["u1", "u2"] })
  })

  it("quem foi tirado da daily (Configurações) não participa nem trava; quem entra no time participa", () => {
    const settings = { id: "time", daily: { excludedIds: ["u3"] } }
    expect(dailyParticipants(team, settings)).toEqual(["u1", "u2"])
    expect(dailyParticipants([...team, "u4"], settings)).toEqual(["u1", "u2", "u4"])
    expect(dailyParticipants(team, undefined)).toEqual(team)
    const ids = dailyParticipants(team, settings)
    expect(dailyState(ids, [p("u1", { checkedInAt: "x" }), p("u2", { checkedInAt: "x" })], [], at("09:10")).phase).toBe("liberado")
  })
})

describe("fechar o dia: monte o amanhã", () => {
  it("planejadas e com prazo amanhã primeiro; depois as próximas; fora: feitas, de outros e distantes", () => {
    const ts = [
      task({ id: "semData" }),
      task({ id: "prazo", dueDate: "2026-11-03" }),
      task({ id: "plan", plannedFor: "2026-11-03" }),
      task({ id: "semana", dueDate: "2026-11-06" }),
      task({ id: "longe", dueDate: "2026-12-20" }),
      task({ id: "feita", done: true }),
      task({ id: "outro", ownerId: "u1" }),
    ]
    const c = planCandidates("u2", at("18:00", "2026-11-03"), ts)
    expect(c.map((x) => [x.task.id, x.planned])).toEqual([
      ["prazo", true],
      ["plan", true],
      ["semana", false],
      ["semData", false],
    ])
  })
})

describe("fase da tarefa e tempo: uma regra só", () => {
  const t1 = { id: "t1", title: "Roteiro" }
  const t2 = { id: "t2", title: "Proposta" }
  it("em andamento abre o tempo (e pausa o anterior); concluir ou voltar para a fazer fecha", () => {
    let p = syncWithStatus(plan(), t1, "andamento", at("09:00"))
    expect(doingNow(p)?.taskId).toBe("t1")
    p = syncWithStatus(p, t2, "andamento", at("10:00"))
    expect(doingNow(p)?.taskId).toBe("t2")
    expect(p.sessions?.[0].end).toBe(at("10:00").toISOString())
    p = syncWithStatus(p, t2, "feito", at("11:00"))
    expect(doingNow(p)).toBeUndefined()
    expect(p.sessions?.[1].end).toBe(at("11:00").toISOString())
    p = syncWithStatus(p, t1, "andamento", at("14:00"))
    expect(syncWithStatus(p, t1, "afazer", at("14:30")).sessions?.at(-1)?.end).toBe(at("14:30").toISOString())
  })

  it("concluir outra tarefa não mexe no tempo de quem está rodando", () => {
    const p = syncWithStatus(plan(), t1, "andamento", at("09:00"))
    expect(syncWithStatus(p, t2, "feito", at("09:30"))).toBe(p)
  })
})

describe("rotina (Prospecção) como fazendo agora (ADR 0017)", () => {
  it("entra na linha do dia como sessão, fecha a pausa e pausa com motivo igual a uma tarefa", () => {
    let p = pauseWork(plan(), "almoco", undefined, at("12:00"))
    p = startTask(p, ROUTINES.prospeccao, at("13:00"))
    expect(doingNow(p)).toMatchObject({ taskId: "rotina:prospeccao", title: "Prospecção", areaId: "comercial" })
    expect(pausedNow(p)).toBeUndefined()
    expect(presenceOf("u2", at("13:30"), { events: [], plan: p, online: true }).detail).toBe("Fazendo: Prospecção")
    p = pauseWork(p, "intervalo", undefined, at("15:00"))
    expect(doingNow(p)).toBeUndefined()
    expect(routineOf(p.sessions?.at(-1)?.taskId)).toBe(ROUTINES.prospeccao)
    expect(routineOf("t1")).toBeUndefined()
  })
})
