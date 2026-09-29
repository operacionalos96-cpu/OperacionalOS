import type { Activity, FinanceSettings, Lead, MindMap, Note, Task, Transaction } from "@/lib/domain/types"

/**
 * Contrato de persistência. A UI nunca fala com o storage diretamente —
 * só com estas interfaces. Para migrar para Supabase, basta criar uma nova
 * implementação e trocá-la em `repositories/index.ts`.
 */
export interface CollectionRepository<T extends { id: string }> {
  list(): Promise<T[]>
  upsert(item: T): Promise<T>
  remove(id: string): Promise<void>
}

export interface FinanceSettingsRepository {
  get(): Promise<FinanceSettings>
  save(settings: FinanceSettings): Promise<FinanceSettings>
}

export interface Repositories {
  leads: CollectionRepository<Lead>
  activities: CollectionRepository<Activity>
  tasks: CollectionRepository<Task>
  notes: CollectionRepository<Note>
  transactions: CollectionRepository<Transaction>
  mindMaps: CollectionRepository<MindMap>
  financeSettings: FinanceSettingsRepository
}
