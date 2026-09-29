"use client"

import { useRouter } from "next/navigation"
import { CheckSquareIcon, ClapperboardIcon, FileTextIcon, PackageIcon, UserPlusIcon, WalletIcon } from "lucide-react"
import { stageLabel } from "@/lib/domain/constants"
import { money } from "@/lib/format"
import { useStore } from "@/lib/store"
import { useContentItems, useProducts } from "@/lib/modules"
import { openLeadForm, openTaskForm, openTxForm, useUI } from "@/lib/ui-store"
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
import { AvatarDot } from "@/components/shared/user-avatar"
import { NAV } from "./nav"

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setUI = useUI((s) => s.set)
  const leads = useStore((s) => s.leads)
  const notes = useStore((s) => s.notes)
  const products = useProducts((s) => s.items)
  const contents = useContentItems((s) => s.items)
  const router = useRouter()

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
      <CommandInput placeholder="Buscar lead, produto, conteúdo, nota ou ação…" />
      <CommandList className="max-h-96">
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Criar">
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
          {NAV.map((item) => (
            <CommandItem key={item.href} onSelect={() => run(() => router.push(item.href))}>
              <item.icon /> {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Leads">
          {leads.map((l) => (
            <CommandItem
              key={l.id}
              value={`${l.name} ${l.company ?? ""} ${l.id}`}
              onSelect={() => run(() => router.push(`/pipeline/${l.id}`))}
            >
              <AvatarDot userId={l.ownerId} size="xs" />
              <span className="truncate">{l.name}</span>
              <span className="truncate text-muted-foreground">{l.company}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {stageLabel(l.stage)} · {money(l.valueCents)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Produtos">
          {products.map((p) => (
            <CommandItem key={p.id} value={`produto ${p.name} ${p.id}`} onSelect={() => run(() => router.push(`/produtos/${p.id}`))}>
              <PackageIcon /> {p.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Conteúdos">
          {contents.map((c) => (
            <CommandItem key={c.id} value={`conteudo ${c.title} ${c.id}`} onSelect={() => run(() => router.push(`/conteudos/${c.id}`))}>
              <ClapperboardIcon /> <span className="truncate">{c.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Notas">
          {notes.map((n) => (
            <CommandItem
              key={n.id}
              value={`${n.title} ${n.body.slice(0, 200)} ${n.id}`}
              onSelect={() => run(() => router.push(`/tarefas?nota=${n.id}`))}
            >
              <FileTextIcon /> {n.title || "Sem título"}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
