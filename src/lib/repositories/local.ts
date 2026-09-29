import type { FinanceSettings } from "@/lib/domain/types"
import { createSeed } from "@/lib/seed"
import type { CollectionRepository, FinanceSettingsRepository, Repositories } from "./types"

/** Mude a versão se o formato dos dados mudar de forma incompatível. */
const PREFIX = "operacional:v1:"

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // storage cheio ou bloqueado: a UI continua funcionando em memória
  }
}

function collection<T extends { id: string }>(key: string): CollectionRepository<T> {
  return {
    async list() {
      return read<T[]>(key, [])
    },
    async upsert(item) {
      const items = read<T[]>(key, [])
      const idx = items.findIndex((i) => i.id === item.id)
      if (idx >= 0) items[idx] = item
      else items.push(item)
      write(key, items)
      return item
    },
    async remove(id) {
      write(
        key,
        read<T[]>(key, []).filter((i) => i.id !== id),
      )
    },
  }
}

const DEFAULT_SETTINGS: FinanceSettings = { openingBalanceCents: 0, monthlyGoals: {} }

const financeSettings: FinanceSettingsRepository = {
  async get() {
    return read("financeSettings", DEFAULT_SETTINGS)
  },
  async save(settings) {
    write("financeSettings", settings)
    return settings
  },
}

/** Na primeira visita, popula com dados de exemplo realistas. */
function ensureSeeded() {
  if (read("seeded", false)) return
  const seed = createSeed(new Date())
  write("leads", seed.leads)
  write("activities", seed.activities)
  write("tasks", seed.tasks)
  write("notes", seed.notes)
  write("transactions", seed.transactions)
  write("mindMaps", seed.mindMaps)
  write("financeSettings", seed.financeSettings)
  write("seeded", true)
}

export function createLocalRepositories(): Repositories {
  ensureSeeded()
  return {
    leads: collection("leads"),
    activities: collection("activities"),
    tasks: collection("tasks"),
    notes: collection("notes"),
    transactions: collection("transactions"),
    mindMaps: collection("mindMaps"),
    financeSettings,
  }
}

/**
 * Apaga todos os dados locais. `withExamples`: na próxima carga, repopula com
 * os dados de exemplo; caso contrário, começa vazio (uso real).
 */
export function resetLocalData({ withExamples }: { withExamples: boolean }) {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k))
  if (!withExamples) write("seeded", true)
}
