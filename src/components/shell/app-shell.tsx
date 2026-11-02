"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
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
  PinIcon,
  PinOffIcon,
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
import { NAV, NAV_SECTIONS, isActive, type NavItem } from "./nav"
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
          <div key={pathname} className="page-enter flex min-h-0 flex-1 flex-col">
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
      "/pipeline": leadsNeedingAction(leads.filter((l) => l.ownerId === meId), now).length,
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

const PIN_KEY = "hzk-os-sidebar-fixa"
/** Tempo com o mouse parado em cima da barra até ela abrir (evita abrir só de passar por cima). */
const HOVER_OPEN_MS = 250

/**
 * Barra lateral (Briefing UI/UX, ADR 0013): a pílula escura de sempre, em grupos (Dia a dia · Vendas ·
 * Criação · Gestão; Sistema no rodapé fixo). Com o mouse 0,25 s em cima (ou foco pelo teclado) ela se
 * expande sobre o conteúdo, sem empurrá-lo; "fixar" a mantém aberta. O indicador laranja desliza até
 * o item ativo.
 *
 * Animação fluida: o conteúdo tem SEMPRE a mesma arrumação (largura fixa de 220 px, ícones na mesma
 * coluna, rótulos já no lugar). Abrir/fechar só muda a largura visível da pílula (que corta o resto)
 * e a opacidade dos rótulos — nada salta de posição no meio da transição.
 */
