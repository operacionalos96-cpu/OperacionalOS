/** Status dos itens do mapa mental. Funções puras, testadas em mindmap.test.ts. */
import { differenceInCalendarDays, parseISO } from "date-fns"
import type { MindMap, MindMapEdge, MindMapNode, Task } from "./types"

export type NodeStatus = "afazer" | "andamento" | "feito"

export const NODE_STATUS: Record<NodeStatus, { label: string; next: NodeStatus }> = {
  afazer: { label: "A fazer", next: "andamento" },
  andamento: { label: "Em andamento", next: "feito" },
  feito: { label: "Feito", next: "afazer" },
}

type TaskLike = Pick<Task, "id" | "done" | "doneAt" | "status" | "recurrence" | "seriesId" | "dueDate" | "createdAt">

const sameDay = (iso: string | undefined, now: Date) => !!iso && differenceInCalendarDays(now, parseISO(iso)) === 0

/**
 * Tarefa vinculada a um item, entendendo recorrência: uma tarefa diária vira uma
 * nova tarefa a cada conclusão (mesma "série"). O item acompanha a série:
 * `task` = ocorrência atual (a próxima em aberto), `doneToday` = já fez a de hoje.
 */
export function resolveLinkedTask<T extends TaskLike>(taskId: string | undefined, tasks: T[], now: Date) {
  if (!taskId) return null
  const base = tasks.find((t) => t.id === taskId)
  if (!base) return null
  const series = base.seriesId ?? base.id
  const members = tasks.filter((t) => t.id === series || t.seriesId === series)
  const recurring = !!base.recurrence || members.some((t) => t.recurrence)
  if (!recurring) return { task: base, recurring: false, doneToday: false }
  const open = members.filter((t) => !t.done).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0]
  const doneTodayTask = members.find((t) => t.done && sameDay(t.doneAt, now))
  return { task: open ?? base, recurring: true, doneToday: !!doneTodayTask, doneTodayTask }
}

/** Status da tarefa: feita / em andamento / a fazer. */
export function taskStatus(t: Pick<Task, "done" | "status">): NodeStatus {
  return t.done ? "feito" : t.status === "andamento" ? "andamento" : "afazer"
}

/** Status efetivo do item. Com tarefa vinculada, quem manda é a tarefa (ou a série, se for recorrente). */
export function nodeStatus(node: Pick<MindMapNode, "status" | "taskId">, tasks: TaskLike[], now = new Date()): NodeStatus {
  const linked = resolveLinkedTask(node.taskId, tasks, now)
  if (linked) return linked.recurring && linked.doneToday ? "feito" : taskStatus(linked.task)
  return node.status ?? "afazer"
}

/** Progresso do mapa: itens com texto (ignora itens vazios). */
export function mapProgress(map: Pick<MindMap, "nodes">, tasks: TaskLike[], now = new Date()) {
  const nodes = ideaNodes(map.nodes).filter((n) => n.label.trim())
  const counts = { afazer: 0, andamento: 0, feito: 0 }
  for (const n of nodes) counts[nodeStatus(n, tasks, now)]++
  return { ...counts, total: nodes.length, pct: nodes.length ? counts.feito / nodes.length : 0 }
}

/**
 * Maior fonte (px) em que título + descrição cabem no balão redimensionado.
 * O texto passa a "preencher" a caixa: qualquer aumento do balão já aumenta a letra.
 * Estimativa por largura média de caractere (sem medir o DOM, para ser instantâneo).
 */
export function fitFontSize(box: { width: number; height: number }, text: { title: string; description?: string; extraTop?: number; extraBottom?: number }) {
  const innerW = Math.max(40, box.width - 56) // px-7 dos dois lados
  const innerH = Math.max(20, box.height - 16 - (text.extraTop ?? 0) - (text.extraBottom ?? 0))
  const lines = (s: string, perLine: number) => s.split("\n").reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / perLine)), 0)
  for (let fs = 64; fs > 12; fs--) {
    const titleLines = lines(text.title || " ", Math.max(1, Math.floor(innerW / (0.56 * fs))))
    let h = titleLines * fs * 1.2
    if (text.description) {
      const dfs = fs * 0.62
      h += 4 + lines(text.description, Math.max(1, Math.floor(innerW / (0.52 * dfs)))) * dfs * 1.4
    }
    if (h <= innerH) return fs
  }
  return 12
}

