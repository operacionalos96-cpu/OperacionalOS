/**
 * Abas por pessoa (ADR 0012): cada um vê no menu só as abas em que trabalha, para não confundir.
 * Padrão = base do dia a dia + as abas das áreas de que a pessoa é dona ou apoio; o owner pode
 * ajustar pessoa por pessoa (team_settings.pagesByMember) e sempre vê tudo.
 * É ORGANIZAÇÃO do menu, não segurança: o que cada um lê e grava continua no banco (ADR 0005).
 * Regras puras, testadas em access-pages.test.ts.
 */
import { ownerOfArea, type Area, type PeopleContext } from "./areas"
import { isAtLeast, type RoleLevel } from "./org"

/** Todo mundo vê: o dia, a agenda, a captura, o time, as tarefas e as decisões. */
export const BASE_PAGES = ["/", "/agenda", "/caixa-de-entrada", "/equipe", "/tarefas", "/decisoes"]

/** Abas de cada área (id de src/lib/domain/areas.ts). */
export const AREA_PAGES: Record<string, string[]> = {
  comercial: ["/prospeccao", "/pipeline", "/clientes", "/produtos"],
  lancamentos: ["/produtos", "/pipeline", "/clientes"],
  conteudo: ["/conteudos", "/mapas"],
  roteiros: ["/conteudos", "/mapas"],
  trafego: ["/conteudos", "/ai-office"],
  financeiro: ["/financeiro"],
  estrategia: ["/metas", "/mapas"],
  contratos: ["/decisoes"],
  pessoas: ["/equipe"],
}

/** Abas que exigem nível de acesso (mesma regra das próprias telas). */
export const ROLE_PAGES: Record<string, RoleLevel> = { "/configuracoes": "admin", "/cofre": "owner" }

/** As áreas em que a pessoa trabalha: dona ou apoio. */
export function areasOf(memberId: string, areas: Area[], people: PeopleContext): Area[] {
  return areas.filter((a) => ownerOfArea(a, people) === memberId || a.supportIds?.includes(memberId))
}

/** Padrão de uma pessoa: base + abas das áreas dela + as de nível que ela pode usar. */
export function defaultPages(memberId: string, level: RoleLevel, areas: Area[], people: PeopleContext): string[] {
  const set = new Set(BASE_PAGES)
  for (const a of areasOf(memberId, areas, people)) for (const href of AREA_PAGES[a.id] ?? []) set.add(href)
  for (const [href, min] of Object.entries(ROLE_PAGES)) if (isAtLeast(level, min)) set.add(href)
  return [...set]
}

/**
 * O que a pessoa vê. Owner: tudo ("all"). Demais: o ajuste do owner, se houver, senão o padrão.
 * A Início sempre aparece, e uma aba de nível só aparece para quem tem o nível.
 */
export function visiblePages(
  memberId: string,
  level: RoleLevel,
  ctx: { areas: Area[]; people: PeopleContext; overrides?: Record<string, string[]> },
): "all" | Set<string> {
  if (level === "owner") return "all"
  const list = ctx.overrides?.[memberId] ?? defaultPages(memberId, level, ctx.areas, ctx.people)
  return new Set(["/", ...list.filter((href) => !ROLE_PAGES[href] || isAtLeast(level, ROLE_PAGES[href]))])
}

/** A aba (href do menu) a que um caminho pertence: "/equipe/u1" → "/equipe". */
export function pageOf(pathname: string, hrefs: string[]): string | undefined {
  if (pathname === "/") return "/"
  return hrefs.filter((h) => h !== "/" && (pathname === h || pathname.startsWith(`${h}/`))).sort((a, b) => b.length - a.length)[0]
}

export const canSee = (visible: "all" | Set<string>, href: string) => visible === "all" || visible.has(href)
