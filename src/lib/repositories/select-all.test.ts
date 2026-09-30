import { describe, expect, it } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { selectAllData } from "./select-all"

/** Banco falso com N linhas que respeita .range(from, to). */
function fakeDb(n: number, calls: [number, number][]) {
  const rows = Array.from({ length: n }, (_, i) => ({ data: { id: i } }))
  const q = {
    select: () => q,
    order: () => q,
    range: async (from: number, to: number) => {
      calls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    },
  }
  return { from: () => q } as unknown as SupabaseClient
}

describe("carregar tudo em páginas", () => {
  it("passa de 1000 linhas sem cortar", async () => {
    const calls: [number, number][] = []
    const all = await selectAllData<{ id: number }>(fakeDb(2500, calls), "t", 1000)
    expect(all).toHaveLength(2500)
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it("página exata pede mais uma e para no vazio", async () => {
    const calls: [number, number][] = []
    expect(await selectAllData(fakeDb(2, calls), "t", 2)).toHaveLength(2)
    expect(calls).toHaveLength(2)
  })
})
