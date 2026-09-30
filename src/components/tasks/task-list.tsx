"use client"

import { useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  AlignLeftIcon,
  ArrowDownUpIcon,
  CheckSquareIcon,
  ChevronRightIcon,
  FlagIcon,
  LinkIcon,
  ListChecksIcon,
  MoreHorizontalIcon,
  RepeatIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { TEAM, getUser } from "@/config/team"
import { PRIORITIES } from "@/lib/domain/constants"
import type { Priority, Task } from "@/lib/domain/types"
import {
  TASK_BUCKETS,
  assignPeople,
  isTaskFor,
  taskPeople,
  type TaskBucket,
  type TaskSort,
  checklistProgress,
  compareTasks,
  dayProgress,
  daysSince,
  parseQuickAdd,
  taskBucket,
} from "@/lib/domain/rules"
import { dueLabel, dueShortcuts } from "@/lib/format"
import { deleteTaskWithUndo, toggleTaskWithFeedback } from "@/lib/actions"
import { useStore } from "@/lib/store"
import { openTaskDetail, openTaskForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Chip, DueDateField, Segmented } from "@/components/shared/fields"
import { EmptyState, GroupLabel } from "@/components/shared/layout"
import { AvatarStack } from "@/components/shared/user-avatar"
import { CountUp } from "@/components/shared/count-up"
import { LabelChip, PeoplePicker, PriorityFlag } from "./task-bits"

/** Concluídas aparecem só por alguns dias; depois somem para não poluir. */
const DONE_VISIBLE_DAYS = 7

export function TaskList() {
  const tasks = useStore((s) => s.tasks)
  const meId = useStore((s) => s.meId)
  const [scope, setScope] = useState<"minhas" | "todas">("minhas")
  const [showDone, setShowDone] = useState(false)
  const [query, setQuery] = useState("")
  const [priority, setPriority] = useState<Priority | null>(null)
  const [label, setLabel] = useState<string | null>(null)
  const [sort, setSort] = useState<TaskSort>("prazo")
  const now = new Date()

  const allLabels = useMemo(() => [...new Set(tasks.flatMap((t) => t.labels ?? []))].sort(), [tasks])
  const filtering = !!query || !!priority || !!label

  const grouped = useMemo(() => {
    const n = new Date()
    const q = query.trim().toLowerCase()
    const visible = tasks.filter(
      (t) =>
        (scope === "todas" || isTaskFor(t, meId)) &&
        (!t.done || !t.doneAt || daysSince(t.doneAt, n) <= DONE_VISIBLE_DAYS) &&
        (!priority || t.priority === priority) &&
        (!label || t.labels?.includes(label)) &&
        (!q || t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q)),
    )
    const map = new Map<TaskBucket, Task[]>()
    for (const t of visible) {
      const b = taskBucket(t, n)
      map.set(b, [...(map.get(b) ?? []), t])
    }
    for (const list of map.values()) list.sort((a, b) => compareTasks(a, b, sort))
    return map
  }, [tasks, scope, meId, query, priority, label, sort])

  const openCount = [...grouped.entries()].filter(([b]) => b !== "feitas").reduce((acc, [, l]) => acc + l.length, 0)
  const progress = dayProgress(tasks, scope === "minhas" ? meId : null, now)

  let rowIndex = 0

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <DayProgress done={progress.done} total={progress.total} />

      <QuickAdd />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={scope}
          onChange={setScope}
          options={[
            { value: "minhas", label: "Minhas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <div className="relative min-w-40 flex-1 sm:max-w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefa" className="h-7 pl-8 text-xs" />
        </div>
        <FilterMenu
          icon={FlagIcon}
          label={priority ? PRIORITIES.find((p) => p.id === priority)!.label : "Prioridade"}
          active={!!priority}
          onClear={() => setPriority(null)}
        >
          {PRIORITIES.map((p) => (
            <Chip key={p.id} active={priority === p.id} onClick={() => setPriority(priority === p.id ? null : p.id)}>
              <FlagIcon className="size-3.5" style={{ color: priority === p.id ? undefined : p.color }} /> {p.label}
            </Chip>
          ))}
        </FilterMenu>
        {allLabels.length > 0 && (
          <FilterMenu icon={SparklesIcon} label={label ? `#${label}` : "Etiqueta"} active={!!label} onClear={() => setLabel(null)}>
            {allLabels.map((l) => (
              <button key={l} type="button" onClick={() => setLabel(label === l ? null : l)} className={cn("rounded-full transition-transform hover:scale-105", label === l && "ring-2 ring-brand/50")}>
                <LabelChip label={l} />
              </button>
            ))}
          </FilterMenu>
        )}
        <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setSort(sort === "prazo" ? "prioridade" : "prazo")}>
          <ArrowDownUpIcon /> {sort === "prazo" ? "Por prazo" : "Por prioridade"}
        </Button>
      </div>

      {openCount === 0 && !grouped.get("feitas")?.length ? (
        <EmptyState
          icon={CheckSquareIcon}
          title={filtering ? "Nada com esses filtros" : scope === "minhas" ? "Nenhuma tarefa com você" : "Nenhuma tarefa"}
          description={
            filtering
              ? "Limpe a busca ou os filtros para ver o resto."
              : "Digite no campo acima e aperte Enter. Dica: “Ligar pro cliente !alta #vendas” já cria com prioridade e etiqueta."
          }
        />
      ) : (
        TASK_BUCKETS.map((bucket) => {
          const list = grouped.get(bucket.id)
          if (!list?.length) return null
          if (bucket.id === "feitas") {
            return (
              <section key={bucket.id}>
                <button onClick={() => setShowDone((v) => !v)} className="hover:text-foreground">
                  <GroupLabel>
                    <ChevronRightIcon className={cn("size-3.5 transition-transform duration-300", showDone && "rotate-90")} />
                    {bucket.label} · {list.length}
                  </GroupLabel>
                </button>
                {showDone && <TaskGroup tasks={list} now={now} startIndex={0} />}
              </section>
            )
          }
          const start = rowIndex
          rowIndex += list.length
          return (
            <section key={bucket.id}>
              <GroupLabel tone={bucket.id === "atrasadas" ? "danger" : undefined}>
                {bucket.id === "atrasadas" && <span className="size-1.5 animate-pulse rounded-full bg-danger" />}
                {bucket.label}
                <span className="tabular rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{list.length}</span>
              </GroupLabel>
              <TaskGroup tasks={list} now={now} startIndex={start} />
            </section>
          )
        })
      )}
    </div>
  )
}

/** Anel de progresso do dia: "o que era para hoje, quanto já foi". */
function DayProgress({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0
  const r = 22
  const c = 2 * Math.PI * r
  const allDone = total > 0 && done === total
  return (
    <div className="flex animate-enter items-center gap-4 rounded-xl border bg-card p-4 shadow-card">
      <div className="relative size-14 shrink-0">
        <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
          <circle
            cx="28"
            cy="28"
            r={r}
            fill="none"
            stroke={allDone ? "var(--success)" : "var(--brand)"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct)}
            className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
          />
        </svg>
        <span className="tabular absolute inset-0 flex items-center justify-center text-sm font-bold">
          <CountUp value={Math.round(pct * 100)} format={(n) => `${n}%`} />
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">Seu dia</p>
        <p className="text-base font-semibold">
          {total === 0
            ? "Nada com prazo para hoje"
            : allDone
              ? "Tudo que era para hoje está feito 🎉"
              : `${done} de ${total} feitas · faltam ${total - done}`}
        </p>
        <p className="text-xs text-muted-foreground">Conta as tarefas de hoje e as atrasadas.</p>
      </div>
    </div>
  )
}

function FilterMenu({
  icon: Icon,
  label,
  active,
  onClear,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClear: () => void
  children: React.ReactNode
}) {
  return (
    <Popover>
      <div className="inline-flex items-center">
        <PopoverTrigger asChild>
          <Chip active={active} className={cn(active && "rounded-r-none")}>
            <Icon className="size-3.5" /> {label}
          </Chip>
        </PopoverTrigger>
        {active && (
          <Chip active onClick={onClear} className="rounded-l-none border-l-brand-foreground/20 px-1.5" aria-label="Limpar filtro">
            <XIcon className="size-3" />
          </Chip>
        )}
      </div>
      <PopoverContent align="start" className="flex w-auto max-w-72 flex-wrap gap-1.5 p-2">
        {children}
      </PopoverContent>
    </Popover>
  )
}

function TaskGroup({ tasks, now, startIndex }: { tasks: Task[]; now: Date; startIndex: number }) {
  return (
    <ul className="mt-2 divide-y overflow-hidden rounded-xl border bg-card shadow-card">
      {tasks.map((t, i) => (
        <TaskRow key={t.id} task={t} now={now} index={startIndex + i} />
      ))}
    </ul>
  )
}

function TaskRow({ task, now, index }: { task: Task; now: Date; index: number }) {
  const updateTask = useStore((s) => s.updateTask)
  const lead = useStore((s) => (task.leadId ? s.leads.find((l) => l.id === task.leadId) : undefined))
  const [dueOpen, setDueOpen] = useState(false)
  const overdue = !task.done && task.dueDate && daysSince(task.dueDate, now) > 0
  const people = taskPeople(task)
  // Clique no avatar alterna: uma pessoa → a outra → os dois → ...
  const options: string[][] = [...TEAM.map((u) => [u.id]), TEAM.map((u) => u.id)]
  const current = options.findIndex((o) => o.length === people.length && o.every((id) => people.includes(id)))
  const next = options[(current + 1) % options.length]
  const nameOf = (ids: string[]) => (ids.length === TEAM.length && ids.length > 1 ? "os dois" : ids.map((id) => getUser(id).name).join(" e "))
  const progress = checklistProgress(task)
  const accent = task.priority === "urgente" ? "var(--danger)" : task.priority === "alta" ? "var(--warning)" : undefined

  return (
    <li
      className="group relative flex stagger cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,a,input,[role=checkbox]")) return
        openTaskDetail(task.id)
      }}
    >
      {accent && !task.done && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: accent }} />}
      <Checkbox
        className={cn("mt-0.5 size-[18px] rounded-full transition-transform hover:scale-110", task.done && "check-burst")}
        checked={task.done}
        onCheckedChange={() => toggleTaskWithFeedback(task.id)}
        aria-label="Concluir tarefa"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm leading-snug transition-colors", task.done && "text-muted-foreground line-through decoration-muted-foreground/50")}>
          {task.title}
        </p>
        {(task.labels?.length || progress.total || task.description || task.recurrence || lead || task.priority) && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <PriorityFlag priority={task.priority} withLabel />
            {task.labels?.map((l) => <LabelChip key={l} label={l} />)}
            {progress.total > 0 && (
              <span className={cn("inline-flex items-center gap-1", progress.done === progress.total && "text-success")}>
                <ListChecksIcon className="size-3.5" />
                <span className="tabular">
                  {progress.done}/{progress.total}
                </span>
              </span>
            )}
            {task.description && <AlignLeftIcon className="size-3.5" aria-label="Tem descrição" />}
            {task.recurrence && <RepeatIcon className="size-3.5" aria-label="Recorrente" />}
            {lead && (
              <Link href={`/pipeline/${lead.id}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <LinkIcon className="size-3" /> {lead.name}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Coluna de prazo com largura fixa: avatares alinhados em todas as linhas. */}
      <div className="flex w-24 shrink-0 justify-end">
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "max-w-full truncate rounded-md px-1.5 py-0.5 text-xs transition-colors hover:bg-accent",
              overdue ? "bg-danger-soft font-semibold text-danger" : "text-muted-foreground",
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
      </div>

      {/* Largura fixa: 1 ou 2 avatares não desalinham a lista. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={() => updateTask(task.id, assignPeople(next))} className="flex w-9 shrink-0 justify-end rounded-full transition-transform hover:scale-110">
            <AvatarStack userIds={people} />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {people.length > 1 ? "Colaborativa: " : ""}
          {nameOf(people)} · clique para passar para {nameOf(next)}
        </TooltipContent>
      </Tooltip>

      <button
        onClick={() => deleteTaskWithUndo(task.id)}
        className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
        aria-label="Excluir tarefa"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </li>
  )
}

/** Digitar + Enter. Entende "!alta" e "#etiqueta". Prazo e responsável com um clique; o resto no "…". */
function QuickAdd() {
  const meId = useStore((s) => s.meId)
  const createTask = useStore((s) => s.createTask)
  const [title, setTitle] = useState("")
  const [people, setPeople] = useState<string[] | null>(null)
  const [dueDate, setDueDate] = useState<string | undefined>()
  const [priority, setPriority] = useState<Priority | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)
  const assignees = people ?? [meId]
  const shortcuts = dueShortcuts().slice(0, 2)
  const parsed = parseQuickAdd(title)
  const effectivePriority = parsed.priority ?? priority

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!parsed.title) return
    createTask({ title: parsed.title, ...assignPeople(assignees), dueDate, priority: effectivePriority, labels: parsed.labels })
    setTitle("")
    setPriority(undefined)
    inputRef.current?.focus()
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-2 shadow-card transition-shadow focus-within:shadow-lift focus-within:ring-2 focus-within:ring-brand/25">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Adicionar tarefa…  (ex.: Ligar pro cliente !alta #vendas)"
        className="border-0 bg-transparent text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      {(parsed.labels.length > 0 || parsed.priority) && (
        <div className="flex animate-enter flex-wrap items-center gap-1.5 px-3 pb-1">
          <span className="text-[11px] text-muted-foreground">Vai criar com:</span>
          <PriorityFlag priority={parsed.priority} withLabel />
          {parsed.labels.map((l) => (
            <LabelChip key={l} label={l} />
          ))}
        </div>
      )}
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
        <PeoplePicker value={assignees} onChange={setPeople} />
        <span className="mx-1 h-4 w-px bg-border" />
        {PRIORITIES.slice(0, 2).map((p) => (
          <Chip
            key={p.id}
            active={effectivePriority === p.id}
            onClick={() => setPriority(priority === p.id ? undefined : p.id)}
            title={`Prioridade ${p.label}`}
          >
            <FlagIcon className="size-3.5" style={{ color: effectivePriority === p.id ? undefined : p.color }} /> {p.label}
          </Chip>
        ))}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Mais opções (data, lead, checklist, repetir)"
          title="Mais opções: data específica, lead, checklist, repetir"
          onClick={() => {
            openTaskForm({ prefill: { title: parsed.title, ...assignPeople(assignees), dueDate, priority: effectivePriority, labels: parsed.labels } })
            setTitle("")
          }}
        >
          <MoreHorizontalIcon />
        </Button>
      </div>
    </form>
  )
}

