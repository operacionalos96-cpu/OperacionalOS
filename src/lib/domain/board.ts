/**
 * Mapas: dois modos sobre o mesmo armazenamento (map_nodes / map_edges).
 *
 * - "lousa": quadro livre (desenho, texto, formas, notas, imagens, molduras e setas).
 * - "estruturado": mapa de ideias em árvore/fluxo, com modelos e balões tipados.
 *
 * Regras puras (sem React), testadas em board.test.ts: cores, tamanhos, escolha do
 * lado da conexão, vínculos com tarefas/leads/produtos, busca, exportar/importar
 * (recuperação) e limites de imagem.
 */
import type { EntityRef } from "@/lib/entities/types"
import type { MindMap, MindMapEdge, MindMapNode } from "./types"

export type BoardMode = "lousa" | "estruturado"

export const BOARD_MODES: { id: BoardMode; label: string; short: string; description: string }[] = [
  {
    id: "lousa",
    label: "Lousa livre",
    short: "Lousa",
    description: "Desenhe, escreva, cole imagens e ligue tudo com setas. Para brainstorm, rascunho e reunião.",
  },
  {
    id: "estruturado",
    label: "Mapa estruturado",
    short: "Mapa",
    description: "Ideias em árvore ou fluxo, com modelos, tipos de balão e andamento ligados às tarefas.",
  },
]

/** Mapas criados antes do campo `mode` são estruturados. */
export const boardMode = (m: Pick<MindMap, "mode">): BoardMode => m.mode ?? "estruturado"

// ---------- elementos da lousa ----------

export type BoardShape = NonNullable<MindMapNode["shape"]>

/** Tamanho inicial de cada elemento (unidades do quadro). Grandes de propósito: legíveis em 100%. */
export const ELEMENT_SIZE = {
  rect: { width: 220, height: 120 },
  ellipse: { width: 220, height: 130 },
  diamond: { width: 200, height: 150 },
  sticky: { width: 200, height: 180 },
  frame: { width: 520, height: 340 },
} as const

export const FONT_SIZES = [
  { id: 14, label: "P" },
  { id: 18, label: "M" },
  { id: 24, label: "G" },
  { id: 34, label: "GG" },
] as const
export const DEFAULT_FONT = 18
export const TEXT_FONT = 24

/** Matizes da paleta (sem valor = neutro, cor do texto do tema). */
export const BOARD_HUES = [25, 75, 150, 210, 250, 310] as const

export const HUE_NAMES: Record<number, string> = { 25: "Vermelho", 75: "Amarelo", 150: "Verde", 210: "Azul", 250: "Roxo", 310: "Rosa" }

/**
 * Cores de um elemento. `ink` = texto/traço; `stroke` = contorno; `fill` = fundo.
 * O contorno é sempre forte (≥ 3:1 sobre o fundo do quadro nos dois temas);
 * o texto de nota é sempre escuro sobre fundo claro.
 */
export function boardColor(hue: number | undefined, role: "ink" | "stroke" | "fill" | "solid" | "onSolid"): string {
  const neutral = hue === undefined
  switch (role) {
    case "ink":
      return neutral ? "var(--foreground)" : `oklch(0.66 0.19 ${hue})`
    case "stroke":
      return neutral ? "color-mix(in oklab, var(--foreground) 78%, transparent)" : `oklch(0.62 0.2 ${hue})`
    case "fill":
      return neutral ? "color-mix(in oklab, var(--foreground) 6%, var(--card))" : `oklch(0.62 0.17 ${hue} / 0.2)`
    case "solid":
      return neutral ? "oklch(0.9 0.02 95)" : `oklch(0.88 0.11 ${hue})`
    case "onSolid":
      return "oklch(0.24 0.03 270)"
  }
}

// ---------- conexões ----------

type Rect = { x: number; y: number; width: number; height: number }
export type Side = "l" | "r" | "t" | "b"

/**
 * Lados em que a seta sai e entra, olhando só a posição relativa dos centros:
 * mais "ao lado" → esquerda/direita; mais "acima/abaixo" → topo/base.
 */
