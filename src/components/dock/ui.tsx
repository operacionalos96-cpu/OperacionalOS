"use client"

import { useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BlocksIcon, BotIcon, ChartColumnIcon, CpuIcon, GraduationCapIcon, MessageSquareIcon, MonitorCogIcon, RepeatIcon, ShieldIcon } from "lucide-react"
import { CLASS_RULE, CLASS_TEXT, LEVELS, type ActionClass, type DockAgent, type DockData } from "@/lib/domain/dock"
import type { AgentState } from "@/lib/domain/office"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { DockAvatar } from "./dock-avatar"

/**
 * Regra de texto do Dock: a tela não se explica com frases. O que precisa de explicação aparece
 * ao passar o mouse (Hint), no próprio controle, ou no "Como usar" do cabeçalho.
 */
export function Hint({ text, children }: { text?: string | null; children: React.ReactElement }) {
  if (!text) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{text}</TooltipContent>
    </Tooltip>
  )
}

export const STATE_TEXT: Record<AgentState, string> = {
  ocioso: "Livre", trabalhando: "Trabalhando", conversando: "Conversando", na_fila: "Na fila",
  aguardando_aprovacao: "Esperando você", bloqueado: "Bloqueado", pausado: "Pausado",
  sem_cota: "Sem cota", sem_conexao: "Sem conexão", ponte_desligada: "Ponte desligada", manutencao: "Manutenção",
}
const STATE_TONE: Partial<Record<AgentState, string>> = {
  aguardando_aprovacao: "bg-highlight-soft text-highlight", bloqueado: "bg-highlight-soft text-highlight",
  trabalhando: "bg-info-soft text-foreground", conversando: "bg-info-soft text-foreground",
  sem_cota: "bg-warning-soft text-foreground", sem_conexao: "bg-warning-soft text-foreground", ponte_desligada: "bg-warning-soft text-foreground",
}

/** Etiqueta de dado: canto quase reto (regra de cantos da Órbita). */
export function Tag({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <Hint text={title}>
      <span className={cn("inline-flex items-center gap-1 rounded-[5px] bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground [&_svg]:size-3", className)}>
        {children}
      </span>
    </Hint>
  )
}
/** Estado do bot. "Livre" não aparece: o silêncio é o estado normal. */
export const StateTag = ({ state }: { state: AgentState }) => (state === "ocioso" ? null : <Tag className={STATE_TONE[state]}>{STATE_TEXT[state]}</Tag>)
/** Os anéis do avatar já contam o nível; a etiqueta só confirma, e a explicação fica na dica. */
export const LevelTag = ({ level }: { level: number }) => (
  <Tag title={`${LEVELS[level]?.title}: ${LEVELS[level]?.text}`}>
    <ShieldIcon />
    {level}
  </Tag>
)
export function ClassTag({ k }: { k: ActionClass }) {
  const tone = k === "D" ? "bg-danger-soft text-danger" : k === "C" ? "bg-highlight-soft text-highlight" : k === "B" ? "bg-info-soft text-foreground" : ""
  return <Tag className={tone} title={CLASS_RULE[k]}>{CLASS_TEXT[k]}</Tag>
}

export function agentState(d: DockData, a: DockAgent): AgentState {
  if (a.paused || d.suspended) return "pausado"
  return d.states[a.id] ?? "ocioso"
}

export function BotAvatar({ d, a, size = 40, done }: { d: DockData; a: DockAgent; size?: number; done?: boolean }) {
  return <DockAvatar name={a.name} style={a.avatarStyle} color={a.avatarColor} glyph={a.avatarGlyph} level={a.accessLevel} state={agentState(d, a)} size={size} done={done} />
}

const NAV = [
  { href: "/dock", label: "Conversas", icon: MessageSquareIcon },
  { href: "/dock/bots", label: "Bots", icon: BotIcon },
  { href: "/dock/apps", label: "Apps", icon: BlocksIcon },
  { href: "/dock/skills", label: "Skills", icon: GraduationCapIcon },
  { href: "/dock/provedores", label: "IAs", icon: CpuIcon },
  { href: "/dock/uso", label: "Uso", icon: ChartColumnIcon },
  { href: "/dock/rotinas", label: "Rotinas", icon: RepeatIcon },
  { href: "/dock/pc", label: "PC", icon: MonitorCogIcon },
]

/**
 * Navegação interna do Dock. O destaque é uma peça só, que desliza até a aba escolhida
 * (duração e curva de "indicador de aba" do sistema); com "reduzir movimento", ele só troca de lugar.
 */
export function DockNav({ badges }: { badges: Record<string, number> }) {
  const path = usePathname()
  const nav = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number; ready: boolean }>({ left: 0, width: 0, ready: false })
  const current = NAV.find((n) => (n.href === "/dock" ? path === "/dock" : path.startsWith(n.href)))?.href

  useLayoutEffect(() => {
    const root = nav.current
    if (!root) return
    const place = () => {
      const el = root.querySelector<HTMLElement>('[aria-current="page"]')
      if (el) setPill((p) => ({ left: el.offsetLeft, width: el.offsetWidth, ready: p.ready || p.width > 0 }))
      else setPill((p) => ({ ...p, width: 0 }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(root)
    return () => ro.disconnect()
  }, [current, badges])

  return (
    <nav ref={nav} aria-label="HZK Dock" className="relative flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      <span
        aria-hidden
        className={cn("hzk-rail-pick pointer-events-none absolute top-0 h-[calc(100%-0.25rem)] rounded-[11px] bg-card", pill.ready && "transition-[left,width] duration-(--dur-3) ease-(--ease-std)")}
        style={{ left: pill.left, width: pill.width, opacity: pill.width ? 1 : 0 }}
      />
      {NAV.map((n) => {
        const active = n.href === current
        const b = badges[n.href] ?? 0
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-[11px] px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-(--dur-2) hover:text-foreground",
              active ? "font-semibold text-foreground" : "hover:bg-foreground/[0.06]",
            )}
          >
            <n.icon className="size-4" />
            {n.label}
            {b > 0 && <span className="tabular rounded-full bg-highlight px-1.5 text-[10px] font-semibold text-white">{b}</span>}
          </Link>
        )
      })}
    </nav>
  )
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-[15px] bg-card p-4", className)}>{children}</section>
}
export const Label = ({ children }: { children: React.ReactNode }) => <div className="t-label">{children}</div>

/** Botões de filtro e de aba (um selecionado por vez). */
export const pick = (on: boolean) =>
  cn("rounded-[11px] px-3 py-1.5 text-sm transition-colors", on ? "bg-foreground font-medium text-background" : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10 hover:text-foreground")

/** Estado vazio: um ícone, uma linha e, se couber, uma ação. */
export function Empty({ icon: Icon, text, children }: { icon: React.ComponentType<{ className?: string }>; text: string; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 py-12 text-center">
      <Icon className="size-7 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {children}
    </div>
  )
}
