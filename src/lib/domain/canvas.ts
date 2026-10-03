/**
 * Quadro infinito do mapa — regras puras (testadas em canvas.test.ts):
 * ampliação de cada item (zoom infinito), ampliar/reduzir um conjunto,
 * tamanho pela hierarquia, desenho à mão e camadas.
 */
import type { MindMapEdge, MindMapNode } from "./types"

// ---------- zoom infinito ----------

/** Limites do zoom da tela: na prática, infinito (1:500 até 500:1). */
export const ZOOM_LIMITS = { min: 0.002, max: 500 }

export const scaleOf = (n: Pick<MindMapNode, "scale">) => n.scale ?? 1

/** 3 algarismos significativos; perto de 1 vira "sem valor" (balão normal, nada a gravar). */
export function roundScale(s: number): number | undefined {
  if (!Number.isFinite(s) || s <= 0) return undefined
  const r = Number(s.toPrecision(3))
  return Math.abs(r - 1) < 0.02 ? undefined : r
}

/**
 * Ampliação de um item criado com a tela neste zoom: na tela ele aparece no
 * tamanho normal. Aproximou 10x → o balão nasce 10x menor ("dentro" da ideia).
 * Entre 70% e 140% de zoom o balão nasce normal.
 */
export function scaleForZoom(zoom: number): number | undefined {
  if (zoom >= 0.7 && zoom <= 1.4) return undefined
  return roundScale(1 / zoom)
}

/**
 * Espaço da grade de pontos que acompanha o zoom (como um quadro infinito):
 * na tela, os pontos ficam sempre entre ~16 e ~64 px de distância.
 */
export function gridGap(zoom: number, base = 20): number {
  const k = Math.round(Math.log(32 / (base * zoom)) / Math.log(4))
  return base * 4 ** k
}

// ---------- ampliar/reduzir um conjunto ----------

/** Item com o tamanho real na tela do mapa (medido). */
export interface SizedItem {
  id: string
  x: number
  y: number
  /** Tamanho medido (unidades do mapa). */
  w: number
  h: number
  scale?: number
  /** Tamanho fixo escolhido pelo usuário (se houver). */
  width?: number
  height?: number
}

export interface ScalePatch {
  id: string
  x: number
  y: number
  scale?: number
  width?: number
  height?: number
}

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Amplia (fator > 1) ou reduz (< 1) um conjunto inteiro em volta do centro dele:
 * posições, ampliação e tamanhos fixos andam juntos, então o desenho do conjunto
 * continua igual, só maior ou menor.
 */
export function scaleSet(items: SizedItem[], factor: number): ScalePatch[] {
  if (!items.length || !(factor > 0)) return []
  const minX = Math.min(...items.map((i) => i.x))
  const minY = Math.min(...items.map((i) => i.y))
  const cx = (minX + Math.max(...items.map((i) => i.x + i.w))) / 2
  const cy = (minY + Math.max(...items.map((i) => i.y + i.h))) / 2
  return items.map((i) => ({
    id: i.id,
    x: r1(cx + (i.x - cx) * factor),
    y: r1(cy + (i.y - cy) * factor),
    scale: roundScale((i.scale ?? 1) * factor),
    width: i.width ? r1(i.width * factor) : undefined,
    height: i.height ? r1(i.height * factor) : undefined,
  }))
}

/** Muda a ampliação de UM item mantendo o centro dele no mesmo lugar. */
export function rescaleAroundCenter(i: SizedItem, scale: number): ScalePatch {
  const f = scale / (i.scale ?? 1)
  const cx = i.x + i.w / 2
  const cy = i.y + i.h / 2
  return {
    id: i.id,
    x: r1(cx - (i.w * f) / 2),
    y: r1(cy - (i.h * f) / 2),
    scale: roundScale(scale),
    width: i.width ? r1(i.width * f) : undefined,
    height: i.height ? r1(i.height * f) : undefined,
  }
}

// ---------- tamanho pela hierarquia ----------

type Link = Pick<MindMapEdge, "source" | "target" | "kind">

/** Cada nível abaixo fica 20% menor. */
export const LEVEL_STEP = 0.8

/**
 * Dentro de um conjunto selecionado: quem é raiz (sem pai NO conjunto) e a que
 * profundidade está cada item, pelas linhas de hierarquia (relações não contam).
 */
export function levelsInSet(ids: string[], edges: Link[]) {
  const inSet = new Set(ids)
  const parent = new Map<string, string>()
  const children = new Map<string, string[]>()
  for (const e of edges) {
    if (e.kind === "relacao" || !inSet.has(e.source) || !inSet.has(e.target) || parent.has(e.target) || e.source === e.target) continue
    parent.set(e.target, e.source)
    children.set(e.source, [...(children.get(e.source) ?? []), e.target])
  }
  const out = new Map<string, { root: string; depth: number; parent?: string }>()
  const walk = (id: string, root: string, depth: number) => {
    if (out.has(id)) return
    out.set(id, { root, depth, parent: parent.get(id) })
    for (const c of children.get(id) ?? []) walk(c, root, depth + 1)
  }
  for (const id of ids) if (!parent.has(id)) walk(id, id, 0)
  // Sobras de ciclos: viram raízes.
  for (const id of ids) if (!out.has(id)) walk(id, id, 0)
  return out
}

