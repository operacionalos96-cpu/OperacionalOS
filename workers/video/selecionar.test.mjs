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
    expect(r[1].text).toContain("x.wixsite.com")
    expect(r.every((x) => x.impacto && x.short && x.text)).toBe(true)
  })

  it("não repete assunto: contato escondido, sem WhatsApp e sem chamada no topo contam como um", () => {
    const r = escolherAchados([
      { kind: "contato_no_fim", prioridade: 82, area },
      { kind: "sem_cta_topo", prioridade: 80, area },
      { kind: "sem_whatsapp", prioridade: 78, area },
      { kind: "sem_localizacao", prioridade: 76, area: null },
      { kind: "sem_prova_social", prioridade: 68, area: null },
    ])
    expect(r.map((x) => x.kind)).toEqual(["contato_no_fim", "sem_localizacao", "sem_prova_social"])
  })

  it("ponto de técnico não vai para o vídeo: Google, palavras e rodapé ficam de fora", () => {
    for (const kind of ["titulo_generico", "titulo_so_nome", "sem_descricao", "pouco_conteudo", "copyright_antigo"]) expect(frase({ kind, titulo: "Home", palavras: 200, ano: 2021 })).toBeNull()
    // Sem 3 pontos de dono, não há vídeo (antes, "título no Google" e "poucas palavras" completavam os 3).
    const r = escolherAchados([
      { kind: "sem_prova_social", prioridade: 68, area: null },
      { kind: "titulo_so_nome", prioridade: 70, titulo: "FATD", area: null },
      { kind: "pouco_conteudo", prioridade: 74, palavras: 213, area: null },
    ])
    expect(r.map((x) => x.kind)).toEqual(["sem_prova_social"])
  })

  it("frases cabem nos limites do vídeo e falam do cliente, não do site", () => {
    const kinds = ["nao_responsivo", "subdominio_gratuito", "topo_sem_proposta", "servicos_sem_explicacao", "contato_no_fim", "sem_cta_topo", "sem_whatsapp", "sem_localizacao", "sem_autoridade", "sem_prova_social", "lento", "sem_https"]
    for (const kind of kinds) {
      const f = frase({ kind, host: "empresa-exemplo-longa.wixsite.com", titulo: "Bem-vindo à Empresa", nome: "tratamentos", segundos: 9 })
      expect(f, kind).not.toBeNull()
      expect(f.text.length, kind).toBeLessThanOrEqual(220)
      expect(f.short.length, kind).toBeLessThanOrEqual(48)
      expect(f.impacto.length, kind).toBeLessThanOrEqual(180)
      expect(`${f.short} ${f.impacto}`, kind).not.toMatch(/google|seo|h1|meta|palavras/i)
    }
  })

  it("o ano do rodapé não é argumento", () => {
    expect(frase({ kind: "copyright_antigo", ano: 2021 })).toBeNull()
  })

  it("celular usa o print do celular; sem área usa o topo; nada inventado", () => {
    const r = escolherAchados([{ kind: "nao_responsivo", prioridade: 95, area: null }, { kind: "sem_autoridade", prioridade: 70, area: null }])
    expect(r.map((x) => [x.print, x.foco])).toEqual([["mobile.png", null], ["home.png", null]])
    expect(escolherAchados([])).toEqual([])
  })

  it("destaque tem folga e não sai da página", () => {
    expect(foco({ x: 10, y: 5, w: 1430, h: 40 })).toEqual([0, 0, 1440, 200])
    expect(foco(null)).toBeNull()
  })
})
