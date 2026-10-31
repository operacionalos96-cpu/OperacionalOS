"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  CheckSquareIcon,
  ChevronDownIcon,
  InboxIcon,
  LogOutIcon,
  MenuIcon,
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
import { getUser } from "@/config/team"
import { isOverdue, isTaskFor, leadsNeedingAction } from "@/lib/domain/rules"
import { importLocalData, localSnapshotCounts } from "@/lib/import-local"
import { useStore } from "@/lib/store"
import { openCapture, openLeadForm, openTaskForm, openTxForm, useUI } from "@/lib/ui-store"
import { inInbox } from "@/lib/domain/items"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { LeadFormDialog } from "@/components/dialogs/lead-form-dialog"
import { TaskFormDialog } from "@/components/dialogs/task-form-dialog"
import { TransactionFormDialog } from "@/components/dialogs/transaction-form-dialog"
import { LostDialog, NextActionDialog, WonDialog } from "@/components/dialogs/lead-flow-dialogs"
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet"
import { CommandPalette } from "./command-palette"
import { QuickCapture } from "@/components/hzk/quick-capture"
import { DayGuide } from "@/components/hzk/day-guide"
import { DoingRail } from "@/components/hzk/doing-now"
import { PresenceDot } from "@/components/hzk/presence-badge"
import { startPresence } from "@/lib/presence"
import { startAutomations } from "@/lib/automations"
import { startEventFeed } from "@/lib/event-service"
import { NAV, NAV_SECTIONS, isActive } from "./nav"
import { pageOf } from "@/lib/domain/access-pages"
import { useVisiblePages } from "@/lib/use-access-pages"

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

  // Automações começam depois que os dados chegaram (senão tudo pareceria "novo").
  const router = useRouter()
  useEffect(() => {
    if (!hydrated) return
    startAutomations((href) => router.push(href))
    startEventFeed()
    // Presença do time (ADR 0009): avisa "estou com o app aberto" enquanto a aba estiver aberta.
    startPresence(useStore.getState().meId)
  }, [hydrated, router])

  useGlobalShortcuts()
  const pathname = usePathname()
  const focusMode = useUI((s) => s.focusMode)
  // Modo foco só vale dentro de um mapa: ao sair da página, a barra lateral volta.
  useEffect(() => {
    if (!pathname.startsWith("/mapas/")) useUI.getState().set({ focusMode: false })
  }, [pathname])

  if (access === "negado" || access === "erro") return <AccessProblem kind={access} />

  return (
    <div className="flex h-dvh overflow-hidden">
      {!focusMode && <Sidebar />}
      <main className={cn("flex min-w-0 flex-1 flex-col overflow-y-auto", !focusMode && "pb-16 md:pb-0")}>
        {/* key por rota: cada página entra com um fade curto. */}
        {hydrated ? (
          <div key={pathname} className="flex min-h-0 flex-1 animate-enter flex-col">
            <PageGate pathname={pathname}>{children}</PageGate>
          </div>
        ) : (
          <PageSkeleton />
        )}
      </main>
      {!focusMode && <MobileNav />}
      {hydrated && (
        <>
          <CommandPalette />
          <QuickCapture />
          <DayGuide />
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
  const items = useStore((s) => s.items)
  const meId = useStore((s) => s.meId)
  return useMemo(() => {
    const now = new Date()
    return {
      "/caixa-de-entrada": [...items, ...tasks].filter((t) => inInbox(t) && (t.ownerId === meId || t.createdById === meId || !t.ownerId)).length,
      "/pipeline": leadsNeedingAction(leads, now).length,
      "/tarefas": tasks.filter((t) => !t.done && isTaskFor(t, meId) && isOverdue(t.dueDate, now)).length,
    } as Record<string, number>
  }, [leads, tasks, items, meId])
}

/** Menu em seções, só com as abas que esta pessoa vê (ADR 0012); seção vazia some. */
function useNavSections() {
  const can = useVisiblePages()
  return useMemo(() => NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => can(i.href)) })).filter((s) => s.items.length), [can])
}

/** Aba fora do menu da pessoa, aberta por link: explica em vez de mostrar uma tela que não é dela. */
function PageGate({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const can = useVisiblePages()
  const page = pageOf(pathname, NAV.map((i) => i.href))
  if (!page || can(page)) return <>{children}</>
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm animate-enter rounded-2xl border bg-card p-6 text-center shadow-card">
        <p className="t-title">Esta aba não está no seu menu</p>
        <p className="t-desc mt-1 text-sm">Cada pessoa vê as abas da sua área, para o dia ficar mais simples. Se precisar desta, peça ao Igor para liberar.</p>
        <Button asChild className="mt-5 w-full">
          <Link href="/">Voltar ao Início</Link>
        </Button>
      </div>
    </div>
  )
}