/**
 * Nível visual final de cada item (1 = raiz). A IA pode sugerir níveis
 * (`suggested`), mas a hierarquia manda: o filho fica sempre 1 ou 2 níveis
 * abaixo do pai, nunca do mesmo tamanho ou maior. Sem sugestão: pai + 1.
 */
export function visualLevels(levels: Map<string, { depth: number; parent?: string }>, suggested: Map<string, number> = new Map()) {
  const out = new Map<string, number>()
  const order = [...levels.entries()].sort((a, b) => a[1].depth - b[1].depth)
  for (const [id, l] of order) {
    if (!l.parent || !out.has(l.parent)) {
      out.set(id, 1)
      continue
    }
    const p = out.get(l.parent)!
    const s = suggested.get(id)
    out.set(id, s === undefined ? p + 1 : Math.min(p + 2, Math.max(p + 1, Math.round(s))))
  }
  return out
}

/**
 * Redimensiona o conjunto pela hierarquia: cada raiz mantém o tamanho dela;
 * cada nível abaixo fica 20% menor. O centro de cada balão não sai do lugar.
 */
export function resizeByHierarchy(items: SizedItem[], edges: Link[], suggested?: Map<string, number>): ScalePatch[] {
  const levels = levelsInSet(items.map((i) => i.id), edges)
  const visual = visualLevels(levels, suggested)
  const byId = new Map(items.map((i) => [i.id, i]))
  return items.map((i) => {
    const root = byId.get(levels.get(i.id)!.root)!
    const target = (root.scale ?? 1) * LEVEL_STEP ** ((visual.get(i.id) ?? 1) - 1)
    return rescaleAroundCenter(i, target)
  })
}

// ---------- organizar em árvore ----------

/** Distâncias da árvore (multiplicadas pela ampliação do filho). */
export const TREE_GAP = { x: 90, y: 28 }

/**
 * Organiza o conjunto como árvore da esquerda para a direita, seguindo as linhas
 * de hierarquia: raiz → filhos → netos, cada ramo no seu "andar", sem sobrepor,
 * pai centralizado nos filhos. A ordem dos irmãos é a de cima para baixo atual.
 * A primeira raiz fica onde está (canto esquerdo e centro vertical); outras raízes
 * (itens sem pai no conjunto) vêm logo abaixo. Devolve a nova posição de cada item.
 */
export function tidyTree(items: SizedItem[], edges: Link[]): Map<string, { x: number; y: number }> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const levels = levelsInSet(items.map((i) => i.id), edges)
  const children = new Map<string, SizedItem[]>()
  for (const [id, l] of levels) if (l.parent) children.set(l.parent, [...(children.get(l.parent) ?? []), byId.get(id)!])
  const centerY = (i: SizedItem) => i.y + i.h / 2
  for (const list of children.values()) list.sort((a, b) => centerY(a) - centerY(b) || a.x - b.x)

  // Altura que cada ramo ocupa.
  const span = new Map<string, number>()
  const measure = (i: SizedItem): number => {
    const kids = children.get(i.id) ?? []
    const gap = TREE_GAP.y * (i.scale ?? 1)
    const kidsH = kids.reduce((acc, k) => acc + measure(k), 0) + gap * Math.max(0, kids.length - 1)
    const h = Math.max(i.h, kidsH)
    span.set(i.id, h)
    return h
  }

  const out = new Map<string, { x: number; y: number }>()
  const place = (i: SizedItem, x: number, top: number) => {
    const h = span.get(i.id)!
    out.set(i.id, { x: r1(x), y: r1(top + (h - i.h) / 2) })
    const kids = children.get(i.id) ?? []
    const kidsH = kids.reduce((acc, k) => acc + span.get(k.id)!, 0) + TREE_GAP.y * (i.scale ?? 1) * Math.max(0, kids.length - 1)
    let y = top + (h - kidsH) / 2
    for (const k of kids) {
      place(k, x + i.w + TREE_GAP.x * (k.scale ?? 1), y)
      y += span.get(k.id)! + TREE_GAP.y * (i.scale ?? 1)
    }
  }

  const roots = items.filter((i) => !levels.get(i.id)?.parent).sort((a, b) => centerY(a) - centerY(b) || a.x - b.x)
  if (!roots.length) return out
  for (const r of roots) measure(r)
  const first = roots[0]
  let top = centerY(first) - span.get(first.id)! / 2
  for (const r of roots) {
    place(r, first.x, top)
    top += span.get(r.id)! + TREE_GAP.y * 2 * (first.scale ?? 1)
  }
  return out
}

/**
 * "Organizar": tamanho pela importância (hierarquia + sugestão da IA) e depois
 * a árvore arrumada com os tamanhos novos. Uma única mudança (um Ctrl+Z desfaz).
 */
