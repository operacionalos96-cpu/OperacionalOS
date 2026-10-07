import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const { escolherAchados, frase, foco, MINIMO } = require("./selecionar.js")

const area = { x: 230, y: 658, w: 980, h: 234 }

describe("worker de vídeo — 3 pontos fortes", () => {
  it("sempre 3, os mais fortes primeiro, cada um com impacto", () => {
    const r = escolherAchados([
      { kind: "sem_prova_social", prioridade: 68, area: null },
      { kind: "nao_responsivo", prioridade: 95, area: null },
      { kind: "subdominio_gratuito", prioridade: 92, host: "x.wixsite.com", area: null },
      { kind: "servicos_sem_explicacao", prioridade: 85, nome: "tratamentos", area },
    ])
    expect(MINIMO).toBe(3)
    expect(r.map((x) => x.kind)).toEqual(["nao_responsivo", "subdominio_gratuito", "servicos_sem_explicacao"])
    expect(r[1].text).toBe("o endereço do site é um subdomínio gratuito (x.wixsite.com)")
    expect(r.every((x) => x.impacto && x.short && x.text)).toBe(true)
  })

  it("não repete assunto: contato escondido, sem WhatsApp e sem chamada no topo contam como um", () => {
    const r = escolherAchados([
      { kind: "contato_no_fim", prioridade: 82, area },
      { kind: "sem_cta_topo", prioridade: 80, area },
      { kind: "sem_whatsapp", prioridade: 78, area },
      { kind: "sem_localizacao", prioridade: 76, area: null },
      { kind: "pouco_conteudo", prioridade: 74, palavras: 213, area: null },
    ])
    expect(r.map((x) => x.kind)).toEqual(["contato_no_fim", "sem_localizacao", "pouco_conteudo"])
    expect(r[2].text).toBe("a página inteira tem cerca de 210 palavras para apresentar a empresa")
  })

  it("o ano do rodapé não é argumento", () => {
    expect(frase({ kind: "copyright_antigo", ano: 2021 })).toBeNull()
  })

  it("celular usa o print do celular; sem área usa o topo; nada inventado", () => {
    const r = escolherAchados([{ kind: "nao_responsivo", prioridade: 95, area: null }, { kind: "titulo_generico", prioridade: 70, titulo: "Home", area: null }])
    expect(r.map((x) => [x.print, x.foco])).toEqual([["mobile.png", null], ["home.png", null]])
    expect(escolherAchados([])).toEqual([])
  })

  it("destaque tem folga e não sai da página", () => {
    expect(foco({ x: 10, y: 5, w: 1430, h: 40 })).toEqual([0, 0, 1440, 200])
    expect(foco(null)).toBeNull()
  })
})
