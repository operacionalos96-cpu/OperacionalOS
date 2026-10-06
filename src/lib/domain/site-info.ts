/**
 * Lê o HTML do site de uma empresa e tira o que interessa para a prospecção:
 * cidade (endereço, CEP, dados estruturados) e o texto para a IA dizer o segmento exato.
 * Regras puras (sem rede), testadas em site-info.test.ts.
 */

export interface SitePage {
  title: string
  description: string
  /** Tipos e endereços de dados estruturados (schema.org / JSON-LD). */
  ldTypes: string[]
  ldPlaces: { city: string; uf?: string }[]
  /** Candidatos "Cidade - UF" achados no texto (endereço, rodapé). */
  places: { city: string; uf: string }[]
  text: string
  /** Links da mesma empresa para contato/sobre (onde costuma estar o endereço). */
  contactLinks: string[]
}

export interface SiteInfoResult {
  segment: string | null
  city: string | null
  uf: string | null
  confidence: "alta" | "media" | "baixa"
  evidence: string
}

const UF = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO"
const UF_SET = new Set(UF.split("|"))

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ccedil: "ç", atilde: "ã", otilde: "õ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ccedil: "Ç", Atilde: "Ã" }
export function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n: string) => ENTITIES[n] ?? m)
}

const meta = (html: string, name: string) => {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i")
  const tag = re.exec(html)?.[0] ?? ""
  return decodeEntities(/content=["']([^"']*)["']/i.exec(tag)?.[1] ?? "").trim()
}

/** Palavras que não são cidade mesmo aparecendo antes de "- SP". */
const NOT_CITY = /^(rua|av|avenida|alameda|travessa|rodovia|estrada|praça|cep|tel|telefone|whatsapp|fone|sala|loja|bloco|conjunto|centro|brasil|endereço|unidade|matriz|filial|atendimento|copyright|todos)$/i

export function placesInText(text: string): { city: string; uf: string }[] {
  const out: { city: string; uf: string }[] = []
  const re = new RegExp(`([A-ZÀ-Ý][a-zà-ÿ'’.]+(?:[ -](?:d[aeo]s?|[A-ZÀ-Ý][a-zà-ÿ'’.]+)){0,4})\\s*(?:[-–—/,]|\\s)\\s*(${UF})\\b(?![a-zà-ÿ])`, "g")
  for (const m of text.matchAll(re)) {
    let city = m[1].trim().replace(/^(?:d[aeo]s?|em|no|na)\s+/i, "")
    // "Rua X, 123 - Centro, Santo André - SP": fica com o trecho final.
    city = city.split(/\s*,\s*/).pop()!.trim()
    if (!city || city.length < 3 || NOT_CITY.test(city.split(/\s+/)[0])) continue
    out.push({ city, uf: m[2] })
  }
  return out
}

function walkLd(node: unknown, types: string[], places: { city: string; uf?: string }[], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return
  if (Array.isArray(node)) return node.forEach((n) => walkLd(n, types, places, depth + 1))
  const o = node as Record<string, unknown>
  const t = o["@type"]
  for (const x of Array.isArray(t) ? t : [t]) if (typeof x === "string" && x.length < 60) types.push(x)
  const addr = o.address as Record<string, unknown> | undefined
  for (const a of Array.isArray(addr) ? addr : [addr]) {
    if (a && typeof a === "object" && typeof (a as Record<string, unknown>).addressLocality === "string") {
      const r = (a as Record<string, unknown>).addressRegion
      places.push({ city: String((a as Record<string, unknown>).addressLocality).trim(), uf: typeof r === "string" && UF_SET.has(r.trim().toUpperCase()) ? r.trim().toUpperCase() : undefined })
    }
  }
  for (const [k, v] of Object.entries(o)) if (k !== "address" && typeof v === "object") walkLd(v, types, places, depth + 1)
}

export function parseSite(html: string, baseUrl: string): SitePage {
  const h = html.slice(0, 1_500_000)
  const ldTypes: string[] = []
  const ldPlaces: { city: string; uf?: string }[] = []
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkLd(JSON.parse(m[1].trim()), ldTypes, ldPlaces)
    } catch {}
  }
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] ?? "").replace(/\s+/g, " ").trim()
  const description = meta(h, "description") || meta(h, "og:description")
  const text = decodeEntities(
    h
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|section|footer|header|address)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()

  let host = ""
  try {
    host = new URL(baseUrl).host
  } catch {}
  const contactLinks = [
    ...new Set(
      [...h.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)]
        .map((m) => {
          try {
            return new URL(decodeEntities(m[1]), baseUrl)
          } catch {
            return null
          }
        })
        .filter((u): u is URL => !!u && /^https?:$/.test(u.protocol) && u.host === host && /contat|contact|fale|endereco|localiza|onde-estamos|sobre|quem-somos|about/i.test(u.pathname))
        .sort((a, b) => Number(/contat|contact|fale|endereco|localiza|onde/i.test(b.pathname)) - Number(/contat|contact|fale|endereco|localiza|onde/i.test(a.pathname)))
        .map((u) => u.href.split("#")[0]),
    ),
  ].slice(0, 3)

  return { title, description, ldTypes: [...new Set(ldTypes)], ldPlaces, places: placesInText(text), text, contactLinks }
}

