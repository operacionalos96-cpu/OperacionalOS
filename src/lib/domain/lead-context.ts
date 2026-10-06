/**
 * Segmento e região do lead para as mensagens do funil ("empresas de [segmento] aqui em [região]").
 * Usa o que foi preenchido no lead; se faltar, deduz: segmento antigo ficava no campo "empresa"
 * e a região sai do DDD do telefone. Regras puras, testadas em lead-context.test.ts.
 */
import type { Lead } from "./types"

/** Partes genéricas que não dizem o ramo ("Clínica / saúde mental" → "saúde mental"). */
const GENERIC = new Set(["clinica", "servicos", "servico", "empresa", "comercio", "loja", "varejo", "atacado"])

/** Ajustes para a frase "empresas de …" soar natural. Chave sem acento, minúscula. */
const PHRASE: Record<string, string> = {
  automotivo: "serviços automotivos",
  automoveis: "automóveis",
  desentupidora: "desentupimento",
  escola: "ensino",
  educacao: "educação",
  imobiliaria: "imóveis",
  industria: "indústria",
  laboratorio: "análises laboratoriais",
  otica: "ótica",
  chaveiro: "chaveiro",
  guincho: "guincho",
  "clinica medica": "saúde",
  "clinica estetica": "estética",
  "distribuidora de agua": "distribuição de água",
  "moda infantil atacado": "moda infantil",
  "cosmeticos/beleza": "cosméticos",
}

const key = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/** Texto do segmento como está no lead (campo próprio ou, nos leads antigos, o campo "empresa"). */
export function rawSegment(l: Pick<Lead, "segment" | "company" | "name" | "siteInfo">): string {
  if (l.segment?.trim()) return l.segment.trim()
  if (l.siteInfo?.segment?.trim()) return l.siteInfo.segment.trim()
  const c = l.company?.trim()
  return c && key(c) !== key(l.name ?? "") ? c : ""
}

/** "Desentupidora / serviços locais" → "desentupimento"; "Contabilidade" → "contabilidade". */
export function segmentPhrase(l: Pick<Lead, "segment" | "company" | "name" | "siteInfo">): string {
  const raw = rawSegment(l)
  if (!raw) return ""
  // Vindo do site já está pronto para a frase ("empresas de …").
  if (!l.segment?.trim() && l.siteInfo?.segment?.trim()) return raw.toLowerCase()
  if (PHRASE[key(raw)]) return PHRASE[key(raw)]
  const parts = raw.split(/\s*\/\s*/).filter(Boolean)
  const main = parts.find((p) => !GENERIC.has(key(p))) ?? parts[0]
  const phrase = PHRASE[key(main)] ?? main
  // Minúscula, mas preserva siglas (TI, RH…).
  return phrase.replace(/\S+/g, (w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase()))
}

/** DDD → cidade (capital/área metropolitana) ou "Cidade e região". */
const DDD: Record<string, string> = {
  "11": "São Paulo", "12": "São José dos Campos e região", "13": "Santos e região", "14": "Bauru e região", "15": "Sorocaba e região",
  "16": "Ribeirão Preto e região", "17": "São José do Rio Preto e região", "18": "Presidente Prudente e região", "19": "Campinas e região",
  "21": "Rio de Janeiro", "22": "Campos dos Goytacazes e região", "24": "Volta Redonda e região", "27": "Vitória", "28": "Cachoeiro de Itapemirim e região",
  "31": "Belo Horizonte", "32": "Juiz de Fora e região", "33": "Governador Valadares e região", "34": "Uberlândia e região", "35": "Poços de Caldas e região",
  "37": "Divinópolis e região", "38": "Montes Claros e região", "41": "Curitiba", "42": "Ponta Grossa e região", "43": "Londrina e região",
  "44": "Maringá e região", "45": "Cascavel e região", "46": "Pato Branco e região", "47": "Joinville e região", "48": "Florianópolis",
  "49": "Chapecó e região", "51": "Porto Alegre", "53": "Pelotas e região", "54": "Caxias do Sul e região", "55": "Santa Maria e região",
  "61": "Brasília", "62": "Goiânia", "63": "Palmas", "64": "Rio Verde e região", "65": "Cuiabá", "66": "Rondonópolis e região",
  "67": "Campo Grande", "68": "Rio Branco", "69": "Porto Velho", "71": "Salvador", "73": "Ilhéus e região", "74": "Juazeiro e região",
  "75": "Feira de Santana e região", "77": "Vitória da Conquista e região", "79": "Aracaju", "81": "Recife", "82": "Maceió",
  "83": "João Pessoa", "84": "Natal", "85": "Fortaleza", "86": "Teresina", "87": "Petrolina e região", "88": "Juazeiro do Norte e região",
  "89": "Picos e região", "91": "Belém", "92": "Manaus", "93": "Santarém e região", "94": "Marabá e região", "95": "Boa Vista",
  "96": "Macapá", "97": "Coari e região", "98": "São Luís", "99": "Imperatriz e região",
}

export function dddOf(contact: string | undefined): string | null {
  const d = (contact ?? "").replace(/\D/g, "").replace(/^0+/, "").replace(/^55(?=\d{10,11}$)/, "")
  return d.length === 10 || d.length === 11 ? d.slice(0, 2) : null
}

/** Cidade do lead; sem ela, a região do DDD; sem DDD, "". */
export function regionOf(l: Pick<Lead, "city" | "contact" | "siteInfo">): string {
  if (l.city?.trim()) return l.city.trim()
  if (l.siteInfo?.city?.trim()) return l.siteInfo.city.trim()
  const ddd = dddOf(l.contact)
  return (ddd && DDD[ddd]) || ""
}
