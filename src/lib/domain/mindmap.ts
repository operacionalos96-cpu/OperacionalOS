/** Status dos itens do mapa mental. Funções puras, testadas em mindmap.test.ts. */
import type { MindMap, MindMapNode, Task } from "./types"

export type NodeStatus = "afazer" | "andamento" | "feito"

export const NODE_STATUS: Record<NodeStatus, { label: string; next: NodeStatus }> = {
  afazer: { label: "A fazer", next: "andamento" },
  andamento: { label: "Em andamento", next: "feito" },
  feito: { label: "Feito", next: "afazer" },
}

/**
 * Status efetivo do item. Com tarefa vinculada, a tarefa manda no "feito"
 * (concluir a tarefa marca o item, e vice-versa).
 */
export function nodeStatus(node: Pick<MindMapNode, "status" | "taskId">, tasks: Pick<Task, "id" | "done">[]): NodeStatus {
  const task = node.taskId ? tasks.find((t) => t.id === node.taskId) : undefined
  if (task) return task.done ? "feito" : node.status === "andamento" ? "andamento" : "afazer"
  return node.status ?? "afazer"
}

/** Progresso do mapa: itens com texto (ignora itens vazios). */
export function mapProgress(map: Pick<MindMap, "nodes">, tasks: Pick<Task, "id" | "done">[]) {
  const nodes = map.nodes.filter((n) => n.label.trim())
  const counts = { afazer: 0, andamento: 0, feito: 0 }
  for (const n of nodes) counts[nodeStatus(n, tasks)]++
  return { ...counts, total: nodes.length, pct: nodes.length ? counts.feito / nodes.length : 0 }
}
