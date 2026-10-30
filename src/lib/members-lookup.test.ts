/**
 * Todo membro enxerga a equipe inteira (migration 0017). Então, para achar "quem sou eu",
 * a busca em `members` PRECISA filtrar pelo e-mail — sem isso vêm várias linhas, o maybeSingle()
 * falha e o login recusa todo mundo (aconteceu em 30/10/2026).
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const f = join(dir, n)
    return statSync(f).isDirectory() ? files(f) : /\.(ts|tsx)$/.test(n) && !n.includes(".test.") ? [f] : []
  })
}

describe("busca do membro logado", () => {
  it("toda busca de UM membro em `members` filtra pelo e-mail", () => {
    const offenders: string[] = []
    for (const f of files(join(process.cwd(), "src"))) {
      const src = readFileSync(f, "utf8").replace(/\s+/g, " ")
      for (const m of src.matchAll(/from\("members"\)(.{0,200}?)\.maybeSingle\(\)/g)) {
        if (!/\.(eq|ilike)\("email"/.test(m[1])) offenders.push(relative(process.cwd(), f))
      }
    }
    expect(offenders).toEqual([])
  })
})
