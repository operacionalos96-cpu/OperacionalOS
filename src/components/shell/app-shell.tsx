"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  CheckSquareIcon,
  DatabaseIcon,
  EraserIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SunIcon,
  UserPlusIcon,
  WalletIcon,
} from "lucide-react"
import { TEAM } from "@/config/team"
import { isOverdue, leadsNeedingAction } from "@/lib/domain/rules"
import { resetData } from "@/lib/repositories"
import { useStore } from "@/lib/store"
import { openLeadForm, openTaskForm, openTxForm, useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { LeadFormDialog } from "@/components/dialogs/lead-form-dialog"
import { TaskFormDialog } from "@/components/dialogs/task-form-dialog"
import { TransactionFormDialog } from "@/components/dialogs/transaction-form-dialog"
import { LostDialog, NextActionDialog, WonDialog } from "@/components/dialogs/lead-flow-dialogs"
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet"
import { CommandPalette } from "./command-palette"
import { NAV, isActive } from "./nav"

export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated)
  const hydrate = useStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useGlobalShortcuts()
  const pathname = usePathname()

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto pb-16 md:pb-0">
        {/* key por rota: cada página entra com um fade curto. */}
        {hydrated ? (
          <div key={pathname} className="flex min-h-0 flex-1 animate-enter flex-col">
            {children}
          </div>
        ) : (
          <PageSkeleton />
        )}
      </main>
      <MobileNav />
      {hydrated && (
        <>
          <CommandPalette />
          <LeadFormDialog />
          <TaskFormDialog />
          <TransactionFormDialog />
          <NextActionDialog />
          <WonDialog />
          <LostDialog />
          <TaskDetailSheet />
        </>
      )}
    </div>
  )
}

/** Ctrl/Cmd+K abre a paleta. Nada de atalhos obscuros além disso. */
function useGlobalShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        useUI.getState().set({ paletteOpen: !useUI.getState().paletteOpen })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}

function useBadges() {
  const leads = useStore((s) => s.leads)
  const tasks = useStore((s) => s.tasks)
  const meId = useStore((s) => s.meId)
  return useMemo(() => {
    const now = new Date()
    return {
      "/pipeline": leadsNeedingAction(leads, now).length,
      "/tarefas": tasks.filter((t) => !t.done && t.ownerId === meId && isOverdue(t.dueDate, now)).length,
    } as Record<string, number>
  }, [leads, tasks, meId])
}

function Sidebar() {
  const pathname = usePathname()
  const badges = useBadges()
  const hydrated = useStore((s) => s.hydrated)

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="btn-depth flex size-7 items-center justify-center rounded-lg text-xs font-extrabold">O</div>
        <p className="text-sm font-bold tracking-tight">Operacional OS</p>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        <NewMenu />
        <button
          onClick={() => useUI.getState().set({ paletteOpen: true })}
          className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <SearchIcon className="size-4" />
          Buscar
          <kbd className="ml-auto rounded border bg-background px-1 text-[10px] font-medium">Ctrl K</kbd>
        </button>
      </div>

      <p className="t-label px-4 pt-3 pb-1.5">Navegação</p>
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href)
          const badge = hydrated ? badges[item.href] : 0
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group/nav relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-200 hover:bg-sidebar-accent hover:text-foreground",
                active && "bg-sidebar-accent text-foreground shadow-card",
              )}
            >
              {/* Ativo = 3 sinais: barra de marca, fundo elevado e ícone colorido. */}
              <span
                className={cn(
                  "absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-brand transition-transform duration-300",
                  active ? "scale-y-100" : "scale-y-0",
                )}
              />
              <item.icon className={cn("size-4 transition-transform duration-200 group-hover/nav:scale-110", active && "text-brand")} />
              {item.label}
              {badge > 0 && (
                <span className="tabular ml-auto rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white shadow-[0_2px_6px_-1px_var(--danger)]">{badge}</span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto grid gap-3 border-t p-3">
        <MeSwitcher />
        <div className="flex items-center justify-between">
          <DataMenu />
          <ThemeSwitcher />
        </div>
      </div>
    </aside>
  )
}