export function organize(items: SizedItem[], edges: Link[], suggested?: Map<string, number>): ScalePatch[] {
  const sizedPatches = resizeByHierarchy(items, edges, suggested)
  const resized: SizedItem[] = items.map((i, k) => {
    const p = sizedPatches[k]
    const f = (p.scale ?? 1) / (i.scale ?? 1)
    return { ...i, w: i.w * f, h: i.h * f, scale: p.scale, width: p.width, height: p.height }
  })
  const pos = tidyTree(resized, edges)
  return sizedPatches.map((p) => ({ ...p, ...(pos.get(p.id) ?? {}) }))
}

// ---------- desenho à mão ----------

/** Limites do traço: cabe com folga no registro do balão no banco. */
export const DRAW_LIMITS = { points: 1200 }

type Pt = { x: number; y: number }

/** Ramer–Douglas–Peucker: tira pontos quase em linha reta (traço leve, mesmo desenho). */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const A = points[a]
    const B = points[b]
    const dx = B.x - A.x
    const dy = B.y - A.y
    const len = Math.hypot(dx, dy) || 1
    let max = 0
    let idx = -1
    for (let i = a + 1; i < b; i++) {
      const P = points[i]
      const d = dx === 0 && dy === 0 ? Math.hypot(P.x - A.x, P.y - A.y) : Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len
      if (d > max) {
        max = d
        idx = i
      }
    }
    if (max > tolerance && idx > 0) {
      keep[idx] = 1
      stack.push([a, idx], [idx, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * Traço feito na tela (pontos no mapa) → item "drawing". A ampliação é a do zoom
 * no momento, então os pontos ficam em "pixels da tela" (inteiros, leves).
 */
export function drawingFromStroke(flowPoints: Pt[], zoom: number, strokePx = 3) {
  if (flowPoints.length < 2) return null
  const scale = scaleForZoom(zoom) ?? 1
  const minX = Math.min(...flowPoints.map((p) => p.x))
  const minY = Math.min(...flowPoints.map((p) => p.y))
  const local = flowPoints.map((p) => ({ x: Math.round((p.x - minX) / scale), y: Math.round((p.y - minY) / scale) }))
  let pts = simplify(local, 1)
  for (let tol = 2; pts.length > DRAW_LIMITS.points; tol *= 2) pts = simplify(local, tol)
  return {
    x: r1(minX - (strokePx / 2) * scale),
    y: r1(minY - (strokePx / 2) * scale),
    scale: roundScale(scale),
    stroke: strokePx,
    // Folga de meia espessura para o traço não ser cortado na borda.
    path: pts.flatMap((p) => [p.x + strokePx / 2, p.y + strokePx / 2]),
  }
}

/** Tamanho do desenho em unidades locais (antes da ampliação). */
export function pathBox(path: number[], stroke = 3) {
  let w = 0
  let h = 0
  for (let i = 0; i < path.length; i += 2) {
    w = Math.max(w, path[i])
    h = Math.max(h, path[i + 1])
  }
  return { width: w + stroke / 2, height: h + stroke / 2 }
}

/** Caminho SVG suave (curvas pelos pontos médios). */
export function pathD(path: number[]) {
  if (path.length < 4) return ""
  const p = (i: number) => `${path[i]},${path[i + 1]}`
  let d = `M ${p(0)}`
  for (let i = 2; i < path.length - 2; i += 2) {
    const mx = (path[i] + path[i + 2]) / 2
    const my = (path[i + 1] + path[i + 3]) / 2
    d += ` Q ${p(i)} ${mx},${my}`
  }
  return `${d} L ${p(path.length - 2)}`
}

// ---------- camadas (como no Canva) ----------

/** Camada padrão: grupos atrás de tudo, textos/desenhos no fundo, balões na frente. */
export function defaultZ(type: MindMapNode["type"]) {
  return type === "group" ? -2 : type === "text" || type === "drawing" ? -1 : 0
}

export const zOf = (n: Pick<MindMapNode, "z" | "type">) => n.z ?? defaultZ(n.type)

export type LayerMove = "frente" | "avancar" | "recuar" | "tras"

export const LAYER_MOVES: { id: LayerMove; label: string; hint: string }[] = [
  { id: "frente", label: "Trazer para a frente", hint: "Na frente de tudo" },
  { id: "avancar", label: "Avançar", hint: "Uma camada para a frente" },
  { id: "recuar", label: "Recuar", hint: "Uma camada para trás" },
  { id: "tras", label: "Enviar para trás", hint: "Atrás de tudo (fundo do quadro)" },
]

/** Nova camada dos itens escolhidos. Os outros não mudam. */
export function moveLayer(all: Pick<MindMapNode, "id" | "z" | "type">[], ids: Set<string>, move: LayerMove): Map<string, number> {
  const others = all.filter((n) => !ids.has(n.id)).map(zOf)
  const top = others.length ? Math.max(...others) : 0
  const bottom = others.length ? Math.min(...others) : 0
  const out = new Map<string, number>()
  for (const n of all) {
    if (!ids.has(n.id)) continue
    const z = zOf(n)
    out.set(n.id, move === "frente" ? top + 1 : move === "tras" ? bottom - 1 : move === "avancar" ? z + 1 : z - 1)
  }
  return out
}
