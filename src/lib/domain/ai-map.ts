/**
 * IA no mapa — regras puras (testadas em ai-map.test.ts): o que vai para o modelo,
 * limites de tamanho e como ler a resposta. O modelo (Gemini hoje, Claude depois)
 * fica no servidor (src/lib/server/ai.ts); aqui não há rede nem chave.
 *
 * Só vai o texto do mapa (títulos/descrições dos balões). Nada de leads, valores ou contatos.
 */
/**
 * "hierarquia": nível visual de cada balão de um conjunto (para redimensionar pela hierarquia).
 * "pedido": pedido livre da pessoa sobre o mapa; volta resposta e/ou mudanças em rascunho.
 */
export type AiAction = "expandir" | "lacunas" | "resumir" | "hierarquia" | "pedido"

export interface AiMapRequest {
  action: AiAction
  mapTitle: string
  /** Balão escolhido (texto + descrição). */
  focus: { label: string; description?: string }
  /** O mapa (ou o ramo) em forma de lista numerada. */
  outline: string
  /** Pedido livre (só na ação "pedido"). */
  request?: string
}

export const AI_LIMITS = { outline: 6000, label: 200, description: 600, title: 120, items: 8, itemLength: 80, summary: 700, request: 500, ops: 30, answer: 1200, note: 400 }

export function validateAiRequest(body: unknown): AiMapRequest | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const focus = (b.focus && typeof b.focus === "object" ? b.focus : {}) as Record<string, unknown>
  if (!["expandir", "lacunas", "resumir", "hierarquia", "pedido"].includes(String(b.action))) return null
  const label = typeof focus.label === "string" ? focus.label.trim() : ""
  if (!label || typeof b.outline !== "string") return null
  const request = typeof b.request === "string" ? b.request.trim().slice(0, AI_LIMITS.request) : ""
  if (b.action === "pedido" && !request) return null
  return {
    ...(b.action === "pedido" ? { request } : {}),
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
  if (r.action === "pedido") return buildRequestPrompt(r)
  const ask: Record<Exclude<AiAction, "pedido">, string> = {
    expandir: `Sugira de 3 a 6 próximos passos ou subtópicos para "${r.focus.label}". Curtos (até 8 palavras), concretos e acionáveis, sem repetir o que já existe.`,
    lacunas: `Olhando o mapa inteiro, aponte de 3 a 6 coisas importantes que estão faltando (riscos, etapas, decisões, métricas). Curtas (até 8 palavras), sem repetir o que já existe.`,
    resumir: `Resuma "${r.focus.label}" e tudo abaixo dele em até 3 frases diretas: o que é, onde está e o próximo passo.`,
    hierarquia: [
      "Os balões acima foram selecionados para ganhar tamanhos pela hierarquia (a numeração mostra quem é filho de quem).",
      "Para cada número, dê um nível visual: 1 = maior (o principal); quanto maior o número, menor o balão.",
      "Regras: o filho fica 1 nível abaixo do pai; use 2 níveis abaixo só para detalhes pouco importantes. Nunca deixe um filho do tamanho do pai ou maior.",
    ].join(" "),
  }
  const format =
    r.action === "resumir"
      ? 'Responda só com JSON: {"summary": "texto"}'
      : r.action === "hierarquia"
        ? 'Responda só com JSON: {"levels": {"1": 1, "1.1": 2, "1.1.1": 3}}'
        : 'Responda só com JSON: {"items": ["texto", "texto"]}'
  return [...base, "", ask[r.action], "Escreva em português do Brasil.", format].join("\n")
}

// ---------- pedido livre ----------

/**
 * Mudança que a IA propõe no mapa. Balões existentes são apontados pelo número da
 * lista ("1.2"); balões novos ganham um apelido ("n1") para virarem pai de outros.
 * Tudo chega como RASCUNHO: a pessoa escolhe o que aplicar.
 */
export type MapOp =
  | { op: "adicionar"; ref?: string; parent?: string; label: string; description?: string }
  | { op: "renomear"; target: string; label: string }
  | { op: "descrever"; target: string; description: string }
  | { op: "anotar"; target: string; kind: "comentario" | "observacao" | "citacao"; text: string; app?: string }
  | { op: "remover"; target: string }

export interface AiPlan {
  /** Resposta em texto (pergunta, análise, resumo). */
  answer?: string
  ops: MapOp[]
  /** Organizar em árvore depois de aplicar. */
  organize?: boolean
}

