import { CheckSquareIcon, ClapperboardIcon, HandshakeIcon, HomeIcon, KanbanIcon, KeyRoundIcon, NetworkIcon, PackageIcon, TargetIcon, WalletIcon, type LucideIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  /** Rótulo curto para a barra do celular. */
  short?: string
  icon: LucideIcon
}

/**
 * Menu principal em SEÇÕES (evita a lista longa e sem hierarquia).
 * Módulo novo = um item na seção certa (e a pasta da página em src/app).
 */
export const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [{ href: "/", label: "Início", icon: HomeIcon }],
  },
  {
    title: "Vendas",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
      { href: "/clientes", label: "Clientes", icon: HandshakeIcon },
      { href: "/produtos", label: "Produtos", icon: PackageIcon },
    ],
  },
  {
    title: "Marketing",
    items: [{ href: "/conteudos", label: "Conteúdos", short: "Conteúdo", icon: ClapperboardIcon }],
  },
  {
    title: "Gestão",
    items: [
      { href: "/financeiro", label: "Financeiro", short: "Finanças", icon: WalletIcon },
      { href: "/tarefas", label: "Tarefas & Notas", short: "Tarefas", icon: CheckSquareIcon },
      { href: "/mapas", label: "Mapas", icon: NetworkIcon },
      { href: "/metas", label: "Metas", icon: TargetIcon },
      { href: "/cofre", label: "Cofre", icon: KeyRoundIcon },
    ],
  },

]

/** Lista plana (barra do celular e busca). */
export const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
