/**
 * Importar leads de planilha (Excel/CSV). Reconhece as colunas pelo nome, sem
 * depender da ordem nem de acento ("Situação CNPJ" = "situacao cnpj").
 * Função pura, testada em lead-import.test.ts.
 */
import type { Temperature } from "./types"

export type ImportField = "nome" | "empresa" | "contato" | "email" | "site" | "segmento" | "prioridade" | "valor" | "ignorar"

/** Palavras que identificam cada campo (já normalizadas). A primeira coluna que casar vence. */
const FIELD_HINTS: [ImportField, RegExp][] = [
  ["empresa", /^(empresa|razao social|nome fantasia|company)$/],
  ["nome", /^(nome|contato nome|responsavel|lead|cliente|decisor)$/],
  ["contato", /(whatsapp|whats|telefone|celular|fone|phone)/],
  ["email", /(e ?mail)/],
  ["site", /^(site|website|url|link)$/],
  ["segmento", /(segmento|nicho|setor|ramo|categoria)/],
  ["prioridade", /^(prioridade|temperatura)$/],
  ["valor", /^(valor|ticket|orcamento|valor estimado)$/],
]

export function normalizeHeader(h: unknown) {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Para cada coluna: qual campo do lead ela preenche (o resto vira anotação do lead). */
export function detectColumns(headers: unknown[]): ImportField[] {
  const used = new Set<ImportField>()
  return headers.map((h) => {
    const n = normalizeHeader(h)
    for (const [field, re] of FIELD_HINTS) {
      if (!used.has(field) && re.test(n)) {
        used.add(field)
        return field
      }
    }
    return "ignorar"
  })
}

export function temperatureFrom(value: unknown): Temperature | undefined {
  const n = normalizeHeader(value)
  if (/^(alta|quente|hot|a)$/.test(n)) return "quente"
  if (/^(media|morno|warm|b)$/.test(n)) return "morno"
  if (/^(baixa|frio|cold|c)$/.test(n)) return "frio"
  return undefined
}

function moneyToCents(value: unknown) {
  if (typeof value === "number") return Math.round(value * 100)
  const text = String(value ?? "").replace(/[^\d,.-]/g, "")
  if (!text) return 0
  const n = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0
}

function cell(v: unknown) {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v).trim()
}

export interface ImportedLead {
  name: string
  company?: string
  contact?: string
  temperature?: Temperature
  valueCents: number
  /** Tudo que não virou campo: vai como anotação no histórico do lead. */
  note: string
  /** Linha da planilha (1 = cabeçalho), para mostrar erros. */
  row: number
}

export interface ImportResult {
  leads: ImportedLead[]
  skipped: { row: number; reason: string }[]
}

/**
 * Converte linhas (primeira = cabeçalho) em leads. Pula linhas vazias, sem nome
 * e nomes que já existem (`existingNames`, comparação sem acento/maiúscula).
 */
export function rowsToLeads(rows: unknown[][], opts: { defaultValueCents: number; existingNames: string[] }): ImportResult {
  const [header = [], ...body] = rows
  const fields = detectColumns(header)
  const seen = new Set(opts.existingNames.map(normalizeHeader))
  const result: ImportResult = { leads: [], skipped: [] }

  body.forEach((raw, i) => {
    const row = i + 2
    const values = header.map((_, c) => cell(raw[c]))
    if (values.every((v) => !v)) return
    const get = (f: ImportField) => {
      const idx = fields.indexOf(f)
      return idx >= 0 ? values[idx] : ""
    }

    const empresa = get("empresa")
    const nome = get("nome")
    const name = nome || empresa
    if (!name) {
      result.skipped.push({ row, reason: "sem nome/empresa" })
      return
    }
    const key = normalizeHeader(name)
    if (seen.has(key)) {
      result.skipped.push({ row, reason: `"${name}" já existe` })
      return
    }
    seen.add(key)

    const whats = get("contato")
    // "WhatsApp no site" não é um número: fica na anotação, e o contato vira o site.
    const contact = /\d{8,}/.test(whats.replace(/\D/g, "")) ? whats : get("email") || get("site") || undefined

    const noteLines = header
      .map((h, c) => ({ label: cell(h), value: values[c], field: fields[c] }))
      .filter((x) => x.value && x.field !== "nome" && x.field !== "empresa" && x.field !== "valor")
      .map((x) => `${x.label}: ${x.value}`)

    const valueIdx = fields.indexOf("valor")
    result.leads.push({
      name,
      company: nome && empresa ? empresa : get("segmento") || undefined,
      contact,
      temperature: temperatureFrom(get("prioridade")),
      valueCents: valueIdx >= 0 ? moneyToCents(raw[valueIdx]) || opts.defaultValueCents : opts.defaultValueCents,
      note: noteLines.join("\n"),
      row,
    })
  })
  return result
}
