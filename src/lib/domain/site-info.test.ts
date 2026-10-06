import { describe, expect, it } from "vitest"
import { bestPlace, buildSitePrompt, parseSite, parseSiteResult, placesInText } from "./site-info"

const HTML = `<!doctype html><html><head><title>Azul Serviços &#8211; Desentupidora 24h</title>
<meta name="description" content="Desentupimento de pias, ralos e esgoto com atendimento 24 horas.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Plumber","address":{"@type":"PostalAddress","addressLocality":"Santo André","addressRegion":"SP"}}</script>
<style>.x{color:red}</style><script>var a = "Rio de Janeiro - RJ"</script></head>
<body><header><a href="/contato">Fale conosco</a> <a href="https://outro.com/contato">fora</a> <a href="/servicos">Serviços</a></header>
<h1>Desentupidora em Santo André</h1><p>Atendemos todo o ABC.</p>
<footer><address>Rua das Flores, 123 - Centro, Santo André - SP, CEP 09010-000</address><p>Copyright - SP</p></footer></body></html>`

describe("leitura do site", () => {
  const p = parseSite(HTML, "https://azulservico.com.br/")
  it("pega título, descrição, tipo e endereço estruturado", () => {
    expect(p.title).toBe("Azul Serviços – Desentupidora 24h")
    expect(p.description).toContain("Desentupimento")
    expect(p.ldTypes).toContain("Plumber")
    expect(p.ldPlaces).toEqual([{ city: "Santo André", uf: "SP" }])
  })
  it("ignora script/estilo e acha a cidade no rodapé", () => {
    expect(p.text).not.toContain("color:red")
    expect(p.text).not.toContain("Rio de Janeiro")
    expect(p.places).toContainEqual({ city: "Santo André", uf: "SP" })
    expect(bestPlace([p])).toEqual({ city: "Santo André", uf: "SP" })
  })
  it("só segue links de contato do mesmo site, contato primeiro", () => {
    expect(p.contactLinks).toEqual(["https://azulservico.com.br/contato"])
  })
  it("formatos de endereço comuns", () => {
    expect(placesInText("Av. Paulista, 1000 - Bela Vista, São Paulo/SP")).toContainEqual({ city: "São Paulo", uf: "SP" })
    expect(placesInText("Estamos em São José dos Campos - SP")).toContainEqual({ city: "São José dos Campos", uf: "SP" })
    expect(placesInText("Rua X - SP")).toEqual([])
  })
})

describe("resposta da IA", () => {
  it("limpa e valida", () => {
    expect(parseSiteResult('```json\n{"segmento":"Empresas de Desentupimento.","cidade":"Santo André","uf":"sp","confianca":"alta","evidencia":"rodapé"}\n```')).toEqual({
      segment: "desentupimento",
      city: "Santo André",
      uf: "SP",
      confidence: "alta",
      evidence: "rodapé",
    })
    expect(parseSiteResult('{"segmento":null,"cidade":"null","uf":"XX"}')).toMatchObject({ segment: null, city: null, uf: null, confidence: "media" })
    expect(parseSiteResult("não é json")).toBeNull()
  })
  it("prompt leva o trecho útil e a pista do endereço", () => {
    const prompt = buildSitePrompt({ name: "Azul", url: "https://azulservico.com.br", hintSegment: "Desentupidora / serviços locais", pages: [parseSite(HTML, "https://azulservico.com.br/")] })
    expect(prompt).toContain("Santo André/SP")
    expect(prompt).toContain("Plumber")
    expect(prompt).toContain("CEP 09010-000")
  })
})
