import { describe, expect, it } from "vitest"
import { sanitize } from "./settings"

const A = "agt_" + "A".repeat(26)
describe("configuração local", () => {
  it("arquivo alterado à mão não sobe o nível acima do teto nem aceita lixo", () => {
    const s = sanitize({ theme: "roxo", levels: { [A]: 3, agt_ruim: 1 }, folders: { [A]: ["D:/Clientes", 42], "../x": ["C:/"] }, endpoints: { con_x: "https://a" } })
    expect(s.theme).toBe("sistema")
    expect(s.levels).toEqual({})
    expect(s.folders).toEqual({ [A]: ["D:/Clientes"] })
    expect(s.endpoints).toEqual({})
  })
  it("aceita os valores válidos", () => {
    expect(sanitize({ theme: "escuro", levels: { [A]: 1 } })).toMatchObject({ theme: "escuro", levels: { [A]: 1 } })
  })
})
