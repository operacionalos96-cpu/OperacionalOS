import { describe, expect, it } from "vitest"
import { leadMatches } from "./contact"


describe("busca de lead (inclui WhatsApp)", () => {
  const lead = { name: "Clínica Sorriso", company: "Sorriso LTDA", contact: "(11) 99876-5432" }
  it("acha pelo número em qualquer formato", () => {
    for (const q of ["99876-5432", "11998765432", "+55 11 99876-5432", "5511998765432", "9876"]) expect(leadMatches(lead, q)).toBe(true)
  })
  it("não confunde número diferente nem texto curto", () => {
    expect(leadMatches(lead, "11 91111-1111")).toBe(false)
    expect(leadMatches(lead, "12")).toBe(false)
    expect(leadMatches({ name: "Sem contato" }, "9987")).toBe(false)
  })
  it("continua achando por nome e empresa", () => {
    expect(leadMatches(lead, "sorriso")).toBe(true)
    expect(leadMatches(lead, "ltda")).toBe(true)
  })
})

describe("abrir conversa no WhatsApp", async () => {
  const { isLikelyMobile, whatsappNumber, whatsappUrl } = await import("./contact")
  it("vai direto para a conversa, com a mensagem pronta, no destino escolhido", () => {
    expect(whatsappUrl("(11) 97739-0519", "Bom dia, tudo bem?", "web")).toBe("https://web.whatsapp.com/send?phone=5511977390519&text=Bom%20dia%2C%20tudo%20bem%3F")
    expect(whatsappUrl("(11) 97739-0519", "Oi", "app")).toBe("whatsapp://send?phone=5511977390519&text=Oi")
    expect(whatsappUrl("+55 11 97739-0519", "", "celular")).toBe("https://wa.me/5511977390519")
    expect(whatsappUrl("site.com.br", "x")).toBeNull()
  })
  it("diferencia celular de fixo", () => {
    expect(isLikelyMobile(whatsappNumber("(11) 97739-0519")!)).toBe(true)
    expect(isLikelyMobile(whatsappNumber("(11) 5564-8966")!)).toBe(false)
  })
})

describe("por que não abre o WhatsApp", async () => {
  const { whatsappProblem } = await import("./contact")
  it("explica cada caso", () => {
    expect(whatsappProblem("(11) 97739-0519")).toBeNull()
    expect(whatsappProblem(undefined)).toBe("Sem telefone cadastrado")
    expect(whatsappProblem("contato@empresa.com.br")).toBe("Contato é um e-mail, não um telefone")
    expect(whatsappProblem("https://empresa.com.br")).toBe("Contato é um link, não um telefone")
    expect(whatsappProblem("9773-0519")).toBe("Número incompleto (8 dígitos — falta DDD?)")
    expect(whatsappProblem("WhatsApp no site")).toBe('Contato não é número ("WhatsApp no site")')
  })
})
