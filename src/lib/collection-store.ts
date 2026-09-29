"use client"

import { create, type StoreApi, type UseBoundStore } from "zustand"
import { toast } from "sonner"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * Base de expansão: todo módulo novo (Produtos, Conteúdos, e os próximos) cria
 * sua coleção com `createCollection("nome_da_tabela")` e ganha, sem código extra:
 * carregar do banco, salvar (otimista), apagar com desfazer e sincronizar em
 * tempo real com o sócio. A tabela segue o padrão `id + data(jsonb)` + RLS
 * (ver supabase/migrations). Para um módulo novo: 1 tabela no SQL + 1 linha aqui.
 */
export interface CollectionState<T extends { id: string }> {
  items: T[]
  loaded: boolean
  load(): Promise<void>
  /** Cria ou atualiza. Carimba updatedAt. */
  save(item: T): T
  patch(id: string, patch: Partial<T>): void
  remove(id: string): T | undefined
  restore(item: T): void
  /** Mudança vinda do banco (outro usuário). */
  applyRemote(event: "INSERT" | "UPDATE" | "DELETE", row: { id?: string; data?: T }): void
}

export type Collection<T extends { id: string }> = UseBoundStore<StoreApi<CollectionState<T>>>

const registry = new Map<string, Collection<{ id: string }>>()

/** Todas as coleções registradas (usado no login e no tempo real). */
export function registeredCollections() {
  return registry
}

function persist(p: PromiseLike<{ error: unknown }>) {
  Promise.resolve(p).then(
    (r) => r.error && toast.error("Não foi possível salvar. Tente de novo."),
    () => toast.error("Não foi possível salvar. Tente de novo."),
  )
}

export function createCollection<T extends { id: string; updatedAt?: string }>(table: string): Collection<T> {
  const db = () => supabaseBrowser().from(table)
  const store = create<CollectionState<T>>((set, get) => ({
    items: [],
    loaded: false,

    async load() {
      const { data, error } = await db().select("data").order("updated_at", { ascending: true }).limit(5000)
      if (error) throw error
      set({ items: (data ?? []).map((r) => r.data as T), loaded: true })
    },

    save(input) {
      const item = { ...input, updatedAt: new Date().toISOString() } as T
      set((s) => ({ items: s.items.some((x) => x.id === item.id) ? s.items.map((x) => (x.id === item.id ? item : x)) : [...s.items, item] }))
      persist(db().upsert({ id: item.id, data: item }))
      return item
    },

    patch(id, patch) {
      const current = get().items.find((x) => x.id === id)
      if (current) get().save({ ...current, ...patch })
    },

    remove(id) {
      const current = get().items.find((x) => x.id === id)
      set((s) => ({ items: s.items.filter((x) => x.id !== id) }))
      persist(db().delete().eq("id", id))
      return current
    },

    restore(item) {
      get().save(item)
    },

    applyRemote(event, row) {
      if (event === "DELETE") {
        set((s) => ({ items: s.items.filter((x) => x.id !== row.id) }))
        return
      }
      const item = row.data
      if (!item) return
      set((s) => ({ items: s.items.some((x) => x.id === item.id) ? s.items.map((x) => (x.id === item.id ? item : x)) : [...s.items, item] }))
    },
  }))
  registry.set(table, store as unknown as Collection<{ id: string }>)
  return store
}
