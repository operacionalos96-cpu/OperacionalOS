/**
 * Resumo de qualquer entidade a partir de um "snapshot" dos dados (sem React).
 * É o que permite qualquer tela listar/buscar/mostrar qualquer coisa do OS.
 * Testado em summary.test.ts.
 */
import type { ContentItem } from "@/lib/domain/content"
import type { Product } from "@/lib/domain/products"
import type { Lead, MindMap, Note, Task, Transaction } from "@/lib/domain/types"
import { money } from "../format"
import type { EntityRef, EntityType, Relation } from "./types"

export interface EntitySnapshot {
  leads: Lead[]
  tasks: Task[]
  notes: Note[]
  transactions: Transaction[]
  mindMaps: MindMap[]
  products: Product[]
  contents: ContentItem[]
  relations: Relation[]
}

export interface EntitySummary {
  title: string
  subtitle?: string
  /** Concluída / ganha / publicada — usada para bloqueios e riscados. */
  done: boolean
}

export const ENTITY_LABEL: Record<EntityType, { one: string; many: string }> = {
  lead: { one: "Lead", many: "Leads" },
  task: { one: "Tarefa", many: "Tarefas" },
  product: { one: "Produto", many: "Produtos" },
  content: { one: "Conteúdo", many: "Conteúdos" },
  transaction: { one: "Lançamento", many: "Lançamentos" },
  note: { one: "Nota", many: "Notas" },
  map: { one: "Mapa", many: "Mapas" },
  mapNode: { one: "Item de mapa", many: "Itens de mapa" },
  goal: { one: "Meta", many: "Metas" },
}

export function summaryOf(ref: EntityRef, s: EntitySnapshot): EntitySummary | null {
  switch (ref.type) {
    case "lead": {
      const l = s.leads.find((x) => x.id === ref.id)
      return l ? { title: l.name, subtitle: l.company, done: l.stage === "ganho" } : null
    }
    case "task": {
      const t = s.tasks.find((x) => x.id === ref.id)
      return t ? { title: t.title, subtitle: t.done ? "feita" : t.status === "andamento" ? "em andamento" : undefined, done: t.done } : null
    }
    case "product": {
      const p = s.products.find((x) => x.id === ref.id)
      return p ? { title: p.name, subtitle: p.priceCents ? money(p.priceCents) : undefined, done: false } : null
    }
    case "content": {
      const c = s.contents.find((x) => x.id === ref.id)
      return c ? { title: c.title, subtitle: c.stage, done: c.stage === "publicado" } : null
    }
    case "transaction": {
      const t = s.transactions.find((x) => x.id === ref.id)
      return t ? { title: t.description, subtitle: `${t.type === "entrada" ? "+" : "−"}${money(t.amountCents)}`, done: true } : null
    }
    case "note": {
      const n = s.notes.find((x) => x.id === ref.id)
      return n ? { title: n.title || "Nota sem título", done: false } : null
    }
    case "map": {
      const m = s.mindMaps.find((x) => x.id === ref.id)
      return m ? { title: m.title, subtitle: `${m.nodes.length} itens`, done: false } : null
    }
    case "mapNode": {
      // id = "<mapa>/<balão>"
      const [mapId, nodeId] = ref.id.split("/")
      const m = s.mindMaps.find((x) => x.id === mapId)
      const n = m?.nodes.find((x) => x.id === nodeId)
      return n ? { title: n.label || "Sem texto", subtitle: m!.title, done: n.status === "feito" } : null
    }
    case "goal":
      return null
  }
}

/** Tudo que pode ser buscado/vinculado, já com título (para seletores e Ctrl+K). */
export function searchableEntities(s: EntitySnapshot): (EntityRef & EntitySummary)[] {
  const refs: EntityRef[] = [
    ...s.tasks.map((x) => ({ type: "task" as const, id: x.id })),
    ...s.leads.map((x) => ({ type: "lead" as const, id: x.id })),
    ...s.products.map((x) => ({ type: "product" as const, id: x.id })),
    ...s.contents.map((x) => ({ type: "content" as const, id: x.id })),
    ...s.notes.map((x) => ({ type: "note" as const, id: x.id })),
    ...s.mindMaps.map((x) => ({ type: "map" as const, id: x.id })),
    ...s.transactions.map((x) => ({ type: "transaction" as const, id: x.id })),
  ]
  return refs.flatMap((r) => {
    const sum = summaryOf(r, s)
    return sum ? [{ ...r, ...sum }] : []
  })
}
