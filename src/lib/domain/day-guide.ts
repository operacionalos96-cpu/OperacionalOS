/**
 * Guia do dia (o "agente" do HZK Workspace, adaptado para o time): saudação, check-in de um botão,
 * "Por onde vamos começar?" com a lista de cada pessoa em ordem de prioridade, o que virou cada
 * coisa anotada ontem e a sequência de check-ins. Tudo DERIVADO das fontes que já existem (tarefas,
 * itens, agenda, check-ins) — nada guardado à parte. Regras puras, testadas em day-guide.test.ts.
 */
import { differenceInMinutes, format, isWeekend, parseISO, subDays } from "date-fns"
import { timeRange } from "./calendar"
import { inInbox, kindOf } from "./items"
import type { MyDay } from "./my-day"
import type { DailyPlan } from "./presence"
import { isTaskFor } from "./rules"
import type { Task } from "./types"

export type GuideMood = "hello" | "point" | "focus" | "calm" | "party" | "rest"

// ---------- saudação ----------

export interface Greeting {
  title: string
  line: string
}

/** "Bom dia" / "Boa tarde" / "Boa noite" — fonte única (Início e guia do dia). Madrugada é noite. */
export function helloFor(now: Date): string {
  const h = now.getHours()
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
}

/** Muda com a hora, o dia da semana, a primeira vez e a volta no mesmo dia (como no Workspace). */
export function greeting(name: string, now: Date, ctx: { firstTime: boolean; seenToday: boolean; pending: number }): Greeting {
  const h = now.getHours()
  const hello = helloFor(now)
  if (ctx.firstTime) return { title: `${hello}, ${name}!`, line: "Eu sou o guia do dia: todo dia te mostro por onde começar. Um toque e você faz o check-in." }
  if (ctx.seenToday) return { title: `De volta, ${name}?`, line: ctx.pending ? (ctx.pending === 1 ? "Falta 1 coisa na sua lista de hoje." : `Faltam ${ctx.pending} coisas na sua lista de hoje.`) : "Sua lista de hoje está em dia." }
  if (h >= 22 || h < 5) return { title: `Trabalhando até tarde, ${name}?`, line: "Vamos ver só o essencial e descansar." }
  const day = now.getDay()
  if (day === 1) return { title: `${hello}, ${name}!`, line: "Semana nova começando. Vamos ver o que vem primeiro." }
  if (day === 5) return { title: `${hello}, ${name}!`, line: "Sexta-feira! Bora fechar a semana com tudo entregue." }
  if (day === 0 || day === 6) return { title: `${hello}, ${name}!`, line: "Fim de semana: só o que não pode esperar." }
  return { title: `${hello}, ${name}!`, line: ctx.pending ? "Aqui está o seu dia, em ordem de prioridade." : "Nada pendente por enquanto. Bom momento para adiantar algo." }
}

// ---------- lista do dia ----------

export type StepKind = "atrasada" | "decisao" | "reuniao" | "hoje" | "caixa"

export interface GuideStep {
  id: string
  kind: StepKind
  title: string
  /** Por que está aqui ("Atrasada desde 28/10", "14:00–15:00"…). */
  hint: string
  href: string
  /** Tarefa que dá para concluir ali mesmo. */
  taskId?: string
}


/**
 * "Por onde vamos começar?": a mesma lista da Início (myDay), na ordem do "foco" do Workspace:
 * atrasadas → decisões esperando a pessoa → próximas reuniões de hoje → tarefas de hoje → triar a
 * caixa de entrada. Primeiro o que já passou do prazo, depois o que trava os outros, depois o que
 * tem hora marcada.
 */
