/**
 * IA no mapa — regras puras (testadas em ai-map.test.ts): o que vai para o modelo,
 * limites de tamanho e como ler a resposta. O modelo (Gemini hoje, Claude depois)
 * fica no servidor (src/lib/server/ai.ts); aqui não há rede nem chave.
 *
 * Só vai o texto do mapa (títulos/descrições dos balões). Nada de leads, valores ou contatos.
 */
export type AiAction = "expandir" | "lacunas" | "resumir"

export interface AiMapRequest {
  action: AiAction
  mapTitle: string
  /** Balão escolhido (texto + descrição). */
  focus: { label: string; description?: string }
  /** O mapa (ou o ramo) em forma de lista numerada. */
  outline: string
}

export const AI_LIMITS = { outline: 6000, label: 200, description: 600, title: 120, items: 8, itemLength: 80, summary: 700 }

export function validateAiRequest(body: unknown): AiMapRequest | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const focus = (b.focus && typeof b.focus === "object" ? b.focus : {}) as Record<string, unknown>
  if (!["expandir", "lacunas", "resumir"].includes(String(b.action))) return null
  const label = typeof focus.label === "string" ? focus.label.trim() : ""
  if (!label || typeof b.outline !== "string") return null
  return {
    action: b.action as AiAction,
    mapTitle: String(b.mapTitle ?? "").slice(0, AI_LIMITS.title),
    focus: { label: label.slice(0, AI_LIMITS.label), description: typeof focus.description === "string" ? focus.description.slice(0, AI_LIMITS.description) : undefined },
    outline: b.outline.slice(0, AI_LIMITS.outline),
  }
}

/** Lista numerada para o modelo entender a estrutura ("1.2 Oferta"). */
export function outlineText(rows: { number: string; depth: number; node: { label: string } }[]) {
  return rows.map((r) => `${"  ".repeat(r.depth)}${r.number} ${r.node.label || "(sem texto)"}`).join("\n")
}

export function buildPrompt(r: AiMapRequest): string {
  const base = [
    "Você ajuda uma pequena empresa brasileira a pensar num mapa mental de operação.",
    `Mapa: "${r.mapTitle}". Estrutura atual:`,
    r.outline,
    "",
    `Balão escolhido: "${r.focus.label}"${r.focus.description ? ` — ${r.focus.description}` : ""}.`,
  ]
  const ask: Record<AiAction, string> = {
    expandir: `Sugira de 3 a 6 próximos passos ou subtópicos para "${r.focus.label}". Curtos (até 8 palavras), concretos e acionáveis, sem repetir o que já existe.`,
    lacunas: `Olhando o mapa inteiro, aponte de 3 a 6 coisas importantes que estão faltando (riscos, etapas, decisões, métricas). Curtas (até 8 palavras), sem repetir o que já existe.`,
    resumir: `Resuma "${r.focus.label}" e tudo abaixo dele em até 3 frases diretas: o que é, onde está e o próximo passo.`,
  }
  const format =
    r.action === "resumir"
      ? 'Responda só com JSON: {"summary": "texto"}'
      : 'Responda só com JSON: {"items": ["texto", "texto"]}'
  return [...base, "", ask[r.action], "Escreva em português do Brasil.", format].join("\n")
}

export type AiResult = { items: string[] } | { summary: string }

/** Lê a resposta do modelo com desconfiança: formato, tamanho, repetidos e o que já existe. */
export function parseAiResult(action: AiAction, raw: unknown, existing: string[] = []): AiResult | null {
  const v = (typeof raw === "string" ? safeJson(raw) : raw) as Record<string, unknown> | null
  if (!v || typeof v !== "object") return null
  if (action === "resumir") {
    const s = typeof v.summary === "string" ? v.summary.trim() : ""
    return s ? { summary: s.slice(0, AI_LIMITS.summary) } : null
  }
  const seen = new Set(existing.map(norm))
  const items: string[] = []
  for (const it of Array.isArray(v.items) ? v.items : []) {
    if (typeof it !== "string") continue
    const t = it.replace(/^[-•\d.\s]+/, "").trim().slice(0, AI_LIMITS.itemLength)
    if (!t || seen.has(norm(t))) continue
    seen.add(norm(t))
    items.push(t)
    if (items.length >= AI_LIMITS.items) break
  }
  return items.length ? { items } : null
}

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

function safeJson(s: string): unknown {
  // Alguns modelos embrulham em ```json … ```.
  const clean = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "")
  try {
    return JSON.parse(clean)
  } catch {
    return null
  }
}