/** Cidade mais citada (dados estruturados valem mais que texto). */
export function bestPlace(pages: SitePage[]): { city: string; uf?: string } | null {
  const score = new Map<string, { city: string; uf?: string; n: number }>()
  const add = (p: { city: string; uf?: string }, w: number) => {
    const k = p.city.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    const cur = score.get(k) ?? { city: p.city, uf: p.uf, n: 0 }
    cur.n += w
    cur.uf ??= p.uf
    score.set(k, cur)
  }
  for (const pg of pages) {
    pg.ldPlaces.forEach((p) => add(p, 3))
    pg.places.forEach((p) => add(p, 1))
  }
  const best = [...score.values()].sort((a, b) => b.n - a.n)[0]
  return best ? { city: best.city, uf: best.uf } : null
}

/** Trecho do site para a IA: começo, linhas com endereço/serviços e o rodapé. */
export function excerpt(pages: SitePage[], max = 6000) {
  const parts: string[] = []
  for (const p of pages) {
    const lines = p.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 2)
    const useful = lines.filter((l) => /\d{5}-?\d{3}|endereç|rua |av\.|avenida|atendemos|atendimento|serviços|especialista|somos|nossa empresa|região|unidade/i.test(l))
    parts.push([`# ${p.title}`, p.description, lines.slice(0, 40).join("\n"), useful.slice(0, 40).join("\n"), lines.slice(-25).join("\n")].filter(Boolean).join("\n"))
  }
  return [...new Set(parts.join("\n").split("\n"))].join("\n").slice(0, max)
}

export function buildSitePrompt(input: { name: string; url: string; hintSegment?: string; ddd?: string | null; pages: SitePage[] }) {
  const place = bestPlace(input.pages)
  const types = [...new Set(input.pages.flatMap((p) => p.ldTypes))].slice(0, 10)
  return `Você analisa o site de uma empresa brasileira para personalizar uma mensagem de prospecção.
Responda SOMENTE um JSON: {"segmento": string|null, "cidade": string|null, "uf": string|null, "confianca": "alta"|"media"|"baixa", "evidencia": string}

- "segmento": o ramo EXATO da empresa, escrito para completar a frase "Estava pesquisando algumas empresas de ___". Minúsculas, 1 a 5 palavras, específico e natural, sem o nome da empresa. Exemplos: "desentupimento", "contabilidade", "odontologia", "materiais de construção", "controle de pragas", "estética automotiva", "psicologia infantil", "aluguel de andaimes".
- "cidade": a cidade onde a empresa fica (endereço da sede/unidade principal). Só o nome da cidade, com acentos. Se não houver endereço ou ela só atende online, null. NÃO deduza pelo DDD e NÃO invente.
- "uf": sigla do estado da cidade, ou null.
- "evidencia": até 120 caracteres citando de onde tirou (ex.: "rodapé: Rua X, 123 - Santo André/SP").

Empresa: ${input.name}
Site: ${input.url}
Segmento anotado na planilha (pode ser genérico): ${input.hintSegment || "—"}
Tipos schema.org: ${types.join(", ") || "—"}
Cidade achada no endereço (automático, confira): ${place ? `${place.city}${place.uf ? `/${place.uf}` : ""}` : "—"}

Conteúdo do site:
"""
${excerpt(input.pages)}
"""`
}

const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() && !/^(null|n\/a|desconhecid)/i.test(v.trim()) ? v.trim().replace(/\s+/g, " ").slice(0, max) : null)

export function parseSiteResult(raw: string): SiteInfoResult | null {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim())
  } catch {
    return null
  }
  if (!o || typeof o !== "object") return null
  let segment = clean(o.segmento, 60)
  if (segment) segment = segment.replace(/^(empresas? de|de)\s+/i, "").replace(/[.;]+$/, "").toLowerCase()
  const uf = clean(o.uf, 2)?.toUpperCase() ?? null
  return {
    segment,
    city: clean(o.cidade, 60),
    uf: uf && UF_SET.has(uf) ? uf : null,
    confidence: o.confianca === "alta" || o.confianca === "baixa" ? o.confianca : "media",
    evidence: clean(o.evidencia, 160) ?? "",
  }
}
