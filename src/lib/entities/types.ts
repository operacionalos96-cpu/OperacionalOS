/**
 * Base "fractal" do Operacional OS: tudo é uma Entidade (lead, tarefa, produto,
 * conteúdo, lançamento, nota, mapa, balão do mapa, meta). Toda entidade tem as
 * mesmas capacidades — contexto, estado, relações e presença — em qualquer tela.
 * Módulo novo = um tipo aqui + um descritor no registro (src/lib/entities/registry.tsx).
 * Arquivo puro (sem React), usado também pelos testes.
 */
export type EntityType = "lead" | "task" | "product" | "content" | "transaction" | "note" | "map" | "mapNode" | "goal"

export interface EntityRef {
  type: EntityType
  id: string
}

export const ENTITY_TYPES: EntityType[] = ["lead", "task", "product", "content", "transaction", "note", "map", "mapNode", "goal"]

/** Chave estável de uma entidade ("task:abc"). Usada como id do contexto. */
export const refKey = (r: EntityRef) => `${r.type}:${r.id}`

export const sameRef = (a: EntityRef | undefined, b: EntityRef | undefined) => !!a && !!b && a.type === b.type && a.id === b.id

export function parseRefKey(key: string): EntityRef | null {
  const i = key.indexOf(":")
  if (i <= 0) return null
  const type = key.slice(0, i) as EntityType
  return ENTITY_TYPES.includes(type) ? { type, id: key.slice(i + 1) } : null
}

// ---------- relações ----------

export type RelationKind = "relacionado" | "depende" | "bloqueia" | "gera" | "parte_de"

export const RELATION_KINDS: { id: RelationKind; label: string; inverse: string }[] = [
  { id: "relacionado", label: "relacionado a", inverse: "relacionado a" },
  { id: "depende", label: "depende de", inverse: "é pré-requisito de" },
  { id: "bloqueia", label: "bloqueia", inverse: "bloqueado por" },
  { id: "gera", label: "gera", inverse: "gerado por" },
  { id: "parte_de", label: "faz parte de", inverse: "contém" },
]

export interface Relation {
  id: string
  from: EntityRef
  to: EntityRef
  kind: RelationKind
  /** Legenda livre opcional ("precisa do orçamento aprovado"). */
  label?: string
  createdBy: string
  createdAt: string
  updatedAt?: string
}

// ---------- contexto comum ----------

export interface ContextLink {
  id: string
  label: string
  url: string
}

export interface ContextAttachment {
  id: string
  name: string
  storagePath?: string
  url?: string
  sizeBytes?: number
  uploadedAt: string
  uploadedBy: string
}

export interface ContextComment {
  id: string
  authorId: string
  text: string
  createdAt: string
}

/** Contexto extra de QUALQUER entidade. id = refKey(ref). */
export interface EntityContext {
  id: string
  ref: EntityRef
  notes?: string
  links: ContextLink[]
  attachments: ContextAttachment[]
  comments: ContextComment[]
  updatedAt?: string
}

export function emptyContext(ref: EntityRef): EntityContext {
  return { id: refKey(ref), ref, links: [], attachments: [], comments: [] }
}