// ---------- tipos de balão ----------

export type NodeKind = "ideia" | "projeto" | "tarefa" | "venda" | "cliente" | "produto" | "meta" | "decisao" | "resumo"

/** Ordem = ordem no seletor e no contador. `plural` para "4 tarefas · 2 ideias". */
export const NODE_KINDS: { id: NodeKind; label: string; plural: string; hint: string }[] = [
  { id: "ideia", label: "Ideia", plural: "ideias", hint: "Algo a pensar ou explorar" },
  { id: "projeto", label: "Projeto", plural: "projetos", hint: "Agrupa várias entregas" },
  { id: "tarefa", label: "Tarefa", plural: "tarefas", hint: "Algo a fazer (ligue a uma tarefa)" },
  { id: "venda", label: "Venda", plural: "vendas", hint: "Oportunidade (ligue a um lead)" },
  { id: "cliente", label: "Cliente", plural: "clientes", hint: "Quem já comprou" },
  { id: "produto", label: "Produto", plural: "produtos", hint: "O que vendemos" },
  { id: "meta", label: "Meta", plural: "metas", hint: "Resultado que queremos alcançar" },
  { id: "decisao", label: "Decisão", plural: "decisões", hint: "O que foi decidido e por quê" },
  { id: "resumo", label: "Resumo", plural: "resumos", hint: "Conclusão de uma parte do mapa" },
]

export const NODE_KIND = Object.fromEntries(NODE_KINDS.map((k) => [k.id, k])) as Record<NodeKind, (typeof NODE_KINDS)[number]>

/**
 * Tipo do balão. Escolhido à mão vence; sem escolha, vem do vínculo:
 * tarefa ligada → Tarefa, lead ligado → Venda (ou Cliente, se o lead foi ganho).
 */
export function nodeKind(node: Pick<MindMapNode, "kind" | "taskId" | "leadId" | "ref">, leadStage?: string): NodeKind {
  if (node.kind) return node.kind
  if (node.taskId) return "tarefa"
  if (node.ref?.type === "product") return "produto"
  if (node.leadId) return leadStage === "ganho" ? "cliente" : "venda"
  return "ideia"
}

/** "4 tarefas · 2 ideias · 1 venda": só tipos presentes, na ordem de NODE_KINDS. */
export function kindCounts(nodes: Pick<MindMapNode, "kind" | "taskId" | "leadId" | "label" | "type" | "ref">[], leadStage: (leadId: string) => string | undefined = () => undefined) {
  const counts = new Map<NodeKind, number>()
  for (const n of ideaNodes(nodes)) {
    if (!n.label.trim()) continue
    const k = nodeKind(n, n.leadId ? leadStage(n.leadId) : undefined)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return NODE_KINDS.filter((k) => counts.has(k.id)).map((k) => ({ ...k, count: counts.get(k.id)! }))
}

// ---------- grupos (áreas) ----------

/** Grupo = área visual com título (um registro a mais no mapa, `type: "group"`). */
export const isArea = (n: Pick<MindMapNode, "type">) => n.type === "group"

/** Texto solto ou desenho no fundo do quadro: decoração, não é ideia (não conta, não vai para a IA). */
export const isDecor = (n: Pick<MindMapNode, "type">) => n.type === "text" || n.type === "drawing"

/** Só os balões (sem áreas, textos soltos e desenhos) — para contar, progresso, prévia. */
export const ideaNodes = <T extends Pick<MindMapNode, "type">>(nodes: T[]) => nodes.filter((n) => !isArea(n) && !isDecor(n))

type Box = { id: string; x: number; y: number; width: number; height: number }

/** Balões cujo CENTRO está dentro da área: são os que andam junto com ela. */
export function membersOf(area: Box, boxes: Box[]) {
  return boxes
    .filter((b) => b.id !== area.id)
    .filter((b) => {
      const cx = b.x + b.width / 2
      const cy = b.y + b.height / 2
      return cx >= area.x && cx <= area.x + area.width && cy >= area.y && cy <= area.y + area.height
    })
    .map((b) => b.id)
}

/** Área que envolve os balões escolhidos, com folga (em cima, espaço para o título). */
export function areaAround(boxes: Box[], pad = 32, titleSpace = 40) {
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.width))
  const maxY = Math.max(...boxes.map((b) => b.y + b.height))
  return {
    x: Math.round(minX - pad),
    y: Math.round(minY - pad - titleSpace),
    width: Math.round(maxX - minX + pad * 2),
    height: Math.round(maxY - minY + pad * 2 + titleSpace),
  }
}

