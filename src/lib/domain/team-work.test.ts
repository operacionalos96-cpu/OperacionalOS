import { describe, expect, it } from "vitest"
import { DEFAULT_AREAS } from "./areas"
import { personWork, collapseDone } from "./team-work"
import type { Activity, Lead, Task } from "./types"

const NOW = new Date("2026-10-31T15:00:00Z")
const task = (over: Partial<Task>): Task => ({ id: Math.random().toString(36).slice(2), title: "t", ownerId: "u2", done: false, createdAt: "2026-10-01", ...over })
const people = { founderIds: ["u1", "u2"] }

describe("responsabilidades e feitos por pessoa", () => {
  const tasks = [
    task({ id: "a", title: "Ligar coprodutor", dueDate: "2026-10-29" }),
    task({ id: "b", title: "Montar funil", dueDate: "2026-11-05" }),
    task({ id: "c", title: "Do Gabriel", ownerId: "u1" }),
    task({ id: "d", title: "Junto com Igor", ownerId: "u1", collaborators: ["u2"] }),
    task({ id: "e", title: "Feito ontem", done: true, doneAt: "2026-10-30T10:00:00Z" }),
    task({ id: "f", title: "Feito há 20 dias", done: true, doneAt: "2026-10-10T10:00:00Z" }),
  ]
  const items: Task[] = [
    task({ id: "dec", kind: "decision", title: "Contratar editor?", decision: { options: [], door: "reversivel", involves: [], status: "decidida", decidedBy: "u2", decidedAt: "2026-10-31T12:00:00Z", deciderId: "u2" } }),
  ]
  const activities: Activity[] = [{ id: "act", leadId: "l1", kind: "nota", text: "Mandou proposta", authorId: "u2", createdAt: "2026-10-31T09:00:00Z" } as Activity]
  const leads = [{ id: "l1", name: "Mariana Costa" }] as Lead[]
  const w = personWork("u2", { tasks, items, activities, areas: DEFAULT_AREAS, people, leads }, NOW)

  it("áreas que a pessoa é dona", () => {
    expect(w.areas.map((a) => a.id)).toEqual(["comercial", "lancamentos", "trafego"])
  })

  it("em andamento inclui as que divide com outra pessoa; atrasadas separadas", () => {
    expect(w.open.map((t) => t.id)).toEqual(["a", "b", "d"])
    expect(w.overdue.map((t) => t.id)).toEqual(["a"])
  })

  it("feitos do período: tarefas, decisões e contatos com leads, do mais recente ao mais antigo", () => {
    expect(w.done.map((d) => `${d.kind}:${d.id}`)).toEqual(["decisao:dec", "lead:act", "tarefa:e"])
    expect(w.done.find((d) => d.kind === "lead")?.title).toBe("Mariana Costa — Mandou proposta")
  })

  it("período maior traz o que ficou de fora", () => {
    const m = personWork("u2", { tasks, items, activities, areas: DEFAULT_AREAS, people }, NOW, 30)
    expect(m.done.some((d) => d.id === "f")).toBe(true)
  })
})

describe("histórico agrupado", () => {
  it("3+ eventos automáticos iguais em sequência viram uma linha; o resto fica igual", () => {
    const e = (id: string, title: string, kind: "lead" | "tarefa" = "lead") => ({ kind, id, title, at: "2026-11-02T10:00:00" })
    const rows = collapseDone([
      e("1", "Ana — Responsável alterado para Gabriel"),
      e("2", "Bia — Responsável alterado para Gabriel"),
      e("3", "Caio — Responsável alterado para Gabriel"),
      e("4", "Roteiro", "tarefa"),
      e("5", "Duda — Lead criado"),
    ])
    expect(rows.map((r) => r.count)).toEqual([3, 1, 1])
    expect(rows[0]).toMatchObject({ text: "Responsável alterado para Gabriel" })
  })
})
