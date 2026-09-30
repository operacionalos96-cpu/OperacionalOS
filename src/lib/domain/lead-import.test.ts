import { describe, expect, it } from "vitest"
import { detectColumns, rowsToLeads, temperatureFrom } from "./lead-import"

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
    expect(r.leads[0]).toMatchObject({ name: "Costa Lion", company: "Materiais", contact: "(11) 5564-8966", temperature: "quente", valueCents: 250000, row: 2 })
    expect(r.leads[0].note).toContain("CNPJ: 60.600.046/0001-73")
    expect(r.leads[0].note).toContain("Diagnóstico: Site antigo")
    expect(r.leads[1]).toMatchObject({ name: "Aloicia", contact: "https://aloicia.com.br/", temperature: "morno" })
    expect(r.leads[1].note).toContain("WhatsApp: WhatsApp no site")
    expect(r.skipped.map((s) => s.row)).toEqual([5, 6, 7])
  })
})
