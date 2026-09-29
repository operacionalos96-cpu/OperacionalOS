import { createSupabaseRepositories } from "./supabase"
import type { Repositories } from "./types"

export type { Repositories } from "./types"

let instance: Repositories | null = null

/**
 * Ponto único de backend: Supabase (dados compartilhados entre os dois, com login).
 * `local.ts` continua existindo só para importar dados antigos deste navegador.
 */
export function getRepositories(): Repositories {
  instance ??= createSupabaseRepositories()
  return instance
}
