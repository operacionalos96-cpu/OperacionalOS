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
