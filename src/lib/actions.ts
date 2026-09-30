"use client"

import { toast } from "sonner"
import { dueLabel, money } from "@/lib/format"
import { useStore } from "@/lib/store"
import { NODE_STATUS, nodeStatus, resolveLinkedTask, taskStatus, type NodeStatus } from "@/lib/domain/mindmap"

/**
 * Ações com feedback + "Desfazer". Use estas na UI em vez de chamar a store
 * direto, para que toda ação importante tenha resposta visual consistente.
 */

export function toggleTaskWithFeedback(id: string) {
  const s = useStore.getState()
  const task = s.tasks.find((t) => t.id === id)
  if (!task) return
  const next = s.toggleTask(id)
  if (!task.done) {
    toast.success("Tarefa concluída", {
      description: next?.dueDate ? `${task.title} · próxima: ${dueLabel(next.dueDate)}` : task.title,
      action: {
        label: "Desfazer",
        onClick: () => {
          const st = useStore.getState()
          st.updateTask(id, { done: false, doneAt: undefined })
          if (next) st.deleteTask(next.id)
        },
      },
    })
  }
}

export function deleteTaskWithUndo(id: string) {
  const s = useStore.getState()
  const task = s.tasks.find((t) => t.id === id)
  if (!task) return
  s.deleteTask(id)
  toast("Tarefa excluída", { action: { label: "Desfazer", onClick: () => useStore.getState().restoreTask(task) } })
}

export function deleteLeadWithUndo(id: string) {
  const s = useStore.getState()
  const lead = s.leads.find((l) => l.id === id)
  if (!lead) return
  const activities = s.activities.filter((a) => a.leadId === id)
  s.deleteLead(id)
  toast(`Lead "${lead.name}" excluído`, {
    action: { label: "Desfazer", onClick: () => useStore.getState().restoreLead(lead, activities) },
  })
}

export function deleteTransactionWithUndo(id: string) {
  const s = useStore.getState()
  const tx = s.transactions.find((t) => t.id === id)
  if (!tx) return
  s.deleteTransaction(id)
  toast(`Lançamento de ${money(tx.amountCents)} excluído`, {
    action: { label: "Desfazer", onClick: () => useStore.getState().restoreTransaction(tx) },
  })
}

/**
 * Define o status da tarefa (a fazer / em andamento / feita).
 * Reabrir uma tarefa recorrente apaga a próxima ocorrência que tinha sido criada
 * automaticamente ao concluir (senão ficariam duas em aberto).
 */
export function setTaskStatus(id: string, next: NodeStatus) {
  const s = useStore.getState()
  const task = s.tasks.find((t) => t.id === id)
  if (!task) return
  if (next === "feito") {
    if (!task.done) toggleTaskWithFeedback(id)
    return
  }
  if (task.done && task.recurrence && task.doneAt) {
    const series = task.seriesId ?? task.id
    const autoNext = s.tasks.find((t) => t.id !== id && !t.done && t.seriesId === series && t.createdAt >= task.doneAt!)
    if (autoNext) s.deleteTask(autoNext.id)
  }
  s.updateTask(id, { done: false, doneAt: undefined, status: next === "andamento" ? "andamento" : undefined })
}

/** Um clique no círculo: a fazer → em andamento → feita → a fazer. */
export function cycleTaskStatus(id: string) {
  const task = useStore.getState().tasks.find((t) => t.id === id)
  if (task) setTaskStatus(id, NODE_STATUS[taskStatus(task)].next)
}

/**
 * Um clique no status de um balão: a fazer → em andamento → feito → a fazer.
 * Com tarefa ligada, a tarefa muda junto (entende tarefa recorrente: a diária feita
 * hoje voltando para "a fazer" reabre a de hoje). Devolve o novo status do balão.
 */
export function cycleMapNodeStatus(node: { status?: "andamento" | "feito"; taskId?: string }): "andamento" | "feito" | undefined {
  const tasks = useStore.getState().tasks
  const linked = resolveLinkedTask(node.taskId, tasks, new Date())
  const current = nodeStatus({ status: node.status, taskId: linked ? node.taskId : undefined }, tasks)
  const next = NODE_STATUS[current].next
  if (linked) {
    if (linked.recurring && linked.doneToday && linked.doneTodayTask && next === "afazer") setTaskStatus(linked.doneTodayTask.id, "afazer")
    else setTaskStatus(linked.task.id, next)
  }
  return next === "afazer" ? undefined : next
}