function buildRequestPrompt(r: AiMapRequest): string {
  return [
    "Você ajuda uma pequena empresa brasileira (2 sócios) a trabalhar num mapa mental de brainstorm.",
    `Mapa: "${r.mapTitle}". Balões (a numeração mostra quem é filho de quem):`,
    r.outline || "(mapa vazio)",
    "",
    `Pedido da pessoa: "${r.request}"`,
    "",
    "Atenda o pedido. Responda só com JSON neste formato:",
    '{"answer": "resposta curta, se for pergunta ou análise (senão vazio)", "ops": [ ... ], "organize": false}',
    "Operações possíveis em ops:",
    '- {"op":"adicionar","ref":"n1","parent":"1.2","label":"texto curto","description":"opcional"} — novo balão. "parent" é o número de um balão ou o "ref" de outro balão novo (para criar vários níveis). Sem "parent" = balão solto.',
    '- {"op":"renomear","target":"1.2","label":"novo texto"}',
    '- {"op":"descrever","target":"1.2","description":"explicação"}',
    '- {"op":"anotar","target":"1.2","kind":"comentario|observacao|citacao","text":"...","app":"Instagram"} — anotação escondida no balão; "citacao" é para apps/plataformas (use "app").',
    '- {"op":"remover","target":"1.2"} — SÓ se a pessoa pedir explicitamente para apagar.',
    'Use "organize": true se o pedido for para arrumar/organizar o mapa.',
    `Regras: textos curtos (balão até 8 palavras), concretos, sem repetir o que já existe, no máximo ${AI_LIMITS.ops} operações, só números que existem na lista. Escreva em português do Brasil.`,
  ].join("\n")
}

const NUMBER = /^\d+(\.\d+)*$/
const REF = /^n\d{1,3}$/
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

/** Lê o plano com desconfiança: só operações conhecidas, números/apelidos válidos, tamanhos cortados. */
export function parsePlan(raw: Record<string, unknown>): AiPlan | null {
  const ops: MapOp[] = []
  const refs = new Set<string>()
  for (const o of Array.isArray(raw.ops) ? raw.ops : []) {
    if (ops.length >= AI_LIMITS.ops) break
    if (!o || typeof o !== "object") continue
    const x = o as Record<string, unknown>
    const target = str(x.target, 40)
    if (x.op === "adicionar") {
      const label = str(x.label, AI_LIMITS.label)
      if (!label) continue
      const ref = REF.test(str(x.ref, 8)) ? str(x.ref, 8) : undefined
      const parent = str(x.parent, 40)
      // Pai: balão da lista ou balão novo criado ANTES nesta lista.
      const okParent = NUMBER.test(parent) || refs.has(parent) ? parent : undefined
      if (ref) refs.add(ref)
      const description = str(x.description, AI_LIMITS.description) || undefined
      ops.push({ op: "adicionar", label, ...(ref ? { ref } : {}), ...(okParent ? { parent: okParent } : {}), ...(description ? { description } : {}) })
    } else if (!NUMBER.test(target)) continue
    else if (x.op === "renomear") {
      const label = str(x.label, AI_LIMITS.label)
      if (label) ops.push({ op: "renomear", target, label })
    } else if (x.op === "descrever") {
      const description = str(x.description, AI_LIMITS.description)
      if (description) ops.push({ op: "descrever", target, description })
    } else if (x.op === "anotar") {
      const kind = x.kind === "observacao" || x.kind === "citacao" ? x.kind : "comentario"
      const text = str(x.text, AI_LIMITS.note)
      const app = kind === "citacao" ? str(x.app, 40) || undefined : undefined
      if (text || app) ops.push({ op: "anotar", target, kind, text, ...(app ? { app } : {}) })
    } else if (x.op === "remover") ops.push({ op: "remover", target })
  }
  const answer = str(raw.answer, AI_LIMITS.answer) || undefined
  const organize = raw.organize === true || undefined
  if (!answer && !ops.length && !organize) return null
  return { ...(answer ? { answer } : {}), ops, ...(organize ? { organize } : {}) }
}

/** `levels`: número da lista ("1.2") → nível visual (1 = maior). `plan`: pedido livre. */
export type AiResult = { items: string[] } | { summary: string } | { levels: Record<string, number> } | { plan: AiPlan }

/** Lê a resposta do modelo com desconfiança: formato, tamanho, repetidos e o que já existe. */
export function parseAiResult(action: AiAction, raw: unknown, existing: string[] = []): AiResult | null {
  const v = (typeof raw === "string" ? safeJson(raw) : raw) as Record<string, unknown> | null
  if (!v || typeof v !== "object") return null
  if (action === "resumir") {
    const s = typeof v.summary === "string" ? v.summary.trim() : ""
    return s ? { summary: s.slice(0, AI_LIMITS.summary) } : null
  }
  if (action === "pedido") {
    const plan = parsePlan(v)
    return plan ? { plan } : null
  }
  if (action === "hierarquia") {
    const raw = v.levels && typeof v.levels === "object" ? (v.levels as Record<string, unknown>) : {}
    const levels: Record<string, number> = {}
    for (const [k, n] of Object.entries(raw).slice(0, 300))
      if (/^\d+(\.\d+)*$/.test(k.trim()) && typeof n === "number" && Number.isFinite(n)) levels[k.trim()] = Math.min(12, Math.max(1, Math.round(n)))
    return Object.keys(levels).length ? { levels } : null
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
