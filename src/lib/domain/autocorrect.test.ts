import { describe, expect, it } from "vitest"
import { correctText, correctWhileTyping, correctWord } from "./autocorrect"

describe("corretor automático", () => {
  it("acentos esquecidos, mantendo maiúsculas", () => {
    expect(correctWord("nao")).toBe("não")
    expect(correctWord("Voce")).toBe("Você")
    expect(correctWord("NAO")).toBe("NÃO")
    expect(correctWord("conteudo")).toBe("conteúdo")
  })

  it("finais -ção, -ções, -são", () => {
    expect(correctWord("acao")).toBe("ação")
    expect(correctWord("Divulgacao")).toBe("Divulgação")
    expect(correctWord("informacoes")).toBe("informações")
    expect(correctWord("decisao")).toBe("decisão")
    expect(correctWord("versoes")).toBe("versões")
  })

  it("não mexe no que é ambíguo ou já está certo", () => {
    for (const w of ["e", "esta", "da", "pais", "publico", "analise", "media", "falcao", "não", "ação", "Instagram"]) expect(correctWord(w)).toBe(w)
  })

  it("texto inteiro, sem estragar links e e-mails", () => {
    expect(correctText("Nao esquecer a acao de lancamento, voce ja viu?")).toBe("Não esquecer a ação de lançamento, você já viu?")
    expect(correctText("ver https://site.com/acao e nao@email.com")).toBe("ver https://site.com/acao e nao@email.com")
  })

  it("enquanto digita: corrige ao fechar a palavra e acerta o cursor", () => {
    expect(correctWhileTyping("nao", "nao ", 4)).toEqual({ text: "não ", caret: 4 })
    expect(correctWhileTyping("a acao", "a acao,", 7)).toEqual({ text: "a ação,", caret: 7 })
    // Ainda digitando a palavra: nada muda.
    expect(correctWhileTyping("na", "nao", 3)).toEqual({ text: "nao", caret: 3 })
    // Colou um trecho (mais de 1 letra): não corrige no meio.
    expect(correctWhileTyping("", "nao ", 4)).toEqual({ text: "nao ", caret: 4 })
    // Correção no meio do texto.
    expect(correctWhileTyping("x  y", "x nao y", 6).text).toBe("x nao y")
    expect(correctWhileTyping("x nao y", "x nao  y", 6)).toEqual({ text: "x não  y", caret: 6 })
  })
})