export function dayPlan(day: MyDay, now: Date): GuideStep[] {
  const steps: GuideStep[] = []
  for (const i of day.planItems.filter((x) => x.group === "atrasado")) {
    steps.push({ id: i.task.id, kind: "atrasada", title: i.task.title, hint: `Atrasada desde ${format(parseISO(i.task.dueDate!), "dd/MM")}`, href: "/tarefas", taskId: i.task.id })
  }
  for (const t of day.waiting) steps.push({ id: t.id, kind: "decisao", title: t.title, hint: "Esperando a sua decisão", href: "/decisoes" })
  for (const e of day.agenda.filter((x) => x.kind !== "ausencia" && new Date(x.end) > now)) {
    const mins = differenceInMinutes(new Date(e.start), now)
    steps.push({ id: e.id, kind: "reuniao", title: e.title, hint: mins > 0 && mins <= 60 ? `Começa em ${mins} min · ${timeRange(e)}` : timeRange(e), href: "/agenda" })
  }
  for (const i of day.planItems.filter((x) => x.group === "hoje")) {
    steps.push({ id: i.task.id, kind: "hoje", title: i.task.title, hint: i.badges.includes("fazendo") ? "Fazendo agora" : i.task.dueDate === format(now, "yyyy-MM-dd") ? "Prazo hoje" : "Planejada para hoje", href: "/tarefas", taskId: i.task.id })
  }
  if (day.inboxCount) {
    steps.push({ id: "caixa", kind: "caixa", title: `Triar ${day.inboxCount} ${day.inboxCount === 1 ? "item" : "itens"} da caixa de entrada`, hint: "Decidir o que cada um vira", href: "/caixa-de-entrada" })
  }
  return steps
}

// ---------- o que virou o que foi anotado ontem ----------

export type Became = "caixa" | "tarefa" | "feita" | "ideia" | "decisao" | "nota" | "arquivada"

export const BECAME_LABEL: Record<Became, string> = {
  caixa: "Ainda na caixa de entrada",
  tarefa: "Virou tarefa",
  feita: "Virou tarefa e já foi feita",
  ideia: "Guardada como ideia",
  decisao: "Virou decisão",
  nota: "Ficou como nota",
  arquivada: "Arquivada",
}

export function became(t: Task): Became {
  if (t.archivedAt) return "arquivada"
  if (inInbox(t)) return "caixa"
  const k = kindOf(t)
  if (k === "task") return t.done ? "feita" : "tarefa"
  return k === "idea" ? "ideia" : k === "decision" ? "decisao" : "nota"
}

/**
 * O que a pessoa anotou no último dia de trabalho (ontem; na segunda, a sexta) e o que cada coisa
 * virou. Olha até 4 dias para trás, para pular fim de semana e feriado.
 */
export function lastDayCaptures(memberId: string, now: Date, all: Task[]): { day: string; list: { item: Task; became: Became }[] } | null {
  for (let back = 1; back <= 4; back++) {
    const day = format(subDays(now, back), "yyyy-MM-dd")
    const list = all.filter((t) => t.createdById === memberId && t.origin === "captura" && t.createdAt.slice(0, 10) === day)
    if (list.length) return { day, list: list.map((item) => ({ item, became: became(item) })) }
  }
  return null
}

// ---------- gamificação ----------

/** Dias seguidos com check-in (fim de semana sem check-in não quebra a sequência). */
export function checkInStreak(memberId: string, now: Date, plans: DailyPlan[]): number {
  const done = new Set(plans.filter((p) => p.memberId === memberId && p.checkedInAt).map((p) => p.date))
  let day = done.has(format(now, "yyyy-MM-dd")) ? now : subDays(now, 1)
  let streak = 0
  for (let i = 0; i < 366; i++, day = subDays(day, 1)) {
    if (done.has(format(day, "yyyy-MM-dd"))) streak++
    else if (!isWeekend(day)) break
  }
  return streak
}

/** Quanto do dia já foi entregue: concluídas hoje x o que vence até hoje e ainda está aberto. */
export function dayProgress(memberId: string, now: Date, tasks: Task[]): { done: number; total: number } {
  const today = format(now, "yyyy-MM-dd")
  const mine = tasks.filter((t) => isTaskFor(t, memberId))
  const done = mine.filter((t) => t.done && t.doneAt?.slice(0, 10) === today).length
  const open = mine.filter((t) => !t.done && ((t.dueDate && t.dueDate <= today) || t.plannedFor === today)).length
  return { done, total: done + open }
}

/** O humor do orbe: atrasada = foco; tudo entregue = festa; senão aponta para a lista. */
export function guideMood(steps: GuideStep[], progress: { done: number; total: number }): GuideMood {
  if (steps.some((s) => s.kind === "atrasada")) return "focus"
  if (progress.total > 0 && progress.done === progress.total) return "party"
  return steps.length ? "point" : "calm"
}