// ---------- ramos: recolher e foco ----------

type Link = Pick<MindMapEdge, "source" | "target" | "kind">
const hierarchy = (edges: Link[]) => edges.filter((e) => e.kind !== "relacao")

/** Todos abaixo do item (filhos, netos…) pela hierarquia. Seguro contra ciclos. */
export function descendants(id: string, edges: Link[]): Set<string> {
  const children = new Map<string, string[]>()
  for (const e of hierarchy(edges)) children.set(e.source, [...(children.get(e.source) ?? []), e.target])
  const out = new Set<string>()
  const stack = [...(children.get(id) ?? [])]
  while (stack.length) {
    const n = stack.pop()!
    if (n === id || out.has(n)) continue
    out.add(n)
    stack.push(...(children.get(n) ?? []))
  }
  return out
}

/** Caminho até a raiz (pai, avô…). */
export function ancestors(id: string, edges: Link[]): Set<string> {
  const parent = new Map(hierarchy(edges).map((e) => [e.target, e.source]))
  const out = new Set<string>()
  let cur = parent.get(id)
  while (cur && cur !== id && !out.has(cur)) {
    out.add(cur)
    cur = parent.get(cur)
  }
  return out
}

/** Itens escondidos porque algum item acima deles está recolhido. */
export function hiddenByCollapse(nodes: Pick<MindMapNode, "id" | "collapsed">[], edges: Link[]): Set<string> {
  const out = new Set<string>()
  for (const n of nodes) if (n.collapsed) for (const d of descendants(n.id, edges)) if (d !== n.id) out.add(d)
  return out
}

/** Modo foco: o item, tudo abaixo dele e o caminho até a raiz. O resto esmaece. */
export function focusSet(id: string, edges: Link[]): Set<string> {
  return new Set([id, ...descendants(id, edges), ...ancestors(id, edges)])
}

// ---------- lista (outline) e apresentação ----------

export interface OutlineRow<N> {
  node: N
  depth: number
  /** "1", "1.2", "1.2.3" */
  number: string
  parentId?: string
}

/**
 * O mapa como lista numerada: raízes (sem pai na hierarquia) de cima para baixo,
 * filhos logo abaixo de cada item, na ordem em que aparecem no mapa (y, depois x).
 * Áreas (grupos) ficam de fora. Ciclos não travam: cada item aparece uma vez.
 */
export function outline<N extends Pick<MindMapNode, "id" | "x" | "y" | "type">>(nodes: N[], edges: Link[]): OutlineRow<N>[] {
  const ideas = ideaNodes(nodes)
  const byId = new Map(ideas.map((n) => [n.id, n]))
  const order = (a: N, b: N) => a.y - b.y || a.x - b.x
  const children = new Map<string, N[]>()
  const hasParent = new Set<string>()
  for (const e of hierarchy(edges)) {
    const child = byId.get(e.target)
    if (!child || !byId.has(e.source) || hasParent.has(e.target)) continue
    hasParent.add(e.target)
    children.set(e.source, [...(children.get(e.source) ?? []), child])
  }
  const out: OutlineRow<N>[] = []
  const seen = new Set<string>()
  const walk = (n: N, depth: number, number: string, parentId?: string) => {
    if (seen.has(n.id)) return
    seen.add(n.id)
    out.push({ node: n, depth, number, parentId })
    ;[...(children.get(n.id) ?? [])].sort(order).forEach((c, i) => walk(c, depth + 1, `${number}.${i + 1}`, n.id))
  }
  let root = 0
  for (const n of ideas.filter((x) => !hasParent.has(x.id)).sort(order)) walk(n, 0, String(++root))
  // Sobras de ciclos (todos têm pai): entram como raízes no fim.
  for (const n of [...ideas].sort(order)) if (!seen.has(n.id)) walk(n, 0, String(++root))
  return out
}
