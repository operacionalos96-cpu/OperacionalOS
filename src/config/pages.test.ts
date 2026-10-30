/**
 * Travas para o app continuar explicado e sem informação duplicada (ADR 0007):
 * - toda página do app tem propósito e "como usar" no registro (src/config/pages.ts);
 * - nenhuma tela escreve explicação de número por conta própria (vem de metrics.ts).
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { PAGES, pageFor } from "./pages"

const APP = join(process.cwd(), "src", "app")
/** Telas fora do menu: login, senha, autenticação e detalhes de um item. */
const OUTSIDE_MENU = /^(login|redefinir-senha|auth|api)(\/|$)|\[[^\]]+\]|^equipe\/cofre$/

function pageRoutes(dir = APP): string[] {
  const routes: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) routes.push(...pageRoutes(full))
    else if (name === "page.tsx") routes.push(relative(APP, dir).split(sep).join("/"))
  }
  return routes
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? sourceFiles(full) : name.endsWith(".tsx") ? [full] : []
  })
}

describe("cada página se explica", () => {
  it("toda página do app está no registro (src/config/pages.ts)", () => {
    const missing = pageRoutes()
      .filter((r) => !OUTSIDE_MENU.test(r))
      .map((r) => `/${r}`.replace(/\/$/, "") || "/")
      .filter((href) => !PAGES.some((p) => p.href === href))
    expect(missing, "adicione a página em src/config/pages.ts").toEqual([])
  })

  it("toda página tem um propósito em uma frase e de 2 a 4 passos curtos", () => {
    for (const p of PAGES) {
      expect(p.purpose.length, p.href).toBeGreaterThan(20)
      expect(p.purpose.length, `${p.href}: propósito longo demais`).toBeLessThanOrEqual(110)
      expect(p.howTo.length, p.href).toBeGreaterThanOrEqual(2)
      expect(p.howTo.length, p.href).toBeLessThanOrEqual(4)
      for (const step of p.howTo) expect(step.length, `${p.href}: passo longo demais`).toBeLessThanOrEqual(120)
    }
  })

  it("cada endereço tem um dono só (nada repetido)", () => {
    const hrefs = PAGES.map((p) => p.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(pageFor("/pipeline/abc")?.href).toBe("/pipeline")
    expect(pageFor("/")?.href).toBe("/")
  })
})

describe("uma fonte para cada informação", () => {
  it("nenhuma tela escreve a explicação de um número por conta própria (use metric=…)", () => {
    const offenders = [...sourceFiles(APP), ...sourceFiles(join(process.cwd(), "src", "components"))]
      .filter((f) => /<StatCard[^>]*\binfo="/.test(readFileSync(f, "utf8").replace(/\n\s*/g, " ")))
      .map((f) => relative(process.cwd(), f))
    expect(offenders).toEqual([])
  })

  it("o título das páginas vem do registro (PageHeader page=…), não é digitado de novo", () => {
    const offenders = sourceFiles(APP)
      .filter((f) => !/\[[^\]]+\]/.test(f))
      .filter((f) => /<PageHeader\s+title="/.test(readFileSync(f, "utf8")))
      .map((f) => relative(process.cwd(), f))
    expect(offenders).toEqual([])
  })
})
