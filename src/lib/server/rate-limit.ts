import "server-only"
import { supabaseAdmin } from "./supabase-admin"

/**
 * Limite de uso que vale para TODAS as cópias do servidor (contador no banco, SQL 0009).
 * Se o banco não responder (SQL ainda não rodado), cai para um contador em memória —
 * mais fraco, mas nunca deixa sem limite.
 */
const memory = new Map<string, number[]>()

function memoryHit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now()
  const recent = (memory.get(key) ?? []).filter((t) => now - t < windowSeconds * 1000)
  recent.push(now)
  memory.set(key, recent)
  return recent.length <= limit
}

/** Conta 1 uso. true = dentro do limite. */
export async function rateHit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_hit", { p_key: key, p_limit: limit, p_window: windowSeconds })
    if (error) throw error
    return data === true
  } catch {
    return memoryHit(key, limit, windowSeconds)
  }
}

/** Quantos usos já houve na janela atual (sem contar mais um). */
export async function rateCount(key: string, windowSeconds: number): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_count", { p_key: key, p_window: windowSeconds })
    if (error) throw error
    return Number(data) || 0
  } catch {
    const now = Date.now()
    return (memory.get(key) ?? []).filter((t) => now - t < windowSeconds * 1000).length
  }
}
