import { describe, expect, it } from "vitest"
import { dddOf, regionOf, segmentPhrase } from "./lead-context"

const seg = (company: string, segment?: string) => segmentPhrase({ name: "Azul Serviços", company, segment })

describe("segmento para a mensagem", () => {
  it("leads antigos: o segmento estava no campo empresa", () => {
    expect(seg("Contabilidade")).toBe("contabilidade")
    expect(seg("Materiais de construção")).toBe("materiais de construção")
    expect(seg("Desentupidora / serviços locais")).toBe("desentupimento")
    expect(seg("Clínica / saúde mental")).toBe("saúde mental")
    expect(seg("Automotivo")).toBe("serviços automotivos")
    expect(seg("Psicologia / terapias")).toBe("psicologia")
    expect(seg("Saúde/terapias")).toBe("saúde")
    expect(seg("Cosméticos/beleza")).toBe("cosméticos")
  })
  it("campo segmento vence; empresa igual ao nome não é segmento", () => {
    expect(seg("Contabilidade", "Odontologia")).toBe("odontologia")
    expect(segmentPhrase({ name: "Costa Lion", company: "Costa Lion" })).toBe("")
  })
})

describe("região para a mensagem", () => {
  it("pelo DDD do telefone, em qualquer formato", () => {
    expect(regionOf({ contact: "(11) 97739-0519" })).toBe("São Paulo")
    expect(regionOf({ contact: "+55 15 3333-4444" })).toBe("Sorocaba e região")
    expect(regionOf({ contact: "5521988887777" })).toBe("Rio de Janeiro")
    expect(dddOf("contato@empresa.com")).toBeNull()
    expect(regionOf({ contact: "" })).toBe("")
  })
  it("cidade preenchida vence o DDD", () => {
    expect(regionOf({ city: "Santo André", contact: "(11) 97739-0519" })).toBe("Santo André")
  })
})

describe("informação lida no site", () => {
  const siteInfo = { segment: "desentupimento e limpeza de fossas", city: "Santo André", uf: "SP", checkedAt: "2026-10-06" }
  it("site vence a dedução, mas a correção humana vence o site", () => {
    expect(segmentPhrase({ name: "Azul", company: "Desentupidora / serviços locais", siteInfo })).toBe("desentupimento e limpeza de fossas")
    expect(regionOf({ contact: "(11) 97739-0519", siteInfo })).toBe("Santo André")
    expect(segmentPhrase({ name: "Azul", segment: "hidráulica", siteInfo })).toBe("hidráulica")
    expect(regionOf({ city: "Mauá", siteInfo })).toBe("Mauá")
  })
})
