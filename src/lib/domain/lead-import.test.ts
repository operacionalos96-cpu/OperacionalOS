import { describe, expect, it } from "vitest"
import { detectColumns, extractPhone, rowsToLeads, temperatureFrom } from "./lead-import"
import { whatsappLink } from "./contact"

const HEADER = ["Empresa", "Segmento", "CNPJ", "WhatsApp", "Site", "Situação CNPJ", "Nota oportunidade (0-10)", "Diagnóstico", "Prioridade"]

describe("importar leads de planilha", () => {
  it("reconhece colunas pelo nome, sem acento e sem depender da ordem", () => {
    expect(detectColumns(HEADER)).toEqual(["empresa", "segmento", "ignorar", "contato", "site", "ignorar", "qualificacao", "resumo", "prioridade"])
    expect(detectColumns(["Telefone", "Razão Social", "E-mail"])).toEqual(["contato", "empresa", "email"])
    expect(detectColumns(["Cidade", "Origem", "Nota do site", "Problemas encontrados", "Oportunidade"])).toEqual(["cidade", "origem", "nota_site", "problemas", "oportunidade"])
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
      company: undefined,
      segment: "Materiais",
      source: "planilha",
      contact: "(11) 5564-8966",
      website: "https://costalion.com.br/",
      temperature: "quente",
      valueCents: 250000,
      row: 2,
    })
    expect(r.leads[0].note).toContain("CNPJ: 60.600.046/0001-73")
    // Nota e diagnóstico viram ANÁLISE (dado estruturado), não anotação.
    expect(r.leads[0].analysis).toMatchObject({ qualificationScore: 9, summary: "Site antigo", analyzedBy: "planilha" })
    expect(r.leads[0].note).not.toContain("Diagnóstico")
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

describe("importar a planilha do agente de prospecção", () => {
  // Cabeçalho real de consultorias-sp-100.csv (02/11): sem coluna "Site" nem "WhatsApp".
  const PESQUISA = ["ID", "Nome", "Cidade", "UF", "Segmento", "URL / página de evidência", "Problema observado", "Evidência / onde conferir", "Contato público", "Prioridade de revisão", "Status", "Busca no Google Maps"]
  const linha = (url: string, contato: string) => ["2", "LDM Consultoria Empresarial", "São Paulo", "SP", "Contábil", url, "Conteúdo de modelo na home", "Olá, mundo! publicado", contato, "Alta", "Pendente", "https://www.google.com/maps/search/?api=1&query=LDM"]

  it("acha o telefone em 'Contato público' e o site em 'URL / página de evidência'", () => {
    const r = rowsToLeads([PESQUISA, linha("https://ldm.srv.br/", "adm@ldm.srv.br | (11) 3255-8452")], { defaultValueCents: 0, existingNames: [] })
    expect(r.leads[0]).toMatchObject({ name: "LDM Consultoria Empresarial", city: "São Paulo", contact: "(11) 3255-8452", website: "https://ldm.srv.br/", temperature: "quente", source: "planilha" })
    // O e-mail não virou o contato: continua na anotação.
    expect(r.leads[0].note).toContain("Contato público: adm@ldm.srv.br | (11) 3255-8452")
  })

  it("sem telefone, o e-mail do 'Contato público' vira o contato; link do Maps nunca vira site", () => {
    const r = rowsToLeads([PESQUISA, linha("", "contato@empresa.com.br")], { defaultValueCents: 0, existingNames: [] })
    expect(r.leads[0].contact).toBe("contato@empresa.com.br")
    expect(r.leads[0].website).toBeUndefined()
  })

  it("domínio que só contém 'x.com' no meio continua sendo site", () => {
    const r = rowsToLeads([PESQUISA, linha("https://anacavadascomex.com.br/", "(19) 98122-7672")], { defaultValueCents: 0, existingNames: [] })
    expect(r.leads[0].website).toBe("https://anacavadascomex.com.br/")
  })

  it("'Cidade / SP' é a cidade e a coluna 'WhatsApp — número' ganha do link wa.me", () => {
    const h = ["Nome", "Site", "WhatsApp — número", "Link direto WhatsApp", "Cidade / SP", "Segmento"]
    const r = rowsToLeads([h, ["Ferras", "https://www.ferrasimperial.com/", "(19) 99694-6013", "https://wa.me/5519996946013", "Campinas", "Tributária"]], { defaultValueCents: 0, existingNames: [] })
    expect(r.leads[0]).toMatchObject({ city: "Campinas", contact: "(19) 99694-6013", website: "https://www.ferrasimperial.com/" })
  })

  it("'Fonte' com link não vira origem: o lead é 'planilha' e o link pode ser o site", () => {
    const r = rowsToLeads([["Empresa", "Fonte", "Telefone"], ["Fortes Tapumes", "https://fortestapumessp.wixsite.com/tapumes", "11 94643-7014"]], { defaultValueCents: 0, existingNames: [] })
    expect(r.leads[0]).toMatchObject({ source: "planilha", website: "https://fortestapumessp.wixsite.com/tapumes", contact: "11 94643-7014" })
  })

  it("'Nota_Final' da skill prospeccao-leads é a nota do site; 'Sem dados' não vira nota 0", () => {
    const h = ["Empresa", "Nicho", "Cidade", "URL", "Nota_Final", "Telefone"]
    expect(detectColumns(h)).toEqual(["empresa", "segmento", "cidade", "site", "nota_site", "contato"])
    const r = rowsToLeads([h, ["A", "x", "y", "https://a.com.br", "4", "11 99999-0000"], ["B", "x", "y", "https://b.com.br", "Sem dados", "11 98888-0000"]], { defaultValueCents: 0, existingNames: [] })
    expect(r.leads[0].analysis?.siteScore).toBe(4)
    expect(r.leads[1].analysis).toBeUndefined()
  })

  it("extractPhone tira o telefone do meio do texto e ignora CNPJ", () => {
    expect(extractPhone("comercial@x.com | (19) 99694-6013")).toBe("(19) 99694-6013")
    expect(extractPhone("https://wa.me/5519996946013")).toBe("5519996946013")
    expect(extractPhone("60.600.046/0001-73")).toBeUndefined()
    expect(extractPhone("WhatsApp no site")).toBeUndefined()
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