/** Discreto de propósito: usado uma vez, para trocar os dados de exemplo pelos reais. */
function DataMenu() {
  const [confirm, setConfirm] = useState<null | "zero" | "exemplo">(null)

  function run() {
    resetData({ withExamples: confirm === "exemplo" })
    window.location.href = "/"
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            <DatabaseIcon className="size-3" /> Dados
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-64">
          <DropdownMenuItem onSelect={() => setConfirm("zero")}>
            <EraserIcon /> Começar do zero (apagar exemplos)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setConfirm("exemplo")}>
            <RotateCcwIcon /> Restaurar dados de exemplo
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirm === "zero" ? "Começar do zero?" : "Restaurar dados de exemplo?"}</DialogTitle>
            <DialogDescription>
              Isso apaga todos os leads, tarefas, notas, lançamentos e mapas salvos neste navegador. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={run}>
              Apagar tudo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function NewMenu({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button size="icon" className="size-10 rounded-full shadow-lg" aria-label="Novo">
            <PlusIcon className="size-5" />
          </Button>
        ) : (
          <Button className="w-full justify-start">
            <PlusIcon /> Novo
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} className="w-52">
        <DropdownMenuItem onSelect={() => openLeadForm()}>
          <UserPlusIcon /> Lead
          <DropdownMenuShortcut>mais usado</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openTaskForm()}>
          <CheckSquareIcon /> Tarefa
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openTxForm()}>
          <WalletIcon /> Entrada ou saída
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** "Quem está usando?" — define "minhas" coisas e o dono padrão do que é criado. */
function MeSwitcher() {
  const meId = useStore((s) => s.meId)
  const setMe = useStore((s) => s.setMe)
  return (
    <div>
      <p className="t-label px-1 pb-1.5">Você é</p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
        {TEAM.map((u) => (
          <button
            key={u.id}
            onClick={() => setMe(u.id)}
            className={cn(
              "flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow] duration-200 hover:text-foreground",
              meId === u.id && "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/10%),0_2px_6px_-2px_oklch(0_0_0/12%)]",
            )}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: u.color }} />
            {u.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Claro / escuro / automático (segue o sistema). */
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const options = [
    { id: "light", icon: SunIcon, label: "Claro" },
    { id: "dark", icon: MoonIcon, label: "Escuro" },
    { id: "system", icon: MonitorIcon, label: "Automático" },
  ] as const
  return (
    <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Tema">
      {options.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={mounted && theme === o.id}
          title={o.label}
          onClick={() => setTheme(o.id)}
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,box-shadow] duration-200 hover:text-foreground",
            mounted && theme === o.id && "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/12%)]",
          )}
        >
          <o.icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}

function MobileNav() {
  const pathname = usePathname()
  const meId = useStore((s) => s.meId)
  const setMe = useStore((s) => s.setMe)
  const me = TEAM.find((u) => u.id === meId) ?? TEAM[0]
  const other = TEAM.find((u) => u.id !== meId) ?? TEAM[1]
  return (
    <>
      <div className="fixed right-4 bottom-20 z-40 md:hidden">
        <NewMenu compact />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t bg-background/90 backdrop-blur md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground",
              isActive(pathname, item.href) && "text-brand",
            )}
          >
            <item.icon className="size-5" />
            {"short" in item ? item.short : item.label}
          </Link>
        ))}
        <button
          onClick={() => setMe(other.id)}
          className="flex w-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
          aria-label={`Você é ${me.name}. Trocar para ${other.name}`}
        >
          <span className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: me.color }}>
            {me.initials}
          </span>
          {me.name}
        </button>
      </nav>
    </>
  )
}

function PageSkeleton() {
  return (
    <div className="grid gap-4 p-6">
      <Skeleton className="h-6 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
