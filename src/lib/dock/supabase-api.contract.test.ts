/**
 * Contrato entre a tela do Dock e o banco: sem um Supabase de verdade no teste, confere no Postgres
 * de teste (todas as migrations reais) que TODA função chamada por supabase-api.ts existe com os
 * mesmos nomes de parâmetro, que a pessoa logada pode chamá-la, e que TODA coluna lida existe.
 * Um erro de digitação aqui viraria "não deu certo" em produção.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "@/lib/server/test-db"

const SRC = readFileSync(join(process.cwd(), "src", "lib", "dock", "supabase-api.ts"), "utf8")
let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
}, 120_000)

/** rpc("nome", { p_a: …, p_b: … }) → nome e chaves (só o primeiro nível do objeto). */
function rpcCalls() {
  const out: { fn: string; args: string[] }[] = []
  const re = /rpc(?:<[^>]*>)?\("([a-z_]+)",\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(SRC))) {
    let i = re.lastIndex
    let depth = 1
    let body = ""
    while (depth && i < SRC.length) {
      const ch = SRC[i++]
      if (ch === "{" || ch === "(" || ch === "[") depth++
      if (ch === "}" || ch === ")" || ch === "]") depth--
      if (depth === 1 || (depth === 0 && ch !== "}")) body += ch
      else if (depth > 1) body += " "
    }
    out.push({ fn: m[1], args: [...body.matchAll(/(p_[a-z_]+)\s*:/g)].map((x) => x[1]) })
  }
  return out
}

/** from("tabela").select("a, b, c") → tabela e colunas. */
function selects() {
  return [...SRC.matchAll(/from\("([a-z_]+)"\)\.select\("([^"]+)"\)/g)].map((m) => ({ table: m[1], cols: m[2] === "*" ? [] : m[2].split(",").map((c) => c.trim()) }))
}

describe("supabase-api.ts × banco", () => {
  it("encontra as chamadas no código (o teste não está vazio)", () => {
    expect(rpcCalls().length).toBeGreaterThan(25)
    expect(selects().length).toBeGreaterThan(15)
  })

  it("toda função existe com esses nomes de parâmetro e a pessoa logada pode chamá-la", async () => {
    const problems: string[] = []
    for (const { fn, args } of rpcCalls()) {
      const found = await db.sql<{ names: string[] | null; grant: boolean }>(
        `select p.proargnames as names, has_function_privilege('authenticated', p.oid, 'execute') as grant
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
        [fn],
      )
      if (!found.length) {
        problems.push(`${fn}: não existe`)
        continue
      }
      const ok = found.some((f) => args.every((a) => (f.names ?? []).includes(a)))
      if (!ok) problems.push(`${fn}(${args.join(", ")}): parâmetro que não existe; o banco tem ${found.map((f) => (f.names ?? []).join(", ")).join(" | ")}`)
      if (!found.some((f) => f.grant)) problems.push(`${fn}: a pessoa logada não pode chamar`)
    }
    expect(problems).toEqual([])
  })

  it("toda coluna lida existe, e a pessoa logada pode ler a tabela", async () => {
    const problems: string[] = []
    for (const { table, cols } of selects()) {
      const have = (await db.sql<{ c: string }>(`select column_name c from information_schema.columns where table_schema = 'public' and table_name = $1`, [table])).map((r) => r.c)
      if (!have.length) problems.push(`${table}: tabela não existe`)
      for (const c of cols) if (!have.includes(c)) problems.push(`${table}.${c}: coluna não existe`)
      const can = await db.sql<{ ok: boolean }>(`select has_table_privilege('authenticated', $1, 'select') ok`, [`public.${table}`])
      if (can[0]?.ok) continue
      // tabela com grant por coluna (ex.: workers, que esconde o hash do token): cada coluna lida precisa do grant
      if (!cols.length) problems.push(`${table}: a pessoa logada não pode ler`)
      for (const c of cols) {
        const col = await db.sql<{ ok: boolean }>(`select has_column_privilege('authenticated', $1, $2, 'select') ok`, [`public.${table}`, c])
        if (!col[0]?.ok) problems.push(`${table}.${c}: a pessoa logada não pode ler`)
      }
    }
    expect(problems).toEqual([])
  })
})
