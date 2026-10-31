/**
 * Item único do HZK OS (docs/hzk-os-blueprint.md): tarefa, ideia, decisão ou nota rápida.
 * Fonte única guardada na tabela de tarefas; as telas são filtros. Regras puras, testadas em items.test.ts.
 */
import { differenceInHours, parseISO } from "date-fns"
import { ownerOfArea, type Area, type PeopleContext } from "./areas"
import type { DecisionData, ISODate, Task } from "./types"

export type ItemKind = NonNullable<Task["kind"]>

export const ITEM_KINDS: { id: ItemKind; label: string; hint: string }[] = [
  { id: "task", label: "Tarefa", hint: "Algo a fazer, com dono e prazo" },
  { id: "idea", label: "Ideia", hint: "Algo para pensar ou discutir depois" },
  { id: "decision", label: "Decisão", hint: "Algo a escolher, com quem decide" },
  { id: "note", label: "Nota", hint: "Um registro rápido" },
]

export const kindOf = (t: Pick<Task, "kind">): ItemKind => t.kind ?? "task"

/** Tarefa de trabalho já triada: é o que as telas de tarefas, a Início e as metas enxergam. */
export const isWorkTask = (t: Task) => kindOf(t) === "task" && !t.inbox && !t.archivedAt

// ---------- caixa de entrada ----------

/** Horas na caixa de entrada até ganhar o selo de alerta. */
export const INBOX_ALERT_HOURS = 48

/**
 * Está na caixa de entrada: foi capturado e ainda não triado, ou não tem dono.
 * (Tarefas antigas sem prazo NÃO entram: são backlog já organizado, não captura nova.)
 */
export function inInbox(t: Task): boolean {
  if (t.archivedAt || t.done) return false
  return !!t.inbox || !t.ownerId
}

export function inboxAlert(t: Task, now: Date): boolean {
  return inInbox(t) && differenceInHours(now, parseISO(t.createdAt)) >= INBOX_ALERT_HOURS
}

/** Captura rápida: uma linha vira item na caixa de entrada de quem capturou. */
export function captureItem(input: { kind: ItemKind; title: string; byId: string }, id: string, now: Date): Task {
  const title = input.title.trim()
  return {
    id,
    title,
    kind: input.kind,
    ownerId: input.byId,
    createdById: input.byId,
    createdAt: now.toISOString(),
    done: false,
    inbox: true,
    origin: "captura",
    ...(input.kind === "decision" ? { decision: emptyDecision() } : {}),
  }
}

export const emptyDecision = (): DecisionData => ({ options: [], door: "reversivel", involves: [], status: "pendente" })

/** Triagem: decide o que o item vira. Devolve só o que muda (para salvar e para desfazer). */
export type TriageChoice =
  | { to: "task"; areaId?: string; ownerId?: string; dueDate?: ISODate }
  | { to: "idea" }
  | { to: "decision" }
  | { to: "archive" }

export function triage(item: Task, choice: TriageChoice, ctx: { areas: Area[]; people: PeopleContext }, now: Date): Partial<Task> {
  const stamp = { inbox: false, triagedAt: now.toISOString().slice(0, 10) }
  switch (choice.to) {
    case "task": {
      const area = ctx.areas.find((a) => a.id === choice.areaId)
      // Dono = quem foi escolhido; senão o dono da área; senão quem já era.
      const ownerId = choice.ownerId || ownerOfArea(area, ctx.people) || item.ownerId
      return { ...stamp, kind: "task", areaId: choice.areaId, ownerId, dueDate: choice.dueDate ?? item.dueDate }
    }
    case "idea":
      return { ...stamp, kind: "idea" }
    case "decision":
      return { ...stamp, kind: "decision", decision: item.decision ?? emptyDecision() }
    case "archive":
      return { inbox: false, archivedAt: now.toISOString().slice(0, 10) }
  }
}

