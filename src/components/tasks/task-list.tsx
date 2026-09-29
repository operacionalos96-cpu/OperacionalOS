"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CheckSquareIcon, ChevronRightIcon, LinkIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { TEAM, getUser } from "@/config/team"
import type { Task } from "@/lib/domain/types"
import { TASK_BUCKETS, type TaskBucket, daysSince, taskBucket } from "@/lib/domain/rules"
import { dueLabel, dueShortcuts } from "@/lib/format"
import { deleteTaskWithUndo, toggleTaskWithFeedback } from "@/lib/actions"
import { useStore } from "@/lib/store"
import { openTaskForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Chip, DueDateField, Segmented } from "@/components/shared/fields"
import { InlineText } from "@/components/shared/inline-edit"
import { EmptyState } from "@/components/shared/layout"
import { AvatarDot } from "@/components/shared/user-avatar"

/** Concluídas aparecem só por alguns dias; depois somem para não poluir. */
const DONE_VISIBLE_DAYS = 7

export function TaskList() {
  const tasks = useStore((s) => s.tasks)
  const meId = useStore((s) => s.meId)
  const [scope, setScope] = useState<"minhas" | "todas">("minhas")
  const [showDone, setShowDone] = useState(false)
  const now = new Date()

  const grouped = useMemo(() => {
    const n = new Date()
    const visible = tasks.filter(
      (t) =>
        (scope === "todas" || t.ownerId === meId) &&
        (!t.done || !t.doneAt || daysSince(t.doneAt, n) <= DONE_VISIBLE_DAYS),
    )
    const map = new Map<TaskBucket, Task[]>()
    for (const t of visible) {
      const b = taskBucket(t, n)
      map.set(b, [...(map.get(b) ?? []), t])
    }
    for (const list of map.values()) list.sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))
    return map
  }, [tasks, scope, meId])

  const openCount = [...grouped.entries()].filter(([b]) => b !== "feitas").reduce((acc, [, l]) => acc + l.length, 0)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <QuickAdd />

      <div className="flex items-center gap-2">
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: "minhas", label: "Minhas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <span className="text-xs text-muted-foreground">
          {openCount} {openCount === 1 ? "aberta" : "abertas"}
        </span>
      </div>

      {openCount === 0 && !grouped.get("feitas")?.length ? (
        <EmptyState
          icon={CheckSquareIcon}
          title={scope === "minhas" ? "Nenhuma tarefa com você" : "Nenhuma tarefa"}
          description="Digite no campo acima e aperte Enter. Tarefas com prazo aparecem no Dashboard de quem é o responsável."
        />
      ) : (
        TASK_BUCKETS.map((bucket) => {
          const list = grouped.get(bucket.id)
          if (!list?.length) return null
          if (bucket.id === "feitas") {
            return (
              <section key={bucket.id}>
                <button
                  onClick={() => setShowDone((v) => !v)}
                  className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                >
                  <ChevronRightIcon className={cn("size-3.5 transition-transform", showDone && "rotate-90")} />
                  {bucket.label} · {list.length}
                </button>
                {showDone && <TaskGroup tasks={list} now={now} />}
              </section>
            )
          }
          return (
            <section key={bucket.id}>
              <h3
                className={cn(
                  "text-xs font-semibold tracking-wide uppercase",
                  bucket.id === "atrasadas" ? "text-red-600" : "text-muted-foreground",
                )}
              >
                {bucket.label} · {list.length}
              </h3>
              <TaskGroup tasks={list} now={now} />
            </section>
          )
        })
      )}
    </div>
  )
}

function TaskGroup({ tasks, now }: { tasks: Task[]; now: Date }) {
  return (
    <ul className="mt-1.5 divide-y rounded-xl border bg-card">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} now={now} />
      ))}
    </ul>
  )
}

function TaskRow({ task, now }: { task: Task; now: Date }) {
  const updateTask = useStore((s) => s.updateTask)
  const lead = useStore((s) => (task.leadId ? s.leads.find((l) => l.id === task.leadId) : undefined))
  const [dueOpen, setDueOpen] = useState(false)
  const overdue = !task.done && task.dueDate && daysSince(task.dueDate, now) > 0
  const other = TEAM.find((u) => u.id !== task.ownerId)!

  return (
    <li className="group flex items-center gap-3 px-3 py-2">
      <Checkbox checked={task.done} onCheckedChange={() => toggleTaskWithFeedback(task.id)} aria-label="Concluir tarefa" />
      <div className="min-w-0 flex-1">
        <InlineText
          value={task.title}
          required
          onSave={(title) => updateTask(task.id, { title })}
          className={cn("text-sm", task.done && "text-muted-foreground line-through")}
        />
        {lead && (
          <Link href={`/pipeline/${lead.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
            <LinkIcon className="size-3" /> {lead.name}
          </Link>
        )}
      </div>

      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-xs hover:bg-accent",
              overdue ? "font-medium text-red-600" : "text-muted-foreground",
              !task.dueDate && "opacity-0 group-hover:opacity-100 focus:opacity-100",
            )}
          >
            {task.dueDate ? dueLabel(task.dueDate, now) : "+ prazo"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto">
          <DueDateField
            allowEmpty
            value={task.dueDate}
            onChange={(dueDate) => {
              updateTask(task.id, { dueDate })
              setDueOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Com 2 pessoas, clicar no avatar passa a tarefa para a outra. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => updateTask(task.id, { ownerId: other.id })} className="shrink-0 rounded-full">
            <AvatarDot userId={task.ownerId} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {getUser(task.ownerId).name} · clique para passar para {other.name}
        </TooltipContent>
      </Tooltip>

      <button
        onClick={() => deleteTaskWithUndo(task.id)}
        className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100"
        aria-label="Excluir tarefa"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </li>
  )
}

/** Digitar + Enter. Responsável e prazo com um clique; o resto no "…". */
function QuickAdd() {
  const meId = useStore((s) => s.meId)
  const createTask = useStore((s) => s.createTask)
  const [title, setTitle] = useState("")
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [dueDate, setDueDate] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)
  const owner = ownerId ?? meId
  const shortcuts = dueShortcuts().slice(0, 2)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    createTask({ title, ownerId: owner, dueDate })
    setTitle("")
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-2 shadow-xs focus-within:ring-2 focus-within:ring-ring/30">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Adicionar tarefa… (Enter para salvar)"
        className="border-0 shadow-none focus-visible:ring-0"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
        <Chip active={!dueDate} onClick={() => setDueDate(undefined)}>
          Sem prazo
        </Chip>
        {shortcuts.map((s) => (
          <Chip key={s.value} active={dueDate === s.value} onClick={() => setDueDate(s.value)}>
            {s.label}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {TEAM.map((u) => (
          <Chip key={u.id} active={owner === u.id} onClick={() => setOwnerId(u.id)}>
            <span className="size-2 rounded-full" style={{ backgroundColor: u.color }} />
            {u.name}
          </Chip>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Mais opções (prazo específico, vincular lead)"
          title="Mais opções: data específica, vincular a lead"
          onClick={() => {
            openTaskForm({ prefill: { title, ownerId: owner, dueDate } })
            setTitle("")
          }}
        >
          <MoreHorizontalIcon />
        </Button>
      </div>
    </form>
  )
}
