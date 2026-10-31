import { describe, expect, it } from "vitest"
import type { DailyPlan } from "./presence"
import type { Task } from "./types"
import { checkinId, missingCheckins, weekOf, weekSummary, weeklyAsk, type WeeklyCheckin } from "./weekly"

const at = (day: string, hhmm = "09:00") => new Date(`${day}T${hhmm}:00`)
const WEEK = "2026-11-02" // segunda
const ci = (memberId: string, kind: "segunda" | "sexta", over: Partial<WeeklyCheckin> = {}): WeeklyCheckin => ({ id: checkinId(memberId, WEEK, kind), memberId, week: WEEK, kind, answeredAt: "x", ...over })
const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: "T", ownerId: "u2", done: false, createdAt: "x", ...over })

describe("check-in semanal: quando perguntar", () => {
  it("segunda (até quarta para quem faltou): o foco; sexta à tarde e fim de semana: a retrospectiva", () => {
    expect(weekOf(at("2026-11-05"))).toBe(WEEK)
    expect(weekOf(at("2026-11-08"))).toBe(WEEK) // domingo ainda é da semana
    expect(weeklyAsk("u2", at("2026-11-02"), [])).toBe("segunda")
    expect(weeklyAsk("u2", at("2026-11-04"), [])).toBe("segunda")
    expect(weeklyAsk("u2", at("2026-11-04"), [ci("u2", "segunda")])).toBeNull()
    expect(weeklyAsk("u2", at("2026-11-05"), [])).toBeNull() // quinta: nada
    expect(weeklyAsk("u2", at("2026-11-06", "10:00"), [ci("u2", "segunda")])).toBeNull() // sexta de manhã
    expect(weeklyAsk("u2", at("2026-11-06", "15:00"), [ci("u2", "segunda")])).toBe("sexta")
    expect(weeklyAsk("u2", at("2026-11-07"), [ci("u2", "sexta")])).toBeNull()
  })
})

describe("Semana do time", () => {
  it("junta as respostas com o que cada um fez na semana (tarefas, decisões e tempo por área)", () => {
    const plans: DailyPlan[] = [
      { id: "u2:2026-11-03", memberId: "u2", date: "2026-11-03", sessions: [{ taskId: "t", title: "t", areaId: "comercial", start: at("2026-11-03", "09:00").toISOString(), end: at("2026-11-03", "10:30").toISOString() }] },
      { id: "u2:2026-10-30", memberId: "u2", date: "2026-10-30", sessions: [{ taskId: "t", title: "t", start: at("2026-10-30", "09:00").toISOString(), end: at("2026-10-30", "10:00").toISOString() }] },
    ]
    const tasks = [task({ id: "feita", done: true, doneAt: "2026-11-04T10:00:00" }), task({ id: "antes", done: true, doneAt: "2026-10-30T10:00:00" }), task({ id: "aberta" })]
    const items = [task({ id: "dec", kind: "decision", decision: { options: [], door: "reversivel", involves: [], status: "decidida", decidedBy: "u2", decidedAt: "2026-11-05T12:00:00" } })]
    const [u2, u1] = weekSummary(["u2", "u1"], WEEK, { tasks, items, plans, checkins: [ci("u2", "segunda", { focus: ["Fechar 2 coprodutores"] })] }, at("2026-11-06"))
    expect(u2.monday?.focus).toEqual(["Fechar 2 coprodutores"])
    expect(u2.done.map((t) => t.id)).toEqual(["feita"])
    expect(u2.decided.map((t) => t.id)).toEqual(["dec"])
    expect(u2.minutesByArea).toEqual({ comercial: 90 })
    expect(missingCheckins([u2, u1], "segunda")).toEqual(["u1"])
  })
})
