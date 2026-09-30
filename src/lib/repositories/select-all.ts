import type { SupabaseClient } from "@supabase/supabase-js"

/** O Supabase devolve no máximo 1000 linhas por pedido: busca em páginas até acabar. */
export const PAGE_SIZE = 1000

export async function selectAllData<T>(sb: SupabaseClient, table: string, pageSize = PAGE_SIZE): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb
      .from(table)
      .select("data")
      .order("updated_at", { ascending: true })
      .order("id", { ascending: true }) // desempate estável entre páginas
      .range(from, from + pageSize - 1)
    if (error) throw error
    for (const r of data ?? []) out.push(r.data as T)
    if (!data || data.length < pageSize) return out
  }
}
