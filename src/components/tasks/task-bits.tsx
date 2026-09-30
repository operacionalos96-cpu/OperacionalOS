"use client"

import { useState } from "react"
import { FlagIcon, PlusIcon, RepeatIcon, UsersIcon, XIcon } from "lucide-react"
import { TEAM } from "@/config/team"
import { LABEL_HUES, PRIORITIES, RECURRENCES, priorityMeta } from "@/lib/domain/constants"
import type { Priority, Recurrence } from "@/lib/domain/types"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Chip } from "@/components/shared/fields"

/** Mesma etiqueta = mesma cor, sempre (hash do nome). */
export function labelHue(label: string) {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return LABEL_HUES[h % LABEL_HUES.length]
}

export function LabelChip({ label, onRemove, className }: { label: string; onRemove?: () => void; className?: string }) {
  const hue = labelHue(label)
  return (
    <span
      className={cn("inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium", className)}
      style={{
        background: `oklch(0.7 0.05 ${hue} / 14%)`,
        color: `light-dark(oklch(0.42 0.07 ${hue}), oklch(0.8 0.05 ${hue}))`,
      }}
    >
      #{label}
      {onRemove && (
        <button type="button" onClick={onRemove} className="-mr-1 rounded-full opacity-60 hover:opacity-100" aria-label={`Remover ${label}`}>
          <XIcon className="size-3" />
        </button>
      )}
    </span>
  )
}

export function PriorityFlag({ priority, withLabel = false, className }: { priority?: Priority; withLabel?: boolean; className?: string }) {
  const meta = priorityMeta(priority)
  if (!meta) return null
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", className)} style={{ color: meta.color }} title={`Prioridade ${meta.label}`}>
      <FlagIcon className="size-3.5" fill="currentColor" fillOpacity={0.2} />
      {withLabel && meta.label}
    </span>
  )
}

export function PriorityPicker({ value, onChange }: { value?: Priority; onChange: (p: Priority | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={!value} onClick={() => onChange(undefined)}>
        Nenhuma
      </Chip>
      {PRIORITIES.map((p) => (
        <Chip key={p.id} active={value === p.id} onClick={() => onChange(p.id)}>
          <FlagIcon className="size-3.5" style={{ color: value === p.id ? undefined : p.color }} />
          {p.label}
        </Chip>
      ))}
    </div>
  )
}

export function RecurrencePicker({ value, onChange }: { value?: Recurrence; onChange: (r: Recurrence | undefined) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip active={!value} onClick={() => onChange(undefined)}>
        Não repete
      </Chip>
      {RECURRENCES.map((r) => (
        <Chip key={r.id} active={value === r.id} onClick={() => onChange(r.id)}>
          <RepeatIcon className="size-3.5" />
          {r.label}
        </Chip>
      ))}
    </div>
  )
}

/** Etiquetas: digitar + Enter cria; sugere as que já existem em outras tarefas. */
export function LabelEditor({ value, onChange }: { value: string[]; onChange: (labels: string[]) => void }) {
  const tasks = useStore((s) => s.tasks)
  const [text, setText] = useState("")
  const known = [...new Set(tasks.flatMap((t) => t.labels ?? []))].filter((l) => !value.includes(l)).sort()

  function add(raw: string) {
    const label = raw.trim().replace(/^#/, "").toLowerCase()
    if (label && !value.includes(label)) onChange([...value, label])
    setText("")
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((l) => (
          <LabelChip key={l} label={l} onRemove={() => onChange(value.filter((x) => x !== l))} />
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add(text)
            }
            if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1))
          }}
          onBlur={() => text && add(text)}
          placeholder={value.length ? "+ etiqueta" : "Digite e aperte Enter (ex.: vendas)"}
          className="h-6 min-w-32 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
      </div>
      {known.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Usadas:</span>
          {known.slice(0, 8).map((l) => (
            <button key={l} type="button" onClick={() => add(l)} className="inline-flex items-center rounded-full opacity-70 transition-opacity hover:opacity-100">
              <PlusIcon className="size-3 text-muted-foreground" />
              <LabelChip label={l} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Responsáveis da tarefa (um ou vários). Cada pessoa liga/desliga; sempre fica
 * pelo menos uma. O primeiro da lista é o principal (dono padrão da tarefa).
 */
export function PeoplePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const all = TEAM.map((u) => u.id)
  const everyone = all.every((id) => value.includes(id))
  function toggle(id: string) {
    const next = value.includes(id) ? value.filter((x) => x !== id) : [...value, id]
    if (next.length) onChange(next)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {TEAM.map((u) => (
        <Chip key={u.id} active={value.includes(u.id) && !everyone} onClick={() => (everyone ? onChange([u.id]) : toggle(u.id))}>
          <span className="size-2 rounded-full" style={{ backgroundColor: u.color }} />
          {u.name}
        </Chip>
      ))}
      <Chip active={everyone} onClick={() => onChange(everyone ? [value[0]] : [value[0], ...all.filter((id) => id !== value[0])])} title="Tarefa colaborativa: aparece para todos">
        <UsersIcon className="size-3.5" /> {TEAM.length === 2 ? "Os dois" : "Todos"}
      </Chip>
    </div>
  )
}
