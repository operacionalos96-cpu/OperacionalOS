import { describe, expect, it } from "vitest"
import { convertMarkdownInHtml, looksLikeMarkdown, markdownToHtml, plainText, toNoteHtml } from "./rich-text"

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

describe("Markdown colado", () => {
  const md = "# 🔐 SENHAS\n## CONTAS\n### [SERVIÇO]\n- **Site/App:** x\n- [ ] trocar senha\n1. um\n\n---\n> obs <b>\n```\nconst a = 1\n```"
  it("reconhece Markdown e não confunde texto comum", () => {
    expect(looksLikeMarkdown(md)).toBe(true)
    expect(looksLikeMarkdown("Ligar para o cliente amanhã")).toBe(false)
  })
  it("vira título, lista, checklist, linha, citação e código (escapando HTML)", () => {
    expect(markdownToHtml(md)).toBe(
      '<h2>🔐 SENHAS</h2><h2>CONTAS</h2><h3>[SERVIÇO]</h3><ul><li><p><strong>Site/App:</strong> x</p></li></ul>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>trocar senha</p></li></ul><ol><li><p>um</p></li></ol>' +
        "<p></p><hr><blockquote><p>obs &lt;b&gt;</p></blockquote><pre><code>const a = 1</code></pre>",
    )
  })
  it("conserta nota que já ficou com Markdown cru", () => {
    const html = "<p>## CONTAS</p><ul><li><p>**Senha:** abc</p></li></ul><p>---</p><p>*ok* e [site](https://a.com)</p>"
    expect(convertMarkdownInHtml(html)).toBe('<h2>CONTAS</h2><ul><li><p><strong>Senha:</strong> abc</p></li></ul><hr><p><em>ok</em> e <a href="https://a.com">site</a></p>')
  })
})
