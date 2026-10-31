"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckSquareIcon, InboxIcon, UserPlusIcon, WalletIcon } from "lucide-react"
import { ENTITY_ICON, openEntity, useEntitySnapshot } from "@/lib/entities/registry"
import { ENTITY_LABEL, searchableEntities } from "@/lib/entities/summary"
import { refKey, type EntityType } from "@/lib/entities/types"
import { ITEM_KINDS } from "@/lib/domain/items"
import { openCapture, openLeadForm, openTaskForm, openTxForm, useUI } from "@/lib/ui-store"
import { KIND_ICON } from "@/components/hzk/item-bits"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { NAV } from "./nav"
import { useVisiblePages } from "@/lib/use-access-pages"

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const canSee = useVisiblePages()
  const setUI = useUI((s) => s.set)
  const snap = useEntitySnapshot()
  const groups = useMemo(() => {
    const byType = new Map<EntityType, ReturnType<typeof searchableEntities>>()
    for (const it of searchableEntities(snap)) byType.set(it.type, [...(byType.get(it.type) ?? []), it])
    return [...byType.entries()]
  }, [snap])
  const router = useRouter()
  const [query, setQuery] = useState("")

  function run(fn: () => void) {
    setUI({ paletteOpen: false })
    // deixa a paleta fechar antes de abrir outro diálogo
    setTimeout(fn, 0)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => setUI({ paletteOpen: o })}
      title="Buscar ou criar"
      description="Busque leads, notas e páginas ou crie algo novo."
    >
      {/* O cmdk exige o <Command> em volta: sem ele a busca quebra ao abrir. */}
      <Command className="rounded-none! bg-transparent p-0">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Buscar ou capturar: escreva e escolha o que fazer…" />
      <CommandList className="max-h-96">
        <CommandEmpty>Nada encontrado na busca.</CommandEmpty>
        {/* Captura rápida (HZK OS): o que foi digitado vira item na caixa de entrada, em 2 segundos. */}
        {query.trim().length > 1 && (
          <CommandGroup forceMount heading="Capturar na caixa de entrada">
            {ITEM_KINDS.map((k) => {
              const Icon = KIND_ICON[k.id]
              return (
                <CommandItem key={k.id} forceMount value={`capturar ${k.label} ${query}`} onSelect={() => run(() => openCapture({ kind: k.id, title: query.trim() }))}>
                  <Icon /> {k.label}: <span className="truncate font-medium">{query.trim()}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        )}
        <CommandGroup heading="Criar">
          <CommandItem onSelect={() => run(() => openCapture())}>
            <InboxIcon /> Captura rápida (tarefa, ideia, nota ou decisão)
          </CommandItem>
          <CommandItem onSelect={() => run(() => openLeadForm())}>
            <UserPlusIcon /> Novo lead
          </CommandItem>
          <CommandItem onSelect={() => run(() => openTaskForm())}>
            <CheckSquareIcon /> Nova tarefa
          </CommandItem>
          <CommandItem onSelect={() => run(() => openTxForm({ prefill: { type: "entrada" } }))}>
            <WalletIcon /> Nova entrada
          </CommandItem>
          <CommandItem onSelect={() => run(() => openTxForm({ prefill: { type: "saida" } }))}>
            <WalletIcon /> Nova saída
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Ir para">
          {NAV.filter((item) => canSee(item.href)).map((item) => (
            <CommandItem key={item.href} onSelect={() => run(() => router.push(item.href))}>
              <item.icon /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        {/* Busca em TODAS as entidades do OS via registro (módulo novo aparece aqui sozinho). */}
        {groups.map(([type, list]) => {
          const Icon = ENTITY_ICON[type]
          return (
            <CommandGroup key={type} heading={ENTITY_LABEL[type].many}>
              {list.map((it) => (
                <CommandItem key={refKey(it)} value={`${it.title} ${it.subtitle ?? ""} ${it.search ?? ""} ${refKey(it)}`} onSelect={() => run(() => openEntity(it, router.push))}>
                  <Icon />
                  <span className={it.done ? "truncate text-muted-foreground line-through" : "truncate"}>{it.title}</span>
                  {it.subtitle && <span className="ml-auto max-w-40 shrink-0 truncate text-xs text-muted-foreground">{it.subtitle}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )
        })}
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