/** Ao criar/editar com área: o dono vem da área (a pessoa pode trocar depois). */
export function ownerForNewItem(areaId: string | undefined, fallbackId: string, ctx: { areas: Area[]; people: PeopleContext }) {
  return ownerOfArea(ctx.areas.find((a) => a.id === areaId), ctx.people) ?? fallbackId
}

// ---------- decisões (porta de mão única x mão dupla) ----------

export interface DecisionRoute {
  /** Quem decide (um ou mais, quando cai nos founders por falta de CEO). */
  deciderIds: string[]
  /** Precisam dar ok antes (o outro founder, quando afeta a área dele). */
  okFromIds: string[]
  /** Por que foi para essas pessoas, em linguagem simples. */
  reason: string
  goesToCeo: boolean
}

/**
 * Regra do blueprint:
 * 1. Reversível e dentro da área → o dono da área decide e só registra.
 * 2. Dinheiro acima do limite, contrato, contratação, estratégia ou irreversível → CEO.
 *    Sem CEO definida: os founders decidem (avisado).
 * 3. Afeta a área de outro dono → esse dono precisa dar ok.
 */
export function routeDecision(
  d: Pick<DecisionData, "door" | "involves" | "amountCents" | "affectsAreaIds">,
  areaId: string | undefined,
  ctx: { areas: Area[]; people: PeopleContext; limitCents?: number | null; proposerId: string },
): DecisionRoute {
  const why: string[] = []
  if (d.involves.includes("contrato")) why.push("envolve contrato")
  if (d.involves.includes("contratacao")) why.push("envolve contratação")
  if (d.involves.includes("estrategia")) why.push("muda a estratégia")
  if (d.door === "irreversivel") why.push("é difícil de desfazer")
  const limit = ctx.limitCents
  if (d.involves.includes("dinheiro") && limit != null && (d.amountCents ?? 0) > limit) why.push("o valor passa do limite")

  const area = ctx.areas.find((a) => a.id === areaId)
  const areaOwner = ownerOfArea(area, ctx.people)
  let deciderIds: string[]
  let reason: string
  const goesToCeo = why.length > 0
  if (goesToCeo) {
    if (ctx.people.ceoId) {
      deciderIds = [ctx.people.ceoId]
      reason = `Vai para a CEO: ${why.join(", ")}.`
    } else {
      deciderIds = ctx.people.founderIds.length ? ctx.people.founderIds : [ctx.proposerId]
      reason = `Iria para a CEO (${why.join(", ")}), mas ainda não há CEO definida: os founders decidem.`
    }
  } else if (areaOwner) {
    deciderIds = [areaOwner]
    reason = `Reversível e dentro da área ${area!.name}: o dono da área decide.`
  } else {
    deciderIds = ctx.people.founderIds.length ? ctx.people.founderIds : [ctx.proposerId]
    reason = "Sem área com dono definido: os founders decidem."
  }

  const okFromIds = [
    ...new Set(
      (d.affectsAreaIds ?? [])
        .filter((id) => id !== areaId)
        .map((id) => ownerOfArea(ctx.areas.find((a) => a.id === id), ctx.people))
        .filter((id): id is string => !!id && !deciderIds.includes(id)),
    ),
  ]
  return { deciderIds, okFromIds, reason, goesToCeo }
}

/** Decisão sem resposta depois do prazo: selo vermelho no Início de quem decide. */
export function decisionOverdue(t: Task, now: Date): boolean {
  return kindOf(t) === "decision" && t.decision?.status !== "decidida" && t.decision?.status !== "recusada" && !!t.dueDate && t.dueDate < now.toISOString().slice(0, 10)
}

/** Decisões esperando por esta pessoa (como quem decide). */
export function decisionsWaitingFor(memberId: string, items: Task[]): Task[] {
  return items.filter(
    (t) => kindOf(t) === "decision" && !t.archivedAt && !t.inbox && t.decision?.status !== "decidida" && t.decision?.status !== "recusada" && (t.decision?.deciderIds ?? [t.decision?.deciderId]).includes(memberId),
  )
}
