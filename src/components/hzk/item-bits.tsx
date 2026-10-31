"use client"

import { CheckSquareIcon, LightbulbIcon, ScaleIcon, StickyNoteIcon, type LucideIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { ownerOfArea, type Area } from "@/lib/domain/areas"
import { ITEM_KINDS, kindOf, type ItemKind } from "@/lib/domain/items"
import type { Task } from "@/lib/domain/types"
import { useAreaList, usePeople } from "@/lib/use-hzk"
import { cn } from "@/lib/utils"

export const KIND_ICON: Record<ItemKind, LucideIcon> = {
  task: CheckSquareIcon,
  idea: LightbulbIcon,
  decision: ScaleIcon,
  note: StickyNoteIcon,
}

/** Selo do tipo do item (ícone + nome: nunca só cor). */
export function KindBadge({ item, className }: { item: Pick<Task, "kind">; className?: string }) {
  const kind = kindOf(item)
  const Icon = KIND_ICON[kind]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground", className)}>
      <Icon className="size-3.5" />
      {ITEM_KINDS.find((k) => k.id === kind)?.label}
    </span>
  )
}

/** Escolha da área; mostra quem é o dono de cada uma (é para ele que o item vai). */
export function AreaSelect({ value, onChange, id }: { value?: string; onChange: (areaId: string | undefined) => void; id?: string }) {
  const areas = useAreaList()
  const people = usePeople()
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
    >
      <option value="">Sem área</option>
      {areas.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {ownerLabel(a, people)}
        </option>
      ))}
    </select>
  )
}

export function ownerLabel(area: Area, people: ReturnType<typeof usePeople>) {
  const owner = ownerOfArea(area, people)
  if (owner) return getUser(owner).name
  return area.owner && "role" in area.owner ? "CEO (a definir)" : "sem dono"
}

/** Nome do dono, ou "ninguém" (mostra que o item precisa de triagem). */
export function OwnerName({ id }: { id?: string }) {
  return <span>{id ? getUser(id).name : "ninguém"}</span>
}
