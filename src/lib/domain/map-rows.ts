import type { MindMap, MindMapEdge, MindMapNode } from "./types"

/**
 * Mapa guardado em 1 registro por balão (map_nodes) e por linha (map_edges).
 * Cada sócio grava só o que mudou: editar um balão não sobrescreve o do outro.
 *
 * Mapas antigos têm tudo em mind_maps.data (nodes/edges). Ao abrir, são copiados
 * para as linhas com os MESMOS ids e o mapa ganha `storage: "rows"`. O jsonb
 * antigo fica intacto como backup.
 */
export interface MapNodeRow {
  id: string
  mapId: string
  node: MindMapNode
  updatedAt?: string
}

export interface MapEdgeRow {
  id: string
  mapId: string
  edge: MindMapEdge
  updatedAt?: string
}

/** Id da linha no banco: único mesmo que dois mapas usem o mesmo id de balão (templates). */
export const rowId = (mapId: string, itemId: string) => `${mapId}~${itemId}`

export const isRowMap = (map: Pick<MindMap, "storage">) => map.storage === "rows"

export function nodeRow(mapId: string, node: MindMapNode): MapNodeRow {
  return { id: rowId(mapId, node.id), mapId, node: clean(node) }
}

export function edgeRow(mapId: string, edge: MindMapEdge): MapEdgeRow {
  return { id: rowId(mapId, edge.id), mapId, edge: clean(edge) }
}

/** Linhas que um mapa antigo (jsonb) precisa ganhar. Idempotente: mesmos ids sempre. */
export function migrationRows(map: MindMap) {
  return {
    nodes: map.nodes.map((n) => nodeRow(map.id, n)),
    edges: map.edges.map((e) => edgeRow(map.id, e)),
  }
}

/** Mapa como as telas enxergam: das linhas (novo) ou do jsonb (antigo/backup). */
export function resolveMaps(maps: MindMap[], nodes: MapNodeRow[], edges: MapEdgeRow[]): MindMap[] {
  if (!maps.some(isRowMap)) return maps
  const byMapNodes = group(nodes)
  const byMapEdges = group(edges)
  return maps.map((m) => {
    if (!isRowMap(m)) return m
    const ns = (byMapNodes.get(m.id) ?? []).map((r) => r.node)
    const ids = new Set(ns.map((n) => n.id))
    // Linha órfã (balão apagado por um, linha criada pelo outro) não aparece solta.
    const es = (byMapEdges.get(m.id) ?? []).map((r) => r.edge).filter((e) => ids.has(e.source) && ids.has(e.target))
    // "Editado há…" = a última gravação de qualquer balão/linha.
    let updatedAt = m.updatedAt
    for (const r of [...(byMapNodes.get(m.id) ?? []), ...(byMapEdges.get(m.id) ?? [])]) if (r.updatedAt && r.updatedAt > updatedAt) updatedAt = r.updatedAt
    return { ...m, nodes: ns, edges: es, updatedAt }
  })
}

/** Assinatura estável de um balão/linha (para saber o que mudou). */
export const signature = (x: MindMapNode | MindMapEdge) => JSON.stringify(clean(x), Object.keys(clean(x)).sort())

/**
 * O que gravar: itens novos ou alterados desde a última gravação e ids que sumiram.
 * `saved` = id → assinatura do que já está no banco.
 */
export function diffItems<T extends MindMapNode | MindMapEdge>(saved: Map<string, string>, current: T[]) {
  const upsert = current.filter((x) => saved.get(x.id) !== signature(x))
  const ids = new Set(current.map((x) => x.id))
  const remove = [...saved.keys()].filter((id) => !ids.has(id))
  return { upsert, remove }
}

function group<R extends { mapId: string }>(rows: R[]) {
  const out = new Map<string, R[]>()
  for (const r of rows) {
    const list = out.get(r.mapId)
    if (list) list.push(r)
    else out.set(r.mapId, [r])
  }
  return out
}

/** Sem chaves `undefined` (o jsonb não as guarda; comparar com e sem daria "mudou"). */
function clean<T extends object>(x: T): T {
  return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as T
}
