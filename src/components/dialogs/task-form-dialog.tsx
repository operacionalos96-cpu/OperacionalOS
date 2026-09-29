"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DueDateField, Field, LeadSelect, OwnerToggle, SubmitRow, submitOnModEnter } from "@/components/shared/fields"
import { dueLabel } from "@/lib/format"

export function TaskFormDialog() {
  const form = useUI((s) => s.taskForm)
  const setUI = useUI((s) => s.set)
  const meId = useStore((s) => s.meId)
  const createTask = useStore((s) => s.createTask)

  const [title, setTitle] = useState("")
  const [ownerId, setOwnerId] = useState(meId)
  const [dueDate, setDueDate] = useState<string | undefined>()
  const [leadId, setLeadId] = useState<string | undefined>()

  useEffect(() => {
    if (!form) return
    setTitle(form.prefill?.title ?? "")
    setOwnerId(form.prefill?.ownerId ?? meId)
    setDueDate(form.prefill?.dueDate)
    setLeadId(form.prefill?.leadId)
  }, [form, meId])

  function close() {
    setUI({ taskForm: null })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const task = createTask({ title, ownerId, dueDate, leadId })
    form?.onCreated?.(task)
    close()
    toast.success("Tarefa criada", { description: task.dueDate ? `Prazo: ${dueLabel(task.dueDate)}` : undefined })
  }

  return (
    <Dialog open={form !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Input autoFocus placeholder="O que precisa ser feito?" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Field label="Prazo">
            <DueDateField value={dueDate} onChange={setDueDate} allowEmpty />
          </Field>
          <Field label="Responsável">
            <OwnerToggle value={ownerId} onChange={setOwnerId} />
          </Field>
          <Field label="Vincular a um lead" hint="opcional">
            <LeadSelect value={leadId} onChange={setLeadId} />
          </Field>
          <SubmitRow onCancel={close} submitLabel="Criar tarefa" disabled={!title.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
