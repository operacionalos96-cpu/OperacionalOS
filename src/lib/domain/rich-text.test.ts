import { describe, expect, it } from "vitest"
import { plainText, toNoteHtml } from "./rich-text"

describe("texto formatado das notas", () => {
  it("nota antiga (texto puro) vira parágrafos e lista, escapando < >", () => {
    expect(toNoteHtml("Ideias\n- uma <b>\n- duas\n\nfim")).toBe("<p>Ideias</p><ul><li><p>uma &lt;b&gt;</p></li><li><p>duas</p></li></ul><p></p><p>fim</p>")
    expect(toNoteHtml("  ")).toBe("")
  })
  it("HTML do editor passa direto", () => {
    expect(toNoteHtml("<p><strong>oi</strong></p>")).toBe("<p><strong>oi</strong></p>")
  })
  it("prévia em texto puro, linha por bloco", () => {
    expect(plainText("<h2>Plano</h2><p>Ligar &amp; enviar <em>proposta</em></p><ul><li><p>a</p></li></ul>")).toBe("Plano\nLigar & enviar proposta\na")
    expect(plainText("texto antigo")).toBe("texto antigo")
  })
})