function Sidebar() {
  const pathname = usePathname()
  const sections = useNavSections()
  const badges = useBadges()
  const hydrated = useStore((s) => s.hydrated)
  const [hover, setHover] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pointerInside = useRef(false)
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const [pinned, setPinned] = useState(false)
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === "1")
    } catch {}
  }, [])
  const togglePin = () => {
    const next = !pinned
    setPinned(next)
    try {
      localStorage.setItem(PIN_KEY, next ? "1" : "0")
    } catch {}
  }
  const open = pinned || hover
  const main = sections.filter((s) => s.title !== "Sistema")
  const system = sections.find((s) => s.title === "Sistema")

  // Rótulo que aparece com a barra aberta (só opacidade: nunca muda a posição de nada).
  const fade = cn("whitespace-nowrap transition-opacity duration-(--dur-2)", open ? "opacity-100 delay-75" : "pointer-events-none opacity-0")
  // Linha da barra: a pílula de 36 px cresce até a largura toda; o ícone fica sempre no centro dos 64 px.
  const row = cn("ml-3.5 transition-[width] duration-(--dur-4) ease-(--ease-std)", open ? "w-[192px]" : "w-9")

  const item = (it: NavItem) => {
    const active = isActive(pathname, it.href)
    const badge = hydrated ? (badges[it.href] ?? 0) : 0
    return (
      <Link
        key={it.href}
        href={it.href}
        aria-label={it.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/nav relative flex h-9 shrink-0 items-center overflow-hidden rounded-full text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          row,
          active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center">
          <it.icon className="size-[18px] transition-transform duration-(--dur-1) group-hover/nav:scale-110" />
        </span>
        <span className={cn("truncate pr-3 text-sm font-medium", fade)}>{it.label}</span>
        {badge > 0 && (
          <span
            className={cn(
              "tabular absolute flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-sidebar transition-[top,right] duration-(--dur-4) ease-(--ease-std)",
              open ? "top-2.5 right-2.5" : "top-0 right-0",
            )}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    )
  }

  // Título do grupo: mesma altura aberto ou fechado (linha fina fechada, nome aberto) — nada pula.
  const group = (s: (typeof sections)[number], i: number) => (
    <div key={s.title ?? i} className="flex w-full flex-col gap-1">
      {(s.title || i > 0) && (
        <div className="relative h-6 shrink-0" aria-hidden={!open}>
          {i > 0 && <span className={cn("absolute top-1/2 left-5 h-px w-6 bg-sidebar-foreground/10 transition-opacity duration-(--dur-2)", open && "opacity-0")} />}
          {s.title && (
            <p className={cn("absolute bottom-0.5 left-6 text-[11px] font-semibold tracking-wider text-sidebar-foreground/45 uppercase", fade)}>{s.title}</p>
          )}
        </div>
      )}
      {s.items.map(item)}
    </div>
  )

  return (
    <aside className={cn("relative hidden shrink-0 transition-[width] duration-(--dur-4) ease-(--ease-std) md:block", pinned ? "w-[244px]" : "w-[76px]")}>
      <div
        onPointerEnter={(e) => {
          // Só o mouse espera: passar por cima a caminho de outra coisa não abre a barra.
          if (e.pointerType !== "mouse") return
          pointerInside.current = true
          clearTimeout(hoverTimer.current)
          hoverTimer.current = setTimeout(() => setHover(true), HOVER_OPEN_MS)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return
          pointerInside.current = false
          clearTimeout(hoverTimer.current)
          setHover(false)
        }}
        // Teclado (Tab) abre na hora; foco por clique não conta.
        onFocus={(e) => e.target.matches(":focus-visible") && setHover(true)}
        // Perder o foco só fecha se o mouse não está em cima: clicar num espaço vazio da barra ou
        // num link (a navegação tira o foco) não pode fechá-la com o mouse ainda ali.
        onBlur={(e) => !pointerInside.current && !e.currentTarget.contains(e.relatedTarget as Node) && setHover(false)}
        className={cn(
          "absolute inset-y-3 left-3 z-40 overflow-hidden rounded-[28px] bg-sidebar text-sidebar-foreground shadow-lift transition-[width] duration-(--dur-4) ease-(--ease-std) will-change-[width]",
          open ? "w-[220px]" : "w-16",
        )}
      >
        {/* Conteúdo com largura fixa: a pílula só revela mais ou menos dele. */}
        <div className="flex h-full w-[220px] flex-col gap-2.5 py-3.5">
          <div className="flex items-center gap-2 pl-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- símbolo oficial em SVG, estático */}
            <img src="/hzk-simbolo.svg" alt="HZK Company" title="Operacional OS · HZK Company" className="size-10 shrink-0 rounded-full ring-2 ring-sidebar-border" />
            <span className={cn("flex-1 truncate text-sm font-semibold", fade)}>Operacional OS</span>
            <button
              type="button"
              onClick={togglePin}
              tabIndex={open ? 0 : -1}
              aria-pressed={pinned}
              aria-label={pinned ? "Soltar a barra lateral" : "Fixar a barra lateral aberta"}
              title={pinned ? "Soltar" : "Fixar aberta"}
              className={cn("mr-3 rounded-full p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground", fade)}
            >
              {pinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
            </button>
          </div>

          {/* Novo e Buscar sempre em coluna, nos mesmos lugares; o rótulo da busca só aparece. */}
          <div className="flex flex-col gap-1.5 pl-3">
            <NewMenu compact />
          </div>
          <button
            type="button"
            onClick={() => useUI.getState().set({ paletteOpen: true })}
            aria-label="Buscar (Ctrl K)"
            title="Buscar (Ctrl K)"
            className={cn("flex h-9 shrink-0 items-center overflow-hidden rounded-full text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground", row)}
          >
            <span className="flex size-9 shrink-0 items-center justify-center">
              <SearchIcon className="size-[18px]" />
            </span>
            <span className={cn("flex flex-1 items-center pr-2 text-sm font-medium", fade)}>
              Buscar
              <kbd className="ml-auto rounded-md border border-sidebar-border px-1.5 py-0.5 text-[10px] text-sidebar-foreground/60" aria-hidden>
                Ctrl K
              </kbd>
            </span>
          </button>

          <ScrollHint open={open} pathname={pathname}>
            {main.map(group)}
          </ScrollHint>

          {/* Sistema: rodapé fixo, fora da rolagem. */}
          {system && (
            <div className="mx-3 border-t border-sidebar-foreground/10 pt-2">
              <div className="-mx-3">{group({ ...system, title: null }, 0)}</div>
            </div>
          )}
          <div className="flex flex-col gap-2 pl-3">
            <DoingRail />
            <AccountMenu />
          </div>
        </div>
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
function ScrollHint({ children, open, pathname }: { children: React.ReactNode; open: boolean; pathname: string }) {
  const ref = useRef<HTMLElement>(null)
  const [more, setMore] = useState(false)
  // Indicador laranja único que desliza até o item ativo (em vez de piscar em cada item).
  const [mark, setMark] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[aria-current=page]")
    setMark(el ? el.offsetTop + el.offsetHeight / 2 - 8 : null)
  }, [pathname, open, children])
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
      <nav ref={ref} className="relative flex min-h-0 w-full flex-1 flex-col items-start gap-0.5 overflow-y-auto [scrollbar-width:none]">
        {mark !== null && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 h-4 w-1 rounded-r-full bg-highlight transition-[top] duration-(--dur-3) ease-(--ease-std)"
            style={{ top: mark }}
          />
        )}
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
