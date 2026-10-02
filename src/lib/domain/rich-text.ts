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

// ---------- Markdown (texto colado do ChatGPT, Notion, Obsidian…) ----------

/** Tem cara de Markdown? (títulos, listas, negrito, citação, linha, bloco de código) */
export function looksLikeMarkdown(text: string): boolean {
  return /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|-{3,}\s*$)/m.test(text) || /\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(text)
}

/** Negrito, itálico, riscado, código e link dentro de um texto JÁ escapado. */
export function inlineMarkdown(s: string): string {
  return s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s"]+)\)/g, '<a href="$2">$1</a>')
}

const heading = (hashes: string, text: string) => {
  const tag = hashes.length <= 2 ? "h2" : "h3"
  return `<${tag}>${inlineMarkdown(text)}</${tag}>`
}

/** Markdown → HTML do editor (cada linha solta vira um parágrafo, como numa nota). */
export function markdownToHtml(md: string): string {
  const out: string[] = []
  let list: { tag: "ul" | "ol" | "task"; items: string[] } | null = null
  let code: string[] | null = null
  const flush = () => {
    if (!list) return
    if (list.tag === "task") out.push(`<ul data-type="taskList">${list.items.join("")}</ul>`)
    else out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`)
    list = null
  }
  const push = (tag: "ul" | "ol" | "task", item: string) => {
    if (list?.tag !== tag) {
      flush()
      list = { tag, items: [] }
    }
    list!.items.push(item)
  }
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (code) {
      if (/^\s*```/.test(raw)) {
        out.push(`<pre><code>${code.join("\n")}</code></pre>`)
        code = null
      } else code.push(escape(raw))
      continue
    }
    if (/^\s*```/.test(raw)) {
      flush()
      code = []
      continue
    }
    const line = escape(raw)
    let m: RegExpMatchArray | null
    if ((m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/))) push("task", `<li data-type="taskItem" data-checked="${m[1] !== " "}"><p>${inlineMarkdown(m[2])}</p></li>`)
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) push("ul", `<li><p>${inlineMarkdown(m[1])}</p></li>`)
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) push("ol", `<li><p>${inlineMarkdown(m[1])}</p></li>`)
    else {
      flush()
      if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/))) out.push(heading(m[1], m[2]))
      else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) out.push("<hr>")
      else if ((m = line.match(/^\s*&gt;\s?(.*)$/))) out.push(`<blockquote><p>${inlineMarkdown(m[1])}</p></blockquote>`)
      else out.push(line.trim() ? `<p>${inlineMarkdown(line)}</p>` : "<p></p>")
    }
  }
  flush()
  if (code) out.push(`<pre><code>${(code as string[]).join("\n")}</code></pre>`)
  return out.join("")
}

/**
 * Nota que já ficou com Markdown cru (## título, **negrito**): converte no próprio HTML.
 * Parágrafo "## x" vira título, "---" vira linha, "> x" vira citação; negrito etc. em todo o texto.
 */
export function convertMarkdownInHtml(html: string): string {
  return html
    .replace(/<p>\s*(#{1,6})\s+([\s\S]*?)<\/p>/g, (_, h, t) => heading(h, t))
    .replace(/<p>\s*(-{3,}|\*{3,}|_{3,})\s*<\/p>/g, "<hr>")
    .replace(/<p>\s*&gt;\s?([\s\S]*?)<\/p>/g, (_, t) => `<blockquote><p>${t}</p></blockquote>`)
    .replace(/>([^<]+)</g, (_, text) => `>${inlineMarkdown(text)}<`)
}
