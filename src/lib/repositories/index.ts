import { createLocalRepositories, resetLocalData } from "./local"
import type { Repositories } from "./types"

export type { Repositories } from "./types"

/** Apaga os dados (só existe enquanto o backend é local). */
export const resetData = resetLocalData

let instance: Repositories | null = null

/**
 * Ponto único de troca de backend. Hoje: localStorage.
 * Depois: `createSupabaseRepositories()` implementando as mesmas interfaces.
 */
export function getRepositories(): Repositories {
  instance ??= createLocalRepositories()
  return instance
}
