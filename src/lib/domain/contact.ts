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
