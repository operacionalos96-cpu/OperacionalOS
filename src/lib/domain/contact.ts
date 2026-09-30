/** Link de conversa no WhatsApp a partir do telefone digitado (Brasil por padrão). Pura, testada. */
export function whatsappLink(contact: string | undefined): string | null {
  if (!contact) return null
  const digits = contact.replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) return `https://wa.me/55${digits}` // DDD + número
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `https://wa.me/${digits}`
  return null
}
