"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckIcon, GripVerticalIcon, LinkIcon, ListChecksIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { assignPeople, checklistProgress, taskPeople } from "@/lib/domain/rules"
import { dateTime, dueLabel, uid } from "@/lib/format"
import { cycleTaskStatus, deleteTaskWithUndo, setTaskStatus } from "@/lib/actions"
import { taskStatus } from "@/lib/domain/mindmap"
import { StatusButton } from "@/components/shared/status-button"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { ContextPanel } from "@/components/entities/context-panel"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { DueDateField, Field, LeadSelect, Segmented } from "@/components/shared/fields"
import { LabelEditor, PeoplePicker, PriorityPicker, RecurrencePicker } from "./task-bits"

/** Painel lateral: tudo que dá para personalizar em uma tarefa, salvo na hora. */
export function TaskDetailSheet() {
  const id = useUI((s) => s.taskDetail)
  const task = useStore((s) => s.tasks.find((t) => t.id === id))
  const close = () => useUI.getState().set({ taskDetail: null })

  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && close()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        {task && <TaskDetail key={task.id} taskId={task.id} onClose={close} />}
      </SheetContent>
    </Sheet>
  )
}

function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId))!
  const lead = useStore((s) => (task.leadId ? s.leads.find((l) => l.id === task.leadId) : undefined))
  const updateTask = useStore((s) => s.updateTask)
  const set = (patch: Parameters<typeof updateTask>[1]) => updateTask(task.id, patch)
  const progress = checklistProgress(task)

  return (
    <>
      <div className="sticky top-0 z-10 flex items-start gap-3 border-b bg-popover/95 px-5 pt-5 pb-4 backdrop-blur">
        <StatusButton size="md" status={taskStatus(task)} onClick={() => cycleTaskStatus(task.id)} className="mt-1" />
        <div className="min-w-0 flex-1">
          <SheetTitle asChild>
            <textarea
              value={task.title}
              rows={1}
              onChange={(e) => set({ title: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && set({ title: "Sem título" })}
              className={cn(
                "field-sizing-content w-full resize-none bg-transparent text-lg leading-snug font-semibold outline-none",
                task.done && "text-muted-foreground line-through",
              )}
            />
          </SheetTitle>
          <SheetDescription className="text-xs">
            Criada {dateTime(task.createdAt)}
            {task.doneAt && <> · concluída {dateTime(task.doneAt)}</>}
          </SheetDescription>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5">
        <Field label="Status">
          <Segmented
            value={taskStatus(task)}
            onChange={(v) => setTaskStatus(task.id, v)}
            options={[
              { value: "afazer", label: "A fazer" },
              { value: "andamento", label: <><span className="size-2 rounded-full bg-warning" /> Em andamento</> },
              { value: "feito", label: <><span className="size-2 rounded-full bg-success" /> Feita</> },
            ]}
          />
        </Field>
        <Field label="Prazo" hint={task.dueDate ? dueLabel(task.dueDate) : undefined}>
          <DueDateField allowEmpty value={task.dueDate} onChange={(dueDate) => set({ dueDate })} />
        </Field>
        <Field label="Prioridade">
          <PriorityPicker value={task.priority} onChange={(priority) => set({ priority })} />
        </Field>
        <Field label="Responsáveis" hint="tarefa colaborativa: marque mais de um">
          <PeoplePicker value={taskPeople(task)} onChange={(ids) => set(assignPeople(ids))} />
        </Field>
        <Field label="Etiquetas">
          <div className="rounded-lg border bg-background px-2.5 py-2">
            <LabelEditor value={task.labels ?? []} onChange={(labels) => set({ labels: labels.length ? labels : undefined })} />
          </div>
        </Field>
        <Field label="Repetir" hint="ao concluir, a próxima é criada sozinha">
          <RecurrencePicker value={task.recurrence} onChange={(recurrence) => set({ recurrence })} />
        </Field>
        <Field label="Descrição">
          <Textarea
            value={task.description ?? ""}
            onChange={(e) => set({ description: e.target.value || undefined })}
            placeholder="Contexto, links, como fazer…"
            className="min-h-24"
          />
        </Field>

        <Field label="Checklist" hint={progress.total ? `${progress.done} de ${progress.total}` : undefined}>
          <Checklist taskId={task.id} />
        </Field>

        <Field label="Lead vinculado" hint="opcional">
          <LeadSelect value={task.leadId} onChange={(leadId) => set({ leadId })} />
          {lead && (
            <Link href={`/pipeline/${lead.id}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
              <LinkIcon className="size-3" /> Abrir {lead.name}
            </Link>
          )}
        </Field>
      </div>

      <div className="border-t">
        <p className="t-label px-5 pt-4">Conexões</p>
        <ConnectionsPanel entity={{ type: "task", id: task.id }} bare />
      </div>
      <div className="border-t">
        <p className="t-label px-5 pt-4">Contexto</p>
        <ContextPanel entity={{ type: "task", id: task.id }} bare />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t px-5 py-3">
        <span className="text-xs text-muted-foreground">Salvo automaticamente · {taskPeople(task).map((id) => getUser(id).name).join(" e ")}</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-danger hover:bg-danger-soft hover:text-danger"
          onClick={() => {
            onClose()
            deleteTaskWithUndo(task.id)
          }}
        >
          <Trash2Icon /> Excluir
        </Button>
        <Button size="sm" onClick={onClose}>
          <CheckIcon /> Pronto
        </Button>
      </div>
    </>
  )
}

function Checklist({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId))!
  const updateTask = useStore((s) => s.updateTask)
  const [text, setText] = useState("")
  const items = task.checklist ?? []
  const progress = checklistProgress(task)
  const save = (checklist: typeof items) => updateTask(taskId, { checklist: checklist.length ? checklist : undefined })

  return (
    <div className="grid gap-1.5">
      {progress.total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-success transition-[width] duration-500 ease-out" style={{ width: `${progress.pct * 100}%` }} />
        </div>
      )}
      <ul className="grid">
        {items.map((item, i) => (
          <li key={item.id} className="group flex animate-enter items-center gap-2 rounded-md py-1 pr-1 hover:bg-accent/60" style={{ animationDelay: `${i * 30}ms` }}>
            <GripVerticalIcon className="size-3.5 text-muted-foreground/40" />
            <Checkbox
              checked={item.done}
              onCheckedChange={() => save(items.map((x) => (x.id === item.id ? { ...x, done: !x.done } : x)))}
              aria-label={`Marcar ${item.text}`}
            />
            <input
              value={item.text}
              onChange={(e) => save(items.map((x) => (x.id === item.id ? { ...x, text: e.target.value } : x)))}
              className={cn("min-w-0 flex-1 bg-transparent text-sm outline-none", item.done && "text-muted-foreground line-through")}
            />
            <button
              type="button"
              onClick={() => save(items.filter((x) => x.id !== item.id))}
              className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
              aria-label="Remover item"
            >
              <XIcon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return
          save([...items, { id: uid(), text: text.trim(), done: false }])
          setText("")
        }}
        className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 focus-within:border-brand"
      >
        {items.length ? <PlusIcon className="size-3.5 text-muted-foreground" /> : <ListChecksIcon className="size-3.5 text-muted-foreground" />}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicionar passo e Enter"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </form>
    </div>
  )
}
