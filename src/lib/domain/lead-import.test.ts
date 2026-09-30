import { describe, expect, it } from "vitest"
import { detectColumns, rowsToLeads, temperatureFrom } from "./lead-import"
import { whatsappLink } from "./contact"

const HEADER = ["Empresa", "Segmento", "CNPJ", "WhatsApp", "Site", "Situação CNPJ", "Nota oportunidade (0-10)", "Diagnóstico", "Prioridade"]

describe("importar leads de planilha", () => {
  it("reconhece colunas pelo nome, sem acento e sem depender da ordem", () => {
    expect(detectColumns(HEADER)).toEqual(["empresa", "segmento", "ignorar", "contato", "site", "ignorar", "ignorar", "ignorar", "prioridade"])
    expect(detectColumns(["Telefone", "Razão Social", "E-mail"])).toEqual(["contato", "empresa", "email"])
  })

  it("prioridade vira temperatura", () => {
    expect(temperatureFrom("Alta")).toBe("quente")
    expect(temperatureFrom("Média")).toBe("morno")
    expect(temperatureFrom("baixa")).toBe("frio")
    expect(temperatureFrom("")).toBeUndefined()
  })

  it("monta os leads, guarda o resto como anotação e pula vazios/duplicados", () => {
    const r = rowsToLeads(
      [
        HEADER,
        ["Costa Lion", "Materiais", "60.600.046/0001-73", "(11) 5564-8966", "https://costalion.com.br", "ATIVA", 9, "Site antigo", "Alta"],
        ["Aloicia", "Moda", "", "WhatsApp no site", "https://aloicia.com.br/", "PENDENTE", 9, "", "Média"],
        [null, null, null, null, null, null, null, null, null],
        ["", "Sem nome", "", "", "", "", "", "", ""],
        ["Já Existe", "X", "", "", "", "", "", "", ""],
        ["costa lion", "dup", "", "", "", "", "", "", ""],
      ],
      { defaultValueCents: 250000, existingNames: ["ja existe"] },
    )
    expect(r.leads).toHaveLength(2)
    expect(r.leads[0]).toMatchObject({
      name: "Costa Lion",
      company: "Materiais",
      contact: "(11) 5564-8966",
      website: "https://costalion.com.br/",
      temperature: "quente",
      valueCents: 250000,
      row: 2,
    })
    expect(r.leads[0].note).toContain("CNPJ: 60.600.046/0001-73")
    expect(r.leads[0].note).toContain("Diagnóstico: Site antigo")
    // WhatsApp e site viraram campos: não se repetem na anotação.
    expect(r.leads[0].note).not.toContain("WhatsApp:")
    expect(r.leads[0].note).not.toContain("Site:")
    expect(r.leads[1]).toMatchObject({ name: "Aloicia", contact: undefined, website: "https://aloicia.com.br/", temperature: "morno" })
    expect(r.leads[1].note).toContain("WhatsApp: WhatsApp no site")
    expect(r.skipped.map((s) => s.row)).toEqual([5, 7])
    // "Já Existe" não vira lead novo: vai para `existing` (para completar campos vazios).
    expect(r.existing.map((l) => l.name)).toEqual(["Já Existe"])
  })
})

describe("whatsappLink", () => {
  it("monta o link com 55 e só números; recusa o que não é telefone", () => {
    expect(whatsappLink("(11) 96111-0797")).toBe("https://wa.me/5511961110797")
    expect(whatsappLink("(11) 5564-8966")).toBe("https://wa.me/551155648966")
    expect(whatsappLink("+55 11 96111-0797")).toBe("https://wa.me/5511961110797")
    expect(whatsappLink("WhatsApp no site")).toBeNull()
    expect(whatsappLink("contato@empresa.com")).toBeNull()
  })
})
