import { CheckSquareIcon, ClapperboardIcon, HomeIcon, KanbanIcon, NetworkIcon, PackageIcon, WalletIcon } from "lucide-react"

/** Menu principal. Módulo novo = um item aqui (e a pasta da página em src/app). */
export const NAV = [
  { href: "/", label: "Início", icon: HomeIcon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/produtos", label: "Produtos", icon: PackageIcon },
  { href: "/conteudos", label: "Conteúdos", short: "Conteúdo", icon: ClapperboardIcon },
  { href: "/financeiro", label: "Financeiro", short: "Finanças", icon: WalletIcon },
  { href: "/tarefas", label: "Tarefas & Notas", short: "Tarefas", icon: CheckSquareIcon },
  { href: "/mapas", label: "Mapas", icon: NetworkIcon },
] as const

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