export function pickSides(a: Rect, b: Rect): { source: Side; target: Side } {
  const dx = b.x + b.width / 2 - (a.x + a.width / 2)
  const dy = b.y + b.height / 2 - (a.y + a.height / 2)
  if (Math.abs(dx) * 0.7 >= Math.abs(dy)) return dx >= 0 ? { source: "r", target: "l" } : { source: "l", target: "r" }
  return dy >= 0 ? { source: "b", target: "t" } : { source: "t", target: "b" }
}

export const ROUTES: { id: NonNullable<MindMapEdge["route"]>; label: string }[] = [
  { id: "curva", label: "Curva" },
  { id: "reta", label: "Reta" },
  { id: "angulo", label: "Ângulo" },
]

// ---------- vínculos com o resto do OS ----------

/** O que este elemento liga: tarefa, lead (venda) e o `ref` (produto, meta, conteúdo, nota, outro mapa…). */
export function linksOf(n: Pick<MindMapNode, "taskId" | "leadId" | "ref">): EntityRef[] {
  const out: EntityRef[] = []
  if (n.taskId) out.push({ type: "task", id: n.taskId })
  if (n.leadId) out.push({ type: "lead", id: n.leadId })
  if (n.ref) out.push({ type: n.ref.type, id: n.ref.id })
  return out
}

/** Mapas (e quais elementos) que citam uma entidade: base do "Aparece em…" nas telas de tarefa, produto e meta. */
export function mapsLinkedTo(maps: Pick<MindMap, "id" | "title" | "nodes" | "mode">[], ref: EntityRef) {
  const out: { mapId: string; title: string; mode: BoardMode; nodeIds: string[] }[] = []
  for (const m of maps) {
    const nodeIds = m.nodes.filter((n) => linksOf(n).some((r) => r.type === ref.type && r.id === ref.id)).map((n) => n.id)
    if (nodeIds.length) out.push({ mapId: m.id, title: m.title, mode: boardMode(m), nodeIds })
  }
  return out
}

// ---------- resumo e busca ----------

const ELEMENT_LABEL: Record<string, string> = {
  shape: "forma",
  sticky: "nota",
  text: "texto",
  drawing: "desenho",
  image: "imagem",
  group: "moldura",
}

export function boardStats(map: Pick<MindMap, "nodes" | "edges">) {
  const counts: Record<string, number> = {}
  let linked = 0
  for (const n of map.nodes) {
    const k = n.type ?? "ideia"
    counts[k] = (counts[k] ?? 0) + 1
    if (linksOf(n).length) linked++
  }
  return { total: map.nodes.length, connections: map.edges.length, linked, counts }
}

