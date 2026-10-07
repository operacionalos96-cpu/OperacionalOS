import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const { escolherAchados, foco } = require("./selecionar.js")

const area = { x: 230, y: 658, w: 980, h: 234 }

describe("worker de vídeo — escolha dos achados", () => {
  it("pega os 2 mais fortes e escreve frases factuais", () => {
    const r = escolherAchados([
      { kind: "sem_prova_social", prioridade: 50, area: null },
      { kind: "copyright_antigo", prioridade: 90, ano: 2019, area },
      { kind: "servicos_sem_explicacao", prioridade: 80, nome: "tratamentos", area },
    ])
    expect(r.map((x) => x.kind)).toEqual(["copyright_antigo", "servicos_sem_explicacao"])
    expect(r[0].text).toBe("o rodapé do site ainda mostra © 2019")
    expect(r[1].short).toBe("Tratamentos sem explicação")
    expect(r[0].print).toBe("pagina.png")
  })

  it("não repete o mesmo assunto (contato no fim + sem WhatsApp)", () => {
    const r = escolherAchados([
      { kind: "contato_no_fim", prioridade: 85, area },
      { kind: "sem_whatsapp", prioridade: 70, area },
      { kind: "sem_https", prioridade: 60, area },
    ])
    expect(r.map((x) => x.kind)).toEqual(["contato_no_fim", "sem_https"])
  })

  it("celular usa o print do celular; sem área usa o topo", () => {
    const r = escolherAchados([{ kind: "nao_responsivo", prioridade: 88, area: null }, { kind: "sem_prova_social", prioridade: 50, area: null }])
    expect(r.map((x) => [x.print, x.foco])).toEqual([["mobile.png", null], ["home.png", null]])
  })

  it("sem achados não inventa nada", () => {
    expect(escolherAchados([])).toEqual([])
    expect(escolherAchados([{ kind: "desconhecido", prioridade: 99, area }])).toEqual([])
  })

  it("destaque tem folga e não sai da página", () => {
    expect(foco({ x: 10, y: 5, w: 1430, h: 40 })).toEqual([0, 0, 1440, 200])
    expect(foco(null)).toBeNull()
  })
})
