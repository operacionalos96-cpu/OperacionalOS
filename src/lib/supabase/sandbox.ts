"use client"

import { createSeed } from "@/lib/seed"

/**
 * MODO DEMONSTRAÇÃO (só desenvolvimento): NEXT_PUBLIC_SANDBOX=1 troca o Supabase por um
 * banco local no navegador (localStorage). Serve para testar telas — mapas, lousa, vínculos —
 * sem login e sem internet. Não existe em produção (o build de produção ignora a variável).
 * Implementa só o que o app usa: select/order/range/limit/eq/maybeSingle, upsert, insert, delete.
 */
export const SANDBOX = process.env.NEXT_PUBLIC_SANDBOX === "1" && process.env.NODE_ENV !== "production"

type Row = { id: string; data?: unknown; updated_at: string; [k: string]: unknown }
const KEY = (t: string) => `sandbox:v1:${t}`
const MEMBER = { email: "demo@operacional.local", team_id: "u1", display_name: "Gabriel", role_level: "owner", active: true, joined_at: "2026-01-01T00:00:00.000Z" }

function read(table: string): Row[] {
  try {
    const raw = localStorage.getItem(KEY(table))
    if (raw) return JSON.parse(raw) as Row[]
  } catch {}
  const seed = createSeed(new Date()) as unknown as Record<string, { id: string }[]>
  const fromSeed: Record<string, { id: string }[] | undefined> = {
    leads: seed.leads,
    activities: seed.activities,
    tasks: seed.tasks,
    notes: seed.notes,
    transactions: seed.transactions,
    mind_maps: seed.mindMaps,
  }
  const rows: Row[] = (fromSeed[table] ?? []).map((d) => ({ id: d.id, data: d, updated_at: new Date().toISOString() }))
  write(table, rows)
  return rows
}
function write(table: string, rows: Row[]) {
  try {
    localStorage.setItem(KEY(table), JSON.stringify(rows))
  } catch {
    // cheio: segue em memória
  }
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private op: "select" | "upsert" | "insert" | "delete" = "select"
  private cols = "*"
  private payload: unknown
  private filters: [string, unknown][] = []
  private lim?: number
  private range_?: [number, number]
  private single = false
  constructor(private table: string) {}
  select(cols = "*") {
    if (this.op === "select") this.cols = cols
    return this
  }
  order() {
    return this
  }
  range(a: number, b: number) {
    this.range_ = [a, b]
    return this
  }
  limit(n: number) {
    this.lim = n
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push([col, v])
    return this
  }
  ilike(col: string, v: unknown) {
    return this.eq(col, v)
  }
  maybeSingle() {
    this.single = true
    return this
  }
  upsert(v: unknown) {
    this.op = "upsert"
    this.payload = v
    return this
  }
  insert(v: unknown) {
    this.op = "insert"
    this.payload = v
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  private exec(): { data: unknown; error: null } {
    if (this.table === "members") return { data: this.single ? MEMBER : [MEMBER], error: null }
    if (this.table === "events" || this.table === "ai_settings") return { data: this.single ? null : [], error: null }
    if (this.table === "finance_settings") {
      const rows = read(this.table)
      if (this.op === "upsert") {
        const v = this.payload as Row
        write(this.table, [{ ...v, updated_at: new Date().toISOString() }])
        return { data: null, error: null }
      }
      return { data: this.single ? (rows[0] ?? null) : rows, error: null }
    }
    let rows = read(this.table)
    if (this.op === "upsert" || this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[]
      const now = new Date().toISOString()
      for (const v of incoming) {
        const i = rows.findIndex((r) => r.id === v.id)
        const row = { ...v, updated_at: now }
        if (i >= 0) rows[i] = row
        else rows.push(row)
      }
      write(this.table, rows)
      return { data: null, error: null }
    }
    if (this.op === "delete") {
      rows = rows.filter((r) => !this.filters.every(([c, v]) => r[c] === v))
      write(this.table, rows)
      return { data: null, error: null }
    }
    let out = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v))
    if (this.range_) out = out.slice(this.range_[0], this.range_[1] + 1)
    if (this.lim !== undefined) out = out.slice(0, this.lim)
    const shaped = this.cols === "data" ? out.map((r) => ({ data: r.data })) : out
    return { data: this.single ? (shaped[0] ?? null) : shaped, error: null }
  }
  then<A, B>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.exec()).then(ok, bad)
  }
}

const channel = { on() { return channel }, subscribe() { return channel } }

export const sandboxClient = {
  from: (table: string) => new Query(table),
  auth: {
    getUser: async () => ({ data: { user: { id: "sandbox-user", email: MEMBER.email } }, error: null }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
  },
  channel: () => channel,
  removeChannel: () => {},
}

/** Apaga o banco de demonstração (volta aos dados de exemplo). */
export function resetSandbox() {
  Object.keys(localStorage).filter((k) => k.startsWith("sandbox:v1:")).forEach((k) => localStorage.removeItem(k))
}