function Sidebar() {
  const pathname = usePathname()
  const sections = useNavSections()
  const badges = useBadges()
  const hydrated = useStore((s) => s.hydrated)

  return (
    // Pílula escura flutuante, só ícones; o nome aparece no balão ao passar o mouse.
    <aside className="hidden shrink-0 p-3 pr-0 md:flex">
      <div className="flex w-16 flex-col items-center gap-2.5 rounded-[28px] bg-sidebar py-3.5 text-sidebar-foreground shadow-lift">
        {/* eslint-disable-next-line @next/next/no-img-element -- símbolo oficial em SVG, estático */}
        <img src="/hzk-simbolo.svg" alt="HZK Company" title="Operacional OS · HZK Company" className="size-10 rounded-full ring-2 ring-sidebar-border" />

        <div className="flex flex-col items-center gap-1.5">
          <NewMenu compact />
          <RailButton label="Buscar (Ctrl K)" onClick={() => useUI.getState().set({ paletteOpen: true })}>
            <SearchIcon className="size-[18px]" />
          </RailButton>
        </div>

        {/* w-full: a rolagem corta o que sai da largura; o marcador laranja fica na borda da pílula.
            Em tela baixa, ScrollHint mostra que há mais itens embaixo (antes ficavam escondidos sem aviso). */}
        <ScrollHint>
          {sections.map((section, si) => (
            <div key={si} className="flex flex-col items-center gap-1">
              {si > 0 && <span className="my-1 h-px w-6 bg-sidebar-border" aria-hidden />}
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                const badge = hydrated ? badges[item.href] : 0
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group/nav relative flex size-9 shrink-0 items-center justify-center rounded-full text-sidebar-foreground/55 transition-[background-color,color] duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
                        )}
                      >
                        {/* Ativo = círculo claro + marcador laranja na borda da pílula. */}
                        <span
                          className={cn(
                            "absolute top-1/2 -left-3 h-4 w-1 -translate-y-1/2 rounded-r-full bg-highlight transition-transform duration-300",
                            active ? "scale-y-100" : "scale-y-0",
                          )}
                        />
                        <item.icon className="size-[18px] transition-transform duration-200 group-hover/nav:scale-110" />
                        {badge > 0 && (
                          <span className="tabular absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-xs font-semibold text-white ring-2 ring-sidebar">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          ))}
        </ScrollHint>

        <DoingRail />
        <AccountMenu />
      </div>
    </aside>
  )
}

