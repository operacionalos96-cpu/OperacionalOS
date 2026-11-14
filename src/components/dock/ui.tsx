"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BlocksIcon, BotIcon, ChartColumnIcon, CpuIcon, GraduationCapIcon, MessageSquareIcon, MonitorCogIcon, RepeatIcon, ShieldIcon } from "lucide-react"
import { CLASS_TEXT, LEVELS, type ActionClass, type DockAgent, type DockData } from "@/lib/domain/dock"
import type { AgentState } from "@/lib/domain/office"
import { cn } from "@/lib/utils"
import { DockAvatar } from "./dock-avatar"

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
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-[5px] bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium whitespace-nowrap text-muted-foreground [&_svg]:size-3", className)}>
      {children}
    </span>
  )
}
export const StateTag = ({ state }: { state: AgentState }) => <Tag className={STATE_TONE[state]}>{STATE_TEXT[state]}</Tag>
export const LevelTag = ({ level }: { level: number }) => (
  <Tag title={LEVELS[level]?.text}>
    <ShieldIcon />
    Nível {level} · {LEVELS[level]?.title}
  </Tag>
)
export function ClassTag({ k }: { k: ActionClass }) {
  const tone = k === "D" ? "bg-danger-soft text-danger" : k === "C" ? "bg-highlight-soft text-highlight" : k === "B" ? "bg-info-soft text-foreground" : ""
  return <Tag className={tone}>{k} · {CLASS_TEXT[k]}</Tag>
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
  { href: "/dock/apps", label: "Apps e conectores", icon: BlocksIcon },
  { href: "/dock/skills", label: "Skills", icon: GraduationCapIcon },
  { href: "/dock/provedores", label: "Provedores", icon: CpuIcon },
  { href: "/dock/uso", label: "Uso", icon: ChartColumnIcon },
  { href: "/dock/rotinas", label: "Rotinas", icon: RepeatIcon },
  { href: "/dock/pc", label: "PC", icon: MonitorCogIcon },
]

/** Navegação interna do Dock: selecionado = quadrado arredondado de 11 px; o resto, pílula (cantos por papel). */
export function DockNav({ badges }: { badges: Record<string, number> }) {
  const path = usePathname()
  return (
    <nav aria-label="HZK Dock" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      {NAV.map((n) => {
        const active = n.href === "/dock" ? path === "/dock" : path.startsWith(n.href)
        const b = badges[n.href] ?? 0
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground",
              active && "hzk-rail-pick rounded-[11px] bg-card font-semibold text-foreground",
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
