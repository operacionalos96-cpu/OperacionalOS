"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronDownIcon } from "lucide-react"
import type { Priority, Recurrence } from "@/lib/domain/types"
import { useStore } from "@/lib/store"
import { openTaskDetail, useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DueDateField, Field, LeadSelect, SubmitRow, submitOnModEnter } from "@/components/shared/fields"
import { LabelEditor, PeoplePicker, PriorityPicker, RecurrencePicker } from "@/components/tasks/task-bits"
import { assignPeople } from "@/lib/domain/rules"
import { dueLabel } from "@/lib/format"

export function TaskFormDialog() {
  const form = useUI((s) => s.taskForm)
  const setUI = useUI((s) => s.set)
  const meId = useStore((s) => s.meId)
  const createTask = useStore((s) => s.createTask)

  const [title, setTitle] = useState("")
  const [people, setPeople] = useState<string[]>([meId])
  const [dueDate, setDueDate] = useState<string | undefined>()
  const [leadId, setLeadId] = useState<string | undefined>()
  const [priority, setPriority] = useState<Priority | undefined>()
  const [labels, setLabels] = useState<string[]>([])
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>()
  const [description, setDescription] = useState("")
  const [more, setMore] = useState(false)

  useEffect(() => {
    if (!form) return
    setTitle(form.prefill?.title ?? "")
    setPeople([form.prefill?.ownerId ?? meId, ...(form.prefill?.collaborators ?? [])])
    setDueDate(form.prefill?.dueDate)
    setLeadId(form.prefill?.leadId)
    setPriority(form.prefill?.priority)
    setLabels(form.prefill?.labels ?? [])
    setRecurrence(form.prefill?.recurrence)
    setDescription(form.prefill?.description ?? "")
    setMore(false)
  }, [form, meId])

  function close() {
    setUI({ taskForm: null })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const task = createTask({ title, ...assignPeople(people), dueDate, leadId, priority, labels, recurrence, description })
    form?.onCreated?.(task)
    close()
    toast.success("Tarefa criada", {
      description: task.dueDate ? `Prazo: ${dueLabel(task.dueDate)}` : undefined,
      action: { label: "Detalhes", onClick: () => openTaskDetail(task.id) },
    })
  }

  return (
    <Dialog open={form !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>O essencial em cima; checklist e o resto dá para completar depois.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Input autoFocus placeholder="O que precisa ser feito?" value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 text-base" />
          <Field label="Prazo">
            <DueDateField value={dueDate} onChange={setDueDate} allowEmpty />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsáveis" hint="um ou mais">
              <PeoplePicker value={people} onChange={setPeople} />
            </Field>
            <Field label="Vincular a um lead" hint="opcional">
              <LeadSelect value={leadId} onChange={setLeadId} />
            </Field>
          </div>
          <Field label="Prioridade">
            <PriorityPicker value={priority} onChange={setPriority} />
          </Field>

          <button type="button" onClick={() => setMore((v) => !v)} className="flex items-center gap-1.5 border-t pt-3 text-left">
            <span className="t-label">Mais opções</span>
            <span className="t-desc text-xs">etiquetas, repetir, descrição</span>
            <ChevronDownIcon className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-300", more && "rotate-180")} />
          </button>
          {more && (
            <div className="grid animate-enter gap-4">
              <Field label="Etiquetas">
                <div className="rounded-lg border bg-background px-2.5 py-2">
                  <LabelEditor value={labels} onChange={setLabels} />
                </div>
              </Field>
              <Field label="Repetir">
                <RecurrencePicker value={recurrence} onChange={setRecurrence} />
              </Field>
              <Field label="Descrição">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto, links, como fazer…" />
              </Field>
            </div>
          )}
          <SubmitRow onCancel={close} submitLabel="Criar tarefa" disabled={!title.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
