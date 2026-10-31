import { describe, expect, it } from "vitest"
import { BASE_PAGES, canSee, defaultPages, pageOf, visiblePages } from "./access-pages"
import { DEFAULT_AREAS } from "./areas"

const people = { ceoId: undefined, founderIds: ["u1", "u2"] }

describe("abas por pessoa", () => {
  it("owner vê tudo, sempre", () => {
    expect(visiblePages("u2", "owner", { areas: DEFAULT_AREAS, people, overrides: { u2: ["/"] } })).toBe("all")
  })

  it("padrão: base + as abas das áreas de que a pessoa é dona ou apoio", () => {
    // Gabriel (u1): conteúdo e roteiros (dono) + comercial e estratégia (apoio).
    const gabriel = defaultPages("u1", "operator", DEFAULT_AREAS, people)
    expect(gabriel).toEqual(expect.arrayContaining([...BASE_PAGES, "/conteudos", "/mapas", "/prospeccao", "/metas"]))
    expect(gabriel).not.toContain("/financeiro")
    expect(gabriel).not.toContain("/configuracoes")
    // Quem não é de nenhuma área vê só a base.
    expect(defaultPages("u9", "operator", DEFAULT_AREAS, people).sort()).toEqual([...BASE_PAGES].sort())
  })

  it("o ajuste do owner vale mais que o padrão; a Início sempre aparece; aba de nível só com nível", () => {
    const v = visiblePages("u1", "operator", { areas: DEFAULT_AREAS, people, overrides: { u1: ["/conteudos", "/cofre"] } })
    expect(canSee(v, "/conteudos")).toBe(true)
    expect(canSee(v, "/")).toBe(true)
    expect(canSee(v, "/prospeccao")).toBe(false)
    expect(canSee(v, "/cofre")).toBe(false)
    expect(canSee(visiblePages("u3", "admin", { areas: DEFAULT_AREAS, people }), "/configuracoes")).toBe(true)
  })

  it("cada caminho pertence a uma aba", () => {
    const hrefs = ["/", "/equipe", "/conteudos"]
    expect(pageOf("/equipe/u1", hrefs)).toBe("/equipe")
    expect(pageOf("/", hrefs)).toBe("/")
    expect(pageOf("/login", hrefs)).toBeUndefined()
  })
})
