/**
 * Texto formatado das notas (HTML do editor). Funções puras, testadas em rich-text.test.ts.
 * Notas antigas eram texto puro: viram parágrafos na hora de abrir, sem perder nada.
 */
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const isHtml = (s: string) => /^\s*<(p|h[1-6]|ul|ol|blockquote|pre|div)[\s>]/i.test(s)

/** Texto puro → HTML simples (cada linha um parágrafo; "- " vira lista). */
export function toNoteHtml(body: string): string {
  if (!body.trim()) return ""
  if (isHtml(body)) return body
  const out: string[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((i) => `<li><p>${i}</p></li>`).join("")}</ul>`)
    list = []
  }
  for (const line of body.split("\n")) {
    const item = line.match(/^\s*[-*•]\s+(.*)$/)
    if (item) list.push(escape(item[1]))
    else {
      flush()
      out.push(line.trim() ? `<p>${escape(line)}</p>` : "<p></p>")
    }
  }
  flush()
  return out.join("")
}

/** HTML → texto puro (prévia da lista de notas, busca). Sem executar nada. */
export function plainText(body: string): string {
  if (!isHtml(body)) return body
  return body
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote|\/pre)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{2,}/g, "\n")
    .trim()
}