/** "3 notas · 2 formas · 1 desenho": só o que existe. */
export function statsText(map: Pick<MindMap, "nodes" | "edges">) {
  const { counts } = boardStats(map)
  const parts: string[] = []
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  if (counts.sticky) parts.push(plural(counts.sticky, "nota", "notas"))
  if (counts.shape) parts.push(plural(counts.shape, "forma", "formas"))
  if (counts.text) parts.push(plural(counts.text, "texto", "textos"))
  if (counts.image) parts.push(plural(counts.image, "imagem", "imagens"))
  if (counts.drawing) parts.push(plural(counts.drawing, "desenho", "desenhos"))
  if (counts.group) parts.push(plural(counts.group, "moldura", "molduras"))
  if (counts.ideia) parts.push(plural(counts.ideia, "balão", "balões"))
  return parts.join(" · ")
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** Busca por texto nos elementos (sem acento/maiúscula). Vazio = nada. */
export function searchBoard(nodes: Pick<MindMapNode, "id" | "label" | "type" | "description">[], query: string) {
  const q = fold(query.trim())
  if (!q) return []
  return nodes
    .filter((n) => n.label.trim() && fold(`${n.label} ${n.description ?? ""}`).includes(q))
    .map((n) => ({ id: n.id, label: n.label, kind: ELEMENT_LABEL[n.type ?? ""] ?? "balão" }))
}

/** Retângulo que envolve os elementos (para enquadrar). */
export function boundsOf(nodes: Pick<MindMapNode, "x" | "y" | "width" | "height">[], fallback = { width: 200, height: 100 }) {
  if (!nodes.length) return null
  const x1 = Math.min(...nodes.map((n) => n.x))
  const y1 = Math.min(...nodes.map((n) => n.y))
  const x2 = Math.max(...nodes.map((n) => n.x + (n.width ?? fallback.width)))
  const y2 = Math.max(...nodes.map((n) => n.y + (n.height ?? fallback.height)))
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

// ---------- imagens ----------

/**
 * O registro de um elemento no banco aceita menos de 64 KB (check em map_nodes.data).
 * A imagem entra reduzida (JPEG/WebP) para caber; arquivo maior que isso deve ir
 * para o Storage (etapa 2 do plano) e o elemento guarda só a URL.
 */
export const IMAGE_LIMITS = { maxSide: 960, maxBytes: 44_000, minSide: 160 }

/** Dimensão final mantendo a proporção, sem ampliar. */
export function fitImage(w: number, h: number, maxSide = IMAGE_LIMITS.maxSide) {
  if (!(w > 0) || !(h > 0)) return { width: 0, height: 0 }
  const k = Math.min(1, maxSide / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

/** Tamanho com que a imagem aparece no quadro (largura máx. 360, proporção mantida). */
export function displaySize(w: number, h: number, maxWidth = 360) {
  if (!(w > 0) || !(h > 0)) return { width: maxWidth, height: Math.round(maxWidth * 0.66) }
  const k = Math.min(1, maxWidth / w)
  return { width: Math.round(w * k), height: Math.round(h * k) }
}

/** Bytes de uma data URL base64 (aproximado pelo texto). */
export const dataUrlBytes = (src: string) => src.length

// ---------- exportar e importar (recuperação) ----------

export const BOARD_FORMAT = "operacionalos.board"
export const BOARD_VERSION = 1
const MAX_ELEMENTS = 3000

export interface BoardFile {
  format: typeof BOARD_FORMAT
  version: number
  exportedAt: string
  title: string
  mode: BoardMode
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}

export function exportBoard(map: Pick<MindMap, "title" | "mode" | "nodes" | "edges">, now = new Date()): BoardFile {
  return { format: BOARD_FORMAT, version: BOARD_VERSION, exportedAt: now.toISOString(), title: map.title, mode: boardMode(map), nodes: map.nodes, edges: map.edges }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v)

/**
 * Lê um arquivo exportado. Tolerante: descarta elementos inválidos e ligações órfãs,
 * mas recusa o que não é uma lousa/mapa nosso ou veio de uma versão mais nova.
 */
export function parseBoard(input: unknown): { ok: true; board: Omit<BoardFile, "exportedAt">; dropped: number } | { ok: false; error: string } {
  if (!isObj(input) || input.format !== BOARD_FORMAT) return { ok: false, error: "Este arquivo não é uma lousa ou mapa do Operacional OS." }
  if (!num(input.version) || (input.version as number) > BOARD_VERSION) return { ok: false, error: "O arquivo vem de uma versão mais nova do app." }
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) return { ok: false, error: "O arquivo está incompleto." }
  if (input.nodes.length > MAX_ELEMENTS) return { ok: false, error: `Elementos demais (limite ${MAX_ELEMENTS}).` }
  const seen = new Set<string>()
  const nodes: MindMapNode[] = []
  let dropped = 0
  for (const raw of input.nodes) {
    if (!isObj(raw) || typeof raw.id !== "string" || !raw.id || seen.has(raw.id) || !num(raw.x) || !num(raw.y) || typeof raw.label !== "string") {
      dropped++
      continue
    }
    seen.add(raw.id)
    nodes.push(raw as unknown as MindMapNode)
  }
  const edges: MindMapEdge[] = []
  const edgeIds = new Set<string>()
  for (const raw of input.edges) {
    if (isObj(raw) && typeof raw.id === "string" && !edgeIds.has(raw.id) && typeof raw.source === "string" && typeof raw.target === "string" && seen.has(raw.source) && seen.has(raw.target)) {
      edgeIds.add(raw.id)
      edges.push(raw as unknown as MindMapEdge)
    } else dropped++
  }
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : "Mapa importado"
  const mode: BoardMode = input.mode === "lousa" ? "lousa" : "estruturado"
  return { ok: true, board: { format: BOARD_FORMAT, version: BOARD_VERSION, title, mode, nodes, edges }, dropped }
}
