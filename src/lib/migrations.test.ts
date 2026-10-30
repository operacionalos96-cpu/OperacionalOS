/**
 * Regras das migrations (supabase/migrations). Cada arquivo é uma mudança do banco,
 * aplicada uma vez e em ordem. Número repetido ou pulado = duas pessoas criaram
 * migrations ao mesmo tempo: combine a numeração antes de juntar o PR (COLABORACAO.md).
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const dir = join(process.cwd(), "supabase", "migrations")
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()

describe("migrations", () => {
  it("seguem o padrão NNNN_nome_em_minusculas.sql", () => {
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/)
  })

  it("são numeradas em sequência, sem repetir nem pular", () => {
    const numbers = files.map((f) => Number(f.slice(0, 4)))
    expect(numbers).toEqual(numbers.map((_, i) => i + 1))
  })

  it("não guardam segredos", () => {
    for (const f of files) {
      const sql = readFileSync(join(dir, f), "utf8")
      expect(sql, f).not.toMatch(/sb_secret_[A-Za-z0-9]|service_role_key\s*=|eyJhbGciOi/)
    }
  })
})
