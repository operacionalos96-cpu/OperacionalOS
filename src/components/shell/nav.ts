import type { LucideIcon } from "lucide-react"
import { PAGES } from "@/config/pages"

export interface NavItem {
  href: string
  label: string
  /** Rótulo curto para a barra do celular. */
  short?: string
  icon: LucideIcon
}

/**
 * Menu principal em SEÇÕES, derivado de src/config/pages.ts (fonte única de nome e ícone de cada
 * página). Página nova = uma entrada em PAGES (e a pasta da página em src/app).
 */
export const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = PAGES.reduce<{ title: string | null; items: NavItem[] }[]>((sections, p) => {
  const item: NavItem = { href: p.href, label: p.title, short: "short" in p ? p.short : undefined, icon: p.icon }
  const last = sections.at(-1)
  if (last && last.title === p.section) last.items.push(item)
  else sections.push({ title: p.section, items: [item] })
  return sections
}, [])

/** Lista plana (barra do celular e busca). */
export const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href)
}
