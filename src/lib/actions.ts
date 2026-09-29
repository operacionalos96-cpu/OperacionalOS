"use client"

import { toast } from "sonner"
import { dueLabel, money } from "@/lib/format"
import { useStore } from "@/lib/store"

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
