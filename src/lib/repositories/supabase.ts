"use client"

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js"
import type { FinanceSettings } from "@/lib/domain/types"
import { supabaseBrowser } from "@/lib/supabase/client"
import { registeredCollections } from "@/lib/collection-store"
import type { CollectionRepository, FinanceSettingsRepository, Repositories } from "./types"

/**
 * Cada coleção é uma tabela `id + data(jsonb)`. As regras de acesso (RLS) ficam
 * no banco — ver supabase/migrations/0001_operacional_os.sql. Erros são
 * relançados para a store avisar o usuário ("Não foi possível salvar").
 */
export const TABLES = {
  leads: "leads",
  activities: "activities",
  tasks: "tasks",
  notes: "notes",
  transactions: "transactions",
  mindMaps: "mind_maps",
} as const

function collection<T extends { id: string }>(table: string): CollectionRepository<T> {
  const db = () => supabaseBrowser().from(table)
  return {
    async list() {
      const { data, error } = await db().select("data").order("updated_at", { ascending: true }).limit(5000)
      if (error) throw error
      return (data ?? []).map((row) => row.data as T)
    },
    async upsert(item) {
      const { error } = await db().upsert({ id: item.id, data: item })
      if (error) throw error
      return item
    },
    async remove(id) {
      const { error } = await db().delete().eq("id", id)
      if (error) throw error
    },
  }
}

const DEFAULT_SETTINGS: FinanceSettings = { openingBalanceCents: 0, monthlyGoals: {} }

const financeSettings: FinanceSettingsRepository = {
  async get() {
    const { data, error } = await supabaseBrowser().from("finance_settings").select("data").eq("id", "default").maybeSingle()
    if (error) throw error
    return (data?.data as FinanceSettings | undefined) ?? DEFAULT_SETTINGS
  },
  async save(settings) {
    const { error } = await supabaseBrowser().from("finance_settings").upsert({ id: "default", data: settings })
    if (error) throw error
    return settings
  },
}

export function createSupabaseRepositories(): Repositories {
  return {
    leads: collection(TABLES.leads),
    activities: collection(TABLES.activities),
    tasks: collection(TABLES.tasks),
    notes: collection(TABLES.notes),
    transactions: collection(TABLES.transactions),
    mindMaps: collection(TABLES.mindMaps),
    financeSettings,
  }
}

/** Avisa quando o sócio muda algo (qualquer tabela). Retorna a função de desligar. */
export type ChangePayload = RealtimePostgresChangesPayload<Record<string, unknown>>

export function subscribeToChanges(onChange: (payload: ChangePayload) => void) {
  const sb = supabaseBrowser()
  const channel = sb.channel("operacional-sync")
  for (const table of [...Object.values(TABLES), "finance_settings", ...registeredCollections().keys()]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange)
  }
  channel.subscribe()
  return () => {
    sb.removeChannel(channel)
  }
}
