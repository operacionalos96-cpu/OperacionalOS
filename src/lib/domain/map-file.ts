import type { MindMapEdge, MindMapNode } from "./types"

export interface MapFilePayload {
  format?: "operacionalos-map"
  version?: number
  title?: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
}

/** Valida o formato JSON antes de substituir o conteúdo de um mapa. */
export function parseMapFile(value: unknown): MapFilePayload {
  if (!value || typeof value !== "object") throw new Error("Arquivo inválido")
  const candidate = value as { format?: unknown; version?: unknown; nodes?: unknown; edges?: unknown; title?: unknown }
  if (candidate.format !== undefined && candidate.format !== "operacionalos-map") throw new Error("Formato de arquivo não reconhecido")
  if (candidate.version !== undefined && candidate.version !== 1) throw new Error("Versão de arquivo não suportada")
  if (!Array.isArray(candidate.nodes) || !Array.isArray(candidate.edges)) {
    throw new Error("O arquivo precisa conter listas de nós e conexões")
  }
  if (candidate.nodes.length > 5000 || candidate.edges.length > 10000) {
    throw new Error("O mapa ultrapassa o limite de 5.000 nós ou 10.000 conexões")
  }

  const nodeIds = new Set<string>()
  const nodes = candidate.nodes.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Nó inválido no arquivo")
    const node = raw as Partial<MindMapNode>
    if (
      typeof node.id !== "string" || !node.id || typeof node.label !== "string" ||
      typeof node.x !== "number" || !Number.isFinite(node.x) ||
      typeof node.y !== "number" || !Number.isFinite(node.y)
    ) throw new Error("Nó sem id, título ou posição válida")
    if (nodeIds.has(node.id)) throw new Error("Há ids de nós duplicados")
    nodeIds.add(node.id)
    return node as MindMapNode
  })

  const edgeIds = new Set<string>()
  const edges = candidate.edges.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Conexão inválida no arquivo")
    const edge = raw as Partial<MindMapEdge>
    if (
      typeof edge.id !== "string" || !edge.id || typeof edge.source !== "string" ||
      typeof edge.target !== "string" || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)
    ) throw new Error("Conexão aponta para um nó inexistente")
    if (edgeIds.has(edge.id)) throw new Error("Há ids de conexões duplicados")
    edgeIds.add(edge.id)
    return edge as MindMapEdge
  })

  return {
    format: "operacionalos-map",
    version: 1,
    title: typeof candidate.title === "string" ? candidate.title : undefined,
    nodes,
    edges,
  }
}
