import { describe, expect, it } from "vitest"
import { drawingFromStroke, gridGap, levelsInSet, moveLayer, pathBox, resizeByHierarchy, roundScale, scaleForZoom, scaleSet, simplify, visualLevels, zOf } from "./canvas"

describe("zoom infinito", () => {
  it("balão nasce do tamanho da tela: aproximou 10x, nasce 10x menor", () => {
    expect(scaleForZoom(1)).toBeUndefined()
    expect(scaleForZoom(1.3)).toBeUndefined()
    expect(scaleForZoom(10)).toBe(0.1)
    expect(scaleForZoom(0.25)).toBe(4)
    expect(scaleForZoom(3)).toBe(0.333)
  })

  it("ampliação perto de 1 não é gravada", () => {
    expect(roundScale(1.01)).toBeUndefined()
    expect(roundScale(0.5)).toBe(0.5)
    expect(roundScale(0)).toBeUndefined()
    expect(roundScale(NaN)).toBeUndefined()
  })

  it("grade de pontos fica sempre legível na tela, em qualquer zoom", () => {
    for (const zoom of [0.002, 0.03, 0.4, 1, 7, 90, 500]) {
      const onScreen = gridGap(zoom) * zoom
      expect(onScreen).toBeGreaterThanOrEqual(16)
      expect(onScreen).toBeLessThanOrEqual(64)
    }
  })
})

describe("ampliar um conjunto", () => {
  const items = [
    { id: "a", x: 0, y: 0, w: 100, h: 40 },
    { id: "b", x: 200, y: 60, w: 100, h: 40, scale: 0.5, width: 100, height: 40 },
  ]

  it("cresce em volta do centro e leva junto tamanho fixo e ampliação", () => {
    const [a, b] = scaleSet(items, 2)
    // centro do conjunto: (150, 50)
    expect(a).toMatchObject({ x: -150, y: -50, scale: 2 })
    expect(b).toMatchObject({ x: 250, y: 70, scale: undefined, width: 200, height: 80 })
  })

  it("fator inválido não faz nada", () => {
    expect(scaleSet(items, 0)).toEqual([])
    expect(scaleSet([], 2)).toEqual([])
  })
})

describe("tamanho pela hierarquia", () => {
  const edges = [
    { source: "r", target: "a" },
    { source: "a", target: "b" },
    { source: "r", target: "c", kind: "relacao" as const },
    { source: "fora", target: "r" },
  ]

  it("profundidade só dentro do conjunto; relação não conta como filho", () => {
    const l = levelsInSet(["r", "a", "b", "c"], edges)
    expect(l.get("r")).toMatchObject({ root: "r", depth: 0 })
    expect(l.get("b")).toMatchObject({ root: "r", depth: 2, parent: "a" })
    expect(l.get("c")).toMatchObject({ root: "c", depth: 0 })
  })

  it("ciclo não trava", () => {
    const l = levelsInSet(["x", "y"], [
      { source: "x", target: "y" },
      { source: "y", target: "x" },
    ])
    expect(l.size).toBe(2)
  })

  it("a IA sugere, a hierarquia manda: filho sempre 1 ou 2 níveis abaixo do pai", () => {
    const l = levelsInSet(["r", "a", "b"], edges)
    expect(visualLevels(l)).toEqual(new Map([["r", 1], ["a", 2], ["b", 3]]))
    // IA quis o filho do tamanho do pai (1) e o neto 9 níveis abaixo: corrigido.
    expect(visualLevels(l, new Map([["a", 1], ["b", 9]]))).toEqual(new Map([["r", 1], ["a", 2], ["b", 4]]))
  })

  it("raiz mantém o tamanho, cada nível 20% menor, centro no lugar", () => {
    const out = resizeByHierarchy(
      [
        { id: "r", x: 0, y: 0, w: 200, h: 50, scale: 2 },
        { id: "a", x: 300, y: 0, w: 100, h: 40 },
      ],
      edges,
    )
    expect(out[0]).toMatchObject({ x: 0, y: 0, scale: 2 })
    expect(out[1].scale).toBe(1.6)
    // centro (350, 20) continua no mesmo lugar: 100*1.6 = 160 de largura
    expect(out[1].x).toBe(270)
    expect(out[1].y).toBe(-12)
  })
})

describe("desenho à mão", () => {
  it("tira pontos em linha reta e mantém as curvas", () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 }))
    expect(simplify(line, 1)).toEqual([{ x: 0, y: 0 }, { x: 49, y: 0 }])
    const corner = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    expect(simplify(corner, 1)).toHaveLength(3)
  })

  it("traço vira item leve: posição no mapa, pontos em pixels da tela", () => {
    const d = drawingFromStroke([{ x: 100, y: 100 }, { x: 101, y: 100.5 }, { x: 102, y: 102 }], 10, 4)!
    expect(d.scale).toBe(0.1)
    expect(d.x).toBeCloseTo(99.8)
    expect(d.path.every((v) => Number.isInteger(v))).toBe(true)
    expect(pathBox(d.path, 4).width).toBeGreaterThanOrEqual(20)
    expect(drawingFromStroke([{ x: 0, y: 0 }], 1)).toBeNull()
  })
})

describe("camadas", () => {
  const all = [
    { id: "area", type: "group" as const },
    { id: "txt", type: "text" as const },
    { id: "b1" },
    { id: "b2", z: 3 },
  ]

  it("padrão: grupo atrás, texto/desenho no fundo, balão na frente", () => {
    expect(all.map(zOf)).toEqual([-2, -1, 0, 3])
  })

  it("frente, trás, avançar e recuar", () => {
    expect(moveLayer(all, new Set(["txt"]), "frente").get("txt")).toBe(4)
    expect(moveLayer(all, new Set(["b2"]), "tras").get("b2")).toBe(-3)
    expect(moveLayer(all, new Set(["txt"]), "avancar").get("txt")).toBe(0)
    expect(moveLayer(all, new Set(["b1"]), "recuar").get("b1")).toBe(-1)
    expect(moveLayer(all, new Set(["b1"]), "recuar").has("b2")).toBe(false)
  })
})
