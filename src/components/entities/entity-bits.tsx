"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ENTITY_ICON, openEntity, useEntitySnapshot } from "@/lib/entities/registry"
import { ENTITY_LABEL, searchableEntities, summaryOf } from "@/lib/entities/summary"
import { refKey, type EntityRef, type EntityType } from "@/lib/entities/types"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

/** Ícone + nome de qualquer entidade; clique abre (tarefa em painel, resto na página). */
export function EntityChip({ entity, className, showType = true }: { entity: EntityRef; className?: string; showType?: boolean }) {
  const router = useRouter()
  const snap = useEntitySnapshot()
  const sum = summaryOf(entity, snap)
  const Icon = ENTITY_ICON[entity.type]
  return (
    <button
      type="button"
      onClick={() => sum && openEntity(entity, router.push)}
      className={cn("inline-flex min-w-0 items-center gap-1.5 text-left hover:underline", !sum && "cursor-default text-muted-foreground no-underline", className)}
      title={sum ? `${ENTITY_LABEL[entity.type].one}: ${sum.title}` : "Item apagado"}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className={cn("truncate", sum?.done && "text-muted-foreground line-through")}>{sum ? sum.title : "item apagado"}</span>
      {showType && <span className="shrink-0 text-xs text-muted-foreground">{ENTITY_LABEL[entity.type].one}</span>}
    </button>
  )
}

/**
 * Busca e escolhe QUALQUER entidade do OS (tarefas, leads, produtos, conteúdos,
 * notas, mapas, lançamentos). `exclude` tira a própria entidade da lista.
 */
export function EntityPicker({
  trigger,
  onPick,
  exclude,
  types,
  placeholder = "Buscar tarefa, lead, produto, conteúdo…",
}: {
  trigger: React.ReactNode
  onPick: (ref: EntityRef) => void
  exclude?: EntityRef[]
  types?: EntityType[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const snap = useEntitySnapshot()
  const items = useMemo(() => {
    const skip = new Set((exclude ?? []).map(refKey))
    return searchableEntities(snap).filter((e) => !skip.has(refKey(e)) && (!types || types.includes(e.type)))
  }, [snap, exclude, types])
  const groups = useMemo(() => {
    const byType = new Map<EntityType, typeof items>()
    for (const it of items) byType.set(it.type, [...(byType.get(it.type) ?? []), it])
    return [...byType.entries()]
  }, [items])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {groups.map(([type, list]) => {
              const Icon = ENTITY_ICON[type]
              return (
                <CommandGroup key={type} heading={ENTITY_LABEL[type].many}>
                  {list.map((it) => (
                    <CommandItem
                      key={refKey(it)}
                      value={`${it.title} ${it.subtitle ?? ""} ${refKey(it)}`}
                      onSelect={() => {
                        onPick({ type: it.type, id: it.id })
                        setOpen(false)
                      }}
                    >
                      <Icon className="text-muted-foreground" />
                      <span className={cn("min-w-0 flex-1 truncate", it.done && "text-muted-foreground line-through")}>{it.title}</span>
                      {it.subtitle && <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">{it.subtitle}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
