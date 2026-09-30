/**
 * Relações e presença entre entidades. Funções puras, testadas em relations.test.ts.
 * "Presença" junta as ligações explícitas (tabela relations) com as implícitas que
 * já existiam nos módulos (lead.productId, task.leadId, balão do mapa → tarefa…),
 * para que toda tela mostre "onde esta coisa aparece" sem duplicar dados.
 */
import type { ContentItem } from "@/lib/domain/content"
import type { Lead, MindMap, Task, Transaction } from "@/lib/domain/types"
import { RELATION_KINDS, refKey, sameRef, type EntityRef, type Relation } from "./types"

export interface Presence {
  ref: EntityRef
  /** Como está ligado ("depende de", "no mapa", "lançamento do produto"…). */
  via: string
  /** Presente se a ligação é uma relação explícita (pode ser desfeita). */
  relationId?: string
}

export interface PresenceSnapshot {
  relations: Relation[]
  tasks: Pick<Task, "id" | "leadId">[]
  leads: Pick<Lead, "id" | "productId">[]
  transactions: Pick<Transaction, "id" | "leadId" | "productId">[]
  contents: Pick<ContentItem, "id" | "productId">[]
  mindMaps: Pick<MindMap, "id" | "nodes" | "title">[]
}

const kindLabel = (kind: Relation["kind"], outgoing: boolean) => {
  const k = RELATION_KINDS.find((x) => x.id === kind)
  return k ? (outgoing ? k.label : k.inverse) : kind
}

export function presenceOf(ref: EntityRef, s: PresenceSnapshot): Presence[] {
  const out: Presence[] = []
  const add = (p: Presence) => {
    if (sameRef(p.ref, ref)) return
    if (!out.some((o) => refKey(o.ref) === refKey(p.ref) && o.via === p.via)) out.push(p)
  }

  for (const r of s.relations) {
    if (sameRef(r.from, ref)) add({ ref: r.to, via: r.label || kindLabel(r.kind, true), relationId: r.id })
    else if (sameRef(r.to, ref)) add({ ref: r.from, via: r.label || kindLabel(r.kind, false), relationId: r.id })
  }

  // Balões de mapa ligados a esta entidade (tarefa, lead, produto, conteúdo…).
  for (const m of s.mindMaps)
    for (const n of m.nodes)
      if (
        (ref.type === "task" && n.taskId === ref.id) ||
        (ref.type === "lead" && n.leadId === ref.id) ||
        (n.ref && n.ref.type === ref.type && n.ref.id === ref.id)
      )
        add({ ref: { type: "mapNode", id: `${m.id}/${n.id}` }, via: `no mapa · ${m.title}` })

  // O balão mostra o que ele representa.
  if (ref.type === "mapNode") {
    const [mapId, nodeId] = ref.id.split("/")
    const n = s.mindMaps.find((m) => m.id === mapId)?.nodes.find((x) => x.id === nodeId)
    if (n?.taskId) add({ ref: { type: "task", id: n.taskId }, via: "tarefa do balão" })
    if (n?.leadId) add({ ref: { type: "lead", id: n.leadId }, via: "lead do balão" })
    if (n?.ref) add({ ref: n.ref, via: "ligado ao balão" })
    if (mapId) add({ ref: { type: "map", id: mapId }, via: "mapa" })
  }

  switch (ref.type) {
    case "lead":
      for (const t of s.tasks) if (t.leadId === ref.id) add({ ref: { type: "task", id: t.id }, via: "tarefa do lead" })
      for (const t of s.transactions) if (t.leadId === ref.id) add({ ref: { type: "transaction", id: t.id }, via: "lançamento do lead" })
      {
        const lead = s.leads.find((l) => l.id === ref.id)
        if (lead?.productId) add({ ref: { type: "product", id: lead.productId }, via: "produto de interesse" })
      }
      break
    case "task": {
      const task = s.tasks.find((t) => t.id === ref.id)
      if (task?.leadId) add({ ref: { type: "lead", id: task.leadId }, via: "lead da tarefa" })
      break
    }
    case "product":
      for (const l of s.leads) if (l.productId === ref.id) add({ ref: { type: "lead", id: l.id }, via: "lead do produto" })
      for (const t of s.transactions) if (t.productId === ref.id) add({ ref: { type: "transaction", id: t.id }, via: "lançamento do produto" })
      for (const c of s.contents) if (c.productId === ref.id) add({ ref: { type: "content", id: c.id }, via: "conteúdo do produto" })
      break
    case "transaction": {
      const tx = s.transactions.find((t) => t.id === ref.id)
      if (tx?.leadId) add({ ref: { type: "lead", id: tx.leadId }, via: "lead do lançamento" })
      if (tx?.productId) add({ ref: { type: "product", id: tx.productId }, via: "produto do lançamento" })
      break
    }
    case "content": {
      const c = s.contents.find((x) => x.id === ref.id)
      if (c?.productId) add({ ref: { type: "product", id: c.productId }, via: "produto divulgado" })
      break
    }
  }
  return out
}

/**
 * O que ainda impede esta entidade: coisas de que ela "depende" ou que a "bloqueiam"
 * e que ainda não estão feitas. `isDone` diz se uma entidade está concluída.
 */
export function blockersOf(ref: EntityRef, relations: Relation[], isDone: (r: EntityRef) => boolean): EntityRef[] {
  const out: EntityRef[] = []
  for (const r of relations) {
    const blocker = r.kind === "depende" && sameRef(r.from, ref) ? r.to : r.kind === "bloqueia" && sameRef(r.to, ref) ? r.from : null
    if (blocker && !isDone(blocker) && !out.some((o) => sameRef(o, blocker))) out.push(blocker)
  }
  return out
}

/** Evita duplicar a mesma ligação (mesmos dois lados e mesmo tipo, em qualquer direção para "relacionado"). */
export function relationExists(relations: Relation[], from: EntityRef, to: EntityRef, kind: Relation["kind"]) {
  return relations.some(
    (r) => r.kind === kind && ((sameRef(r.from, from) && sameRef(r.to, to)) || (kind === "relacionado" && sameRef(r.from, to) && sameRef(r.to, from))),
  )
}
