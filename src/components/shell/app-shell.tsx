"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  CheckSquareIcon,
  DatabaseIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  ShieldAlertIcon,
  SunIcon,
  UploadIcon,
  UserPlusIcon,
  WalletIcon,
  WifiOffIcon,
} from "lucide-react"
import { TEAM, getUser } from "@/config/team"
import { isOverdue, leadsNeedingAction } from "@/lib/domain/rules"
import { importLocalData, localSnapshotCounts } from "@/lib/import-local"
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
import { NAV, NAV_SECTIONS, isActive } from "./nav"

/** Telas sem barra lateral e sem dados (login, redefinir senha). */
const BARE_PATHS = ["/login", "/redefinir-senha"]

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (BARE_PATHS.some((p) => pathname.startsWith(p))) return <>{children}</>
  return <ProtectedShell>{children}</ProtectedShell>
}

function ProtectedShell({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated)
  const hydrate = useStore((s) => s.hydrate)
  const access = useStore((s) => s.access)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useGlobalShortcuts()
  const pathname = usePathname()

  if (access === "negado" || access === "erro") return <AccessProblem kind={access} />

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

      <nav className="flex flex-col gap-4 px-2 pt-2">
        {NAV_SECTIONS.map((section, si) => (
          <div key={si} className="flex flex-col gap-0.5">
            {section.title && <p className="t-label px-2.5 pb-1">{section.title}</p>}
            {section.items.map((item) => {
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
          </div>
        ))}
      </nav>

      {/* grid-cols-[minmax(0,1fr)]: sem isso o e-mail longo estica o card para fora da barra. */}
      <div className="mt-auto grid grid-cols-[minmax(0,1fr)] gap-3 border-t p-3">
        <AccountCard />
        <div className="flex items-center justify-between">
          <DataMenu />
          <ThemeSwitcher />
        </div>
      </div>
    </aside>
  )
}

/** Discreto de propósito: usado uma vez, para levar dados antigos deste navegador para o banco. */
function DataMenu() {
  const [counts, setCounts] = useState<ReturnType<typeof localSnapshotCounts>>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const n = await importLocalData()
      toast.success(`${n} itens importados`, { description: "Já estão no banco e aparecem para os dois." })
      setCounts(null)
      setTimeout(() => window.location.reload(), 800)
    } catch {
      toast.error("Não foi possível importar. Nada foi apagado; tente de novo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-md px-1 py-1 text-[11px] text-muted-foreground hover:text-foreground">
            <DatabaseIcon className="size-3" /> Dados
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-72">
          <DropdownMenuItem
            onSelect={() => {
              const c = localSnapshotCounts()
              if (!c) toast("Não há dados antigos neste navegador.")
              else setCounts(c)
            }}
          >
            <UploadIcon /> Importar dados antigos deste navegador
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={counts !== null} onOpenChange={(o) => !o && setCounts(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Importar para o banco?</DialogTitle>
            <DialogDescription>
              Encontrei neste navegador: {counts?.leads} leads, {counts?.tasks} tarefas, {counts?.transactions} lançamentos,{" "}
              {counts?.notes} notas e {counts?.mindMaps} mapas. Se for só o exemplo que veio com o app, não importe.
              Itens com o mesmo ID são atualizados; nada é apagado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCounts(null)}>
              Cancelar
            </Button>
            <Button onClick={run} disabled={busy}>
              {busy ? "Importando…" : "Importar"}
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

/** Quem está logado (vem do banco, não dá para trocar) + sair. */
function AccountCard() {
  const meId = useStore((s) => s.meId)
  const meEmail = useStore((s) => s.meEmail)
  const signOut = useStore((s) => s.signOut)
  const hydrated = useStore((s) => s.hydrated)
  const me = getUser(meId)
  // Antes do login carregar, meId ainda é o valor padrão: mostrar um nome agora seria mentira.
  if (!hydrated) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2" aria-label="Carregando conta">
        <Skeleton className="size-7 rounded-full" />
        <div className="grid flex-1 gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5 overflow-hidden rounded-lg border bg-card px-2.5 py-2" title={meEmail}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: me.color }}>
        {me.initials}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-semibold">{me.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{meEmail}</p>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={() => signOut()} aria-label="Sair" title="Sair">
        <LogOutIcon />
      </Button>
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
  const signOut = useStore((s) => s.signOut)
  const hydrated = useStore((s) => s.hydrated)
  const me = TEAM.find((u) => u.id === meId) ?? TEAM[0]
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
            {item.short ?? item.label}
          </Link>
        ))}
        <button
          onClick={() => signOut()}
          className="flex w-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted-foreground"
          aria-label={`Logado como ${me.name}. Sair`}
        >
          {hydrated ? (
            <span className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: me.color }}>
              {me.initials}
            </span>
          ) : (
            <Skeleton className="size-5 rounded-full" />
          )}
          Sair
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

/** Logou, mas não está na lista de membros — ou o banco não respondeu. */
function AccessProblem({ kind }: { kind: "negado" | "erro" }) {
  const email = useStore((s) => s.meEmail)
  const denied = kind === "negado"
  return (
    <div className="flex h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm animate-enter rounded-xl border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl border bg-muted">
          {denied ? <ShieldAlertIcon className="size-5 text-danger" /> : <WifiOffIcon className="size-5 text-muted-foreground" />}
        </div>
        <h1 className="t-title">{denied ? "Acesso não autorizado" : "Sem conexão com o banco"}</h1>
        <p className="t-desc mt-1">
          {denied
            ? `A conta ${email || "usada"} não está na lista de membros do Operacional OS. A sessão foi encerrada.`
            : "Não foi possível carregar os dados. Verifique a internet e tente de novo."}
        </p>
        <Button className="mt-5 w-full" onClick={() => (window.location.href = denied ? "/login" : window.location.pathname)}>
          {denied ? "Voltar ao login" : "Tentar de novo"}
        </Button>
      </div>
    </div>
  )
}
