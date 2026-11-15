import { describe, expect, it } from "vitest"
import { BOLINHA_LADO, cantoPadrao, deveMostrarBolinha, foiArraste, posicaoBolinha, textoBolinha, visualDoMotor } from "./bolinha-regras"

const principal = { x: 0, y: 0, width: 1920, height: 1040 } // 1080 menos a barra de tarefas
const segundo = { x: 1920, y: -200, width: 1280, height: 984 }

describe("posição da bolinha", () => {
  it("sem posição salva vai ao canto inferior direito do monitor principal", () => {
    expect(posicaoBolinha(null, [principal], principal)).toEqual({ x: 1920 - BOLINHA_LADO - 24, y: 1040 - BOLINHA_LADO - 24 })
    expect(cantoPadrao(principal)).toEqual(posicaoBolinha(undefined, [principal], principal))
  })
  it("posição salva num monitor que ainda existe é mantida", () => {
    expect(posicaoBolinha({ x: 400, y: 300 }, [principal, segundo], principal)).toEqual({ x: 400, y: 300 })
    expect(posicaoBolinha({ x: 2500, y: -100 }, [principal, segundo], principal)).toEqual({ x: 2500, y: -100 })
  })
  it("meio para fora da borda é empurrada para dentro da área de trabalho", () => {
    expect(posicaoBolinha({ x: 1880, y: 1000 }, [principal], principal)).toEqual({ x: 1920 - BOLINHA_LADO, y: 1040 - BOLINHA_LADO })
    expect(posicaoBolinha({ x: -20, y: -10 }, [principal], principal)).toEqual({ x: 0, y: 0 })
  })
  it("monitor que sumiu: volta ao canto do principal", () => {
    expect(posicaoBolinha({ x: 2500, y: -100 }, [principal], principal)).toEqual(cantoPadrao(principal))
  })
  it("valor estragado no arquivo cai no canto", () => {
    expect(posicaoBolinha({ x: Number.NaN, y: 10 }, [principal], principal)).toEqual(cantoPadrao(principal))
  })
})

describe("quando mostrar", () => {
  const base = { ligada: true, janelaExiste: true, minimizada: false, visivel: true, saindo: false }
  it("janela aberta na tela: não mostra", () => expect(deveMostrarBolinha(base)).toBe(false))
  it("minimizada ou escondida na bandeja: mostra", () => {
    expect(deveMostrarBolinha({ ...base, minimizada: true })).toBe(true)
    expect(deveMostrarBolinha({ ...base, visivel: false })).toBe(true)
  })
  it("opção desligada, sem janela ou saindo: nunca mostra", () => {
    expect(deveMostrarBolinha({ ...base, minimizada: true, ligada: false })).toBe(false)
    expect(deveMostrarBolinha({ ...base, minimizada: true, janelaExiste: false })).toBe(false)
    expect(deveMostrarBolinha({ ...base, minimizada: true, saindo: true })).toBe(false)
  })
})

describe("clique, arraste e estado", () => {
  it("tremida pequena ainda é clique", () => {
    expect(foiArraste({ x: 10, y: 10 }, { x: 13, y: 8 })).toBe(false)
    expect(foiArraste({ x: 10, y: 10 }, { x: 20, y: 10 })).toBe(true)
  })
  it("estado do motor vira movimento", () => {
    expect(visualDoMotor("parado")).toBe("quieta")
    expect(visualDoMotor(undefined)).toBe("quieta")
    expect(visualDoMotor("esperando")).toBe("lenta")
    expect(visualDoMotor("trabalhando")).toBe("girando")
    expect(visualDoMotor("erro")).toBe("alerta")
    expect(visualDoMotor("desligado")).toBe("alerta")
    expect(textoBolinha("girando")).toContain("trabalhando")
  })
})
