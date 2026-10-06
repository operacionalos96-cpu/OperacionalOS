/** Link de conversa no WhatsApp a partir do telefone digitado (Brasil por padrão). Pura, testada. */
export function whatsappLink(contact: string | undefined): string | null {
  if (!contact) return null
  const digits = contact.replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) return `https://wa.me/55${digits}` // DDD + número
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `https://wa.me/${digits}`
  return null
}

const digitsOf = (s: string) => s.replace(/\D/g, "")

/**
 * Busca de lead por nome, empresa, site ou WhatsApp. Número em qualquer formato:
 * "(11) 99999-1234", "11999991234" e "+55 11 99999-1234" acham o mesmo lead.
 */
export function leadMatches(lead: { name: string; company?: string; contact?: string; website?: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if ([lead.name, lead.company, lead.contact, lead.website].some((f) => f?.toLowerCase().includes(q))) return true
  // Só dígitos no que foi digitado (3+): compara com os dígitos do contato, com ou sem o 55.
  const qd = digitsOf(q)
  if (qd.length < 3 || /[a-z]/i.test(q) || !lead.contact) return false
  const cd = digitsOf(lead.contact)
  return cd.includes(qd) || (qd.startsWith("55") && cd.includes(qd.slice(2)))
}

// ---------- abrir conversa no WhatsApp da empresa ----------

/** Onde abrir: WhatsApp Web (direto na conversa), app do computador ou celular (wa.me). */
export type WhatsappTarget = "web" | "app" | "celular"

/** Número no formato internacional (55 + DDD + número) ou null se não for telefone. */
export function whatsappNumber(contact: string | undefined): string | null {
  const link = whatsappLink(contact)
  return link ? link.replace("https://wa.me/", "") : null
}

/** Celular brasileiro: 55 + DDD + 9 dígitos começando com 9. Fixo pode ter WhatsApp Business, mas é menos provável. */
export function isLikelyMobile(number: string) {
  return /^55\d{2}9\d{8}$/.test(number)
}

/** Link que abre a conversa já com a mensagem escrita, sem página intermediária. */
export function whatsappUrl(contact: string | undefined, text = "", target: WhatsappTarget = "web"): string | null {
  const n = whatsappNumber(contact)
  if (!n) return null
  const t = text ? encodeURIComponent(text) : ""
  if (target === "app") return `whatsapp://send?phone=${n}${t ? `&text=${t}` : ""}`
  if (target === "celular") return `https://wa.me/${n}${t ? `?text=${t}` : ""}`
  return `https://web.whatsapp.com/send?phone=${n}${t ? `&text=${t}` : ""}`
}

/** Por que este contato NÃO abre o WhatsApp (null = abre). Mensagem para mostrar na tela. */
export function whatsappProblem(contact: string | undefined): string | null {
  if (whatsappLink(contact)) return null
  const c = (contact ?? "").trim()
  if (!c) return "Sem telefone cadastrado"
  if (/@/.test(c)) return "Contato é um e-mail, não um telefone"
  if (/^(https?:\/\/|www\.)/i.test(c) || /\.(com|br|net|org)(\/|$)/i.test(c)) return "Contato é um link, não um telefone"
  const digits = c.replace(/\D/g, "")
  if (!digits) return `Contato não é número ("${c.slice(0, 30)}")`
  if (digits.length < 10) return `Número incompleto (${digits.length} dígitos — falta DDD?)`
  return "Número em formato não reconhecido"
}
