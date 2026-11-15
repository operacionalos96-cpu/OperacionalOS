import { describe, expect, it } from "vitest"
import { AVATAR_COLORS, AVATAR_EYES, AVATAR_STYLES, avatarEyes } from "@/lib/domain/dock"
import { FACE_OF, avatarSvg } from "./avatar-svg"

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

describe("avatar com rosto", () => {
  it("formato dos olhos: só os três conhecidos; letra e ícone antigos caem na cápsula", () => {
    expect(AVATAR_EYES.map((e) => e.id)).toEqual(["capsula", "ponto", "largo"])
    expect(avatarEyes("ponto")).toBe("ponto")
    for (const old of ["", "P", "lupa", "codigo", "barras", "<svg>"]) expect(avatarEyes(old)).toBe("capsula")
  })

  it("os nomes do banco não mudaram (sem migration): 3 estilos e 6 cores, sem laranja", () => {
    expect(AVATAR_STYLES.map((s) => s.id)).toEqual(["constelacao", "saturno", "halo"])
    expect(AVATAR_COLORS.map((c) => c.id)).toEqual(["grafite", "aco", "musgo", "areia", "vinho", "lilas"])
    for (const c of AVATAR_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("as luas contam o nível: uma por nível, nos três desenhos e no tamanho de lista", () => {
    for (const shape of ["astro", "modulo", "visor"] as const)
      for (const size of [16, 40, 150])
        for (const level of [0, 1, 2, 3]) expect(count(avatarSvg({ shape, level, size }, "t"), /class="moon"/g)).toBe(level)
  })

  it("o rosto conta o estado; o laranja só aparece em 'precisa de você'", () => {
    for (const [state, face] of Object.entries(FACE_OF)) {
      const svg = avatarSvg({ state, level: 1 }, "t")
      expect(svg).toContain(`data-face="${face}"`)
      expect(svg.includes("var(--hot)")).toBe(face === "voce")
      expect(count(svg, /class="eye"/g)).toBe(2)
    }
    expect(avatarSvg({ state: "estado_que_nao_existe" }, "t")).toContain('data-face="livre"')
  })

  it("nenhum texto de fora entra no desenho", () => {
    const svg = avatarSvg({ state: 'x"><script>alert(1)</script>', level: 1 }, "t")
    expect(svg).not.toContain("<script>")
  })
})