function NewMenu({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact ? (
          <Button size="icon" className="size-10 rounded-full shadow-lg [--btn-bg:var(--brand)] [--btn-fg:white]" aria-label="Novo" title="Novo">
            <PlusIcon className="size-5" />
          </Button>
        ) : (
          <Button className="w-full justify-start">
            <PlusIcon /> Novo
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "right" : undefined} className="w-60">
        {/* HZK OS: captura em uma linha vai para a caixa de entrada; a triagem decide depois. */}
        <DropdownMenuItem onSelect={() => openCapture()}>
          <InboxIcon /> Captura rápida
          <DropdownMenuShortcut>Ctrl K</DropdownMenuShortcut>
        </DropdownMenuItem>
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

const RAIL_BUTTON =
  "flex size-10 items-center justify-center rounded-full text-sidebar-foreground/55 transition-[background-color,color] duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground"

/** Botão redondo da barra lateral, com o nome no balão à direita. */
function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button onClick={onClick} aria-label={label} className={RAIL_BUTTON}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Menu da conta (avatar): quem está logado, tema, importar dados antigos e sair — num botão só,
 * para sobrar espaço na barra e todas as áreas caberem na tela.
 */
function AccountMenu() {
  const meId = useStore((s) => s.meId)
  const meEmail = useStore((s) => s.meEmail)
  const signOut = useStore((s) => s.signOut)
  const hydrated = useStore((s) => s.hydrated)
  const { theme, setTheme } = useTheme()
  const [counts, setCounts] = useState<ReturnType<typeof localSnapshotCounts>>(null)
  const [busy, setBusy] = useState(false)
  const me = getUser(meId)

  async function runImport() {
    setBusy(true)
    try {
      const n = await importLocalData()
      toast.success(`${n} itens importados`, { description: "Já estão no banco e aparecem para todos." })
      setCounts(null)
      setTimeout(() => window.location.reload(), 800)
    } catch {
      toast.error("Não foi possível importar. Nada foi apagado; tente de novo.")
    } finally {
      setBusy(false)
    }
  }

  // Antes do login carregar, meId ainda é o valor padrão: mostrar um nome agora seria mentira.
  if (!hydrated) return <Skeleton className="size-10 rounded-full bg-sidebar-accent" aria-label="Carregando conta" />
  const themes = [
    { id: "light", icon: SunIcon, label: "claro" },
    { id: "dark", icon: MoonIcon, label: "escuro" },
    { id: "system", icon: MonitorIcon, label: "automático" },
  ] as const
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Conta de ${me.name}: tema, dados e sair`}
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ring-2 ring-sidebar-border transition-transform hover:scale-105"
            style={{ backgroundColor: me.color }}
          >
            {me.initials}
            <PresenceDot memberId={meId} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right" className="w-64">
          <div className="px-2 py-1.5">
            <p className="text-sm font-semibold">{me.name}</p>
            <p className="truncate text-xs text-muted-foreground">{meEmail}</p>
          </div>
          <DropdownMenuSeparator />
          {themes.map((o) => (
            <DropdownMenuItem key={o.id} onSelect={() => setTheme(o.id)} className={cn(theme === o.id && "font-semibold")}>
              <o.icon /> Tema {o.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              const c = localSnapshotCounts()
              if (!c) toast("Não há dados antigos neste navegador.")
              else setCounts(c)
            }}
          >
            <UploadIcon /> Importar dados antigos deste navegador
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOut()}>
            <LogOutIcon /> Sair
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
            <Button onClick={runImport} disabled={busy}>
              {busy ? "Importando…" : "Importar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Lista que rola com um sinal visível quando há mais itens embaixo (degradê + seta). */
function ScrollHint({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    el.addEventListener("scroll", check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", check)
      ro.disconnect()
    }
  }, [])
  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <nav ref={ref} className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto [scrollbar-width:none]">
        {children}
      </nav>
      {more && (
        <button
          type="button"
          onClick={() => ref.current?.scrollBy({ top: 160, behavior: "smooth" })}
          aria-label="Mais áreas abaixo"
          className="absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-gradient-to-t from-sidebar to-transparent pb-1 text-sidebar-foreground/70"
        >
          <ChevronDownIcon className="size-4 animate-bounce" />
        </button>
      )}
    </div>
  )
}

/** No celular: os destinos mais usados embaixo + "Menu" com todas as áreas (letra e toque grandes). */
const MOBILE_MAIN = ["/", "/pipeline", "/tarefas", "/financeiro"]

function MobileNav() {
  const pathname = usePathname()
  const meId = useStore((s) => s.meId)
  const signOut = useStore((s) => s.signOut)
  const [menuOpen, setMenuOpen] = useState(false)
  const me = getUser(meId)
  const sections = useNavSections()
  const visible = sections.flatMap((s) => s.items)
  // Barra do celular: as 4 de sempre que a pessoa vê; faltando, completa com as próximas do menu dela.
  const main = [...visible.filter((i) => MOBILE_MAIN.includes(i.href)), ...visible.filter((i) => !MOBILE_MAIN.includes(i.href))].slice(0, 4)
  const inMenu = !main.some((i) => isActive(pathname, i.href))
  const tab = "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
  return (
    <>
      <div className="fixed right-4 bottom-20 z-40 md:hidden">
        <NewMenu compact />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t bg-background/95 backdrop-blur md:hidden">
        {main.map((item) => (
          <Link key={item.href} href={item.href} className={cn(tab, isActive(pathname, item.href) && "text-brand")}>
            <item.icon className="size-5" />
            {item.short ?? item.label}
          </Link>
        ))}
        <button onClick={() => setMenuOpen(true)} className={cn(tab, inMenu && "text-brand")} aria-label="Abrir todas as áreas">
          <MenuIcon className="size-5" />
          Menu
        </button>
      </nav>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Todas as áreas</SheetTitle>
          </SheetHeader>
          <div className="grid gap-5 px-4 pb-6">
            {sections.map((section, si) => (
              <div key={si}>
                {section.title && <p className="t-label mb-2">{section.title}</p>}
                <div className="grid grid-cols-2 gap-2">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex h-12 items-center gap-2.5 rounded-2xl border bg-card px-3 text-sm font-medium",
                        isActive(pathname, item.href) && "border-brand text-brand",
                      )}
                    >
                      <item.icon className="size-5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <button
              onClick={() => signOut()}
              className="flex h-12 items-center gap-2.5 rounded-2xl border bg-card px-3 text-sm font-medium text-muted-foreground"
            >
              <span className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ backgroundColor: me.color }}>
                {me.initials}
              </span>
              Sair ({me.name})
            </button>
          </div>
        </SheetContent>
      </Sheet>
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
