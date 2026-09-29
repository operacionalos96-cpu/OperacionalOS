import { CheckSquareIcon, HomeIcon, KanbanIcon, NetworkIcon, WalletIcon } from "lucide-react"

export const NAV = [
  { href: "/", label: "Início", icon: HomeIcon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/financeiro", label: "Financeiro", icon: WalletIcon },
  { href: "/tarefas", label: "Tarefas & Notas", short: "Tarefas", icon: CheckSquareIcon },
  { href: "/mapas", label: "Mapas", icon: NetworkIcon },
] as const

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
