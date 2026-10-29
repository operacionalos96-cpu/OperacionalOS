import { describe, expect, it } from "vitest"
import { parseMapFile } from "./map-file"

const valid = {
  format: "operacionalos-map",
  version: 1,
  title: "Planejamento",
  nodes: [
    { id: "a", label: "Raiz", x: 0, y: 0 },
    { id: "b", label: "Imagem", x: 200, y: 20, type: "image", src: "anexos/map-image/m/a.png" },
  ],
  edges: [{ id: "e1", source: "a", target: "b" }],
}

describe("arquivo JSON de mapa", () => {
  it("aceita e preserva nós, imagens e conexões", () => {
    expect(parseMapFile(valid)).toMatchObject({ title: "Planejamento", nodes: valid.nodes, edges: valid.edges })
  })

  it("recusa arquivo sem listas", () => {
    expect(() => parseMapFile({ nodes: [] })).toThrow("listas de nós e conexões")
  })

  it("recusa formato ou versão incompatível", () => {
    expect(() => parseMapFile({ ...valid, format: "outro-app" })).toThrow("Formato de arquivo")
    expect(() => parseMapFile({ ...valid, version: 99 })).toThrow("Versão de arquivo")
  })

  it("recusa id de nó duplicado", () => {
    expect(() => parseMapFile({ ...valid, nodes: [valid.nodes[0], valid.nodes[0]] })).toThrow("ids de nós duplicados")
  })

  it("recusa conexão que aponta para nó inexistente", () => {
    expect(() => parseMapFile({ ...valid, edges: [{ id: "e1", source: "a", target: "missing" }] })).toThrow("nó inexistente")
  })

  it("recusa mapas grandes demais", () => {
    expect(() => parseMapFile({ nodes: Array(5001).fill(valid.nodes[0]), edges: [] })).toThrow("limite")
  })
})
