/** Status dos itens do mapa mental. Funções puras, testadas em mindmap.test.ts. */
import { differenceInCalendarDays, parseISO } from "date-fns"
import type { MindMap, MindMapNode, Task } from "./types"

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
  const nodes = map.nodes.filter((n) => n.label.trim())
  const counts = { afazer: 0, andamento: 0, feito: 0 }
  for (const n of nodes) counts[nodeStatus(n, tasks, now)]++
  return { ...counts, total: nodes.length, pct: nodes.length ? counts.feito / nodes.length : 0 }
}
