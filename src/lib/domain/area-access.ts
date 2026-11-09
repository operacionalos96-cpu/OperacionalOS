/**
 * Acesso por área (ADR 0020). Regras puras — a mesma regra que o banco aplica na migration
 * 0025_acesso_por_area.sql. A tela usa estas funções só para mostrar ou esconder; quem decide
 * é o banco. Testadas em area-access.test.ts e, contra o Postgres real, em area-access.rls.test.ts.
 */
import type { RoleLevel } from "./org"

/** Do menor para o maior. Cada nível inclui o anterior. */
export const AREA_LEVELS = ["vitrine", "ver", "operar", "aprovar", "gerir"] as const
export type AreaLevel = (typeof AREA_LEVELS)[number]

export const AREA_LEVEL_LABELS: Record<AreaLevel, string> = {
  vitrine: "Vitrine (só a estrutura)",
  ver: "Ver os dados",
  operar: "Operar",
  aprovar: "Aprovar",
  gerir: "Gerir (construtor)",
}

/** Uma concessão: pessoa × área × nível, com validade opcional (tabela area_access). */
export interface AreaGrant {
  id: string
  memberId: string
  areaId: string
  level: AreaLevel
  /** ISO. Sem data = não vence. */
  expiresAt?: string
  grantedBy: string
  grantedAt: string
}

/** Tabelas cujo dado inteiro pertence a uma área (primeira leva do ADR 0020). */
export const TABLE_AREA: Record<string, string> = {
  transactions: "financeiro",
  finance_settings: "financeiro",
  leads: "comercial",
  activities: "comercial",
}

/** Nível na área que cada nível da empresa dá numa área NÃO restrita. */
const FROM_ROLE: Record<RoleLevel, AreaLevel> = { owner: "gerir", admin: "aprovar", operator: "operar", viewer: "ver" }

const rank = (l: AreaLevel) => AREA_LEVELS.indexOf(l)
export const atLeast = (l: AreaLevel, min: AreaLevel) => rank(l) >= rank(min)
const max = (a: AreaLevel, b: AreaLevel) => (rank(a) >= rank(b) ? a : b)

/** A concessão vale agora? (vencida = não vale) */
export function grantActive(g: Pick<AreaGrant, "expiresAt">, now: Date): boolean {
  return !g.expiresAt || new Date(g.expiresAt).getTime() > now.getTime()
}

/**
 * Nível efetivo de uma pessoa numa área.
 * - owner: gerir em tudo;
 * - área não restrita: o nível da empresa, ou mais se houver concessão;
 * - área restrita: só a concessão; sem ela, vitrine.
 */
export function areaLevel(
  member: { id: string; level: RoleLevel },
  area: { id: string; restricted?: boolean },
  grants: AreaGrant[],
  now: Date,
): AreaLevel {
  if (member.level === "owner") return "gerir"
  const grant = grants.find((g) => g.memberId === member.id && g.areaId === area.id && grantActive(g, now))
  if (area.restricted) return grant?.level ?? "vitrine"
  const base = FROM_ROLE[member.level]
  return grant ? max(base, grant.level) : base
}

/** Pode receber os dados da área? */
export const canReadArea = (level: AreaLevel) => atLeast(level, "ver")

/** Pode gravar na área? Precisa também do nível da empresa (operator+, ADR 0005). */
export function canWriteArea(member: { level: RoleLevel }, level: AreaLevel): boolean {
  return member.level !== "viewer" && atLeast(level, "operar")
}

/**
 * Quem pode conceder `level` nesta área: owner concede qualquer nível; quem tem `gerir` na área
 * (construtor) concede até `operar`. aprovar e gerir só por owner.
 */
export function canGrant(granter: { level: RoleLevel }, granterAreaLevel: AreaLevel, level: AreaLevel): boolean {
  if (granter.level === "owner") return true
  return granterAreaLevel === "gerir" && rank(level) <= rank("operar")
}

/** Níveis que a pessoa pode conceder nesta área (vitrine não se concede: é o que sobra sem acesso). */
export function grantableLevels(granter: { level: RoleLevel }, granterAreaLevel: AreaLevel): AreaLevel[] {
  return AREA_LEVELS.filter((l) => l !== "vitrine" && canGrant(granter, granterAreaLevel, l))
}

/**
 * Uma tarefa: vale a área do item. Sem área, segue a regra geral (todos os membros).
 * Responsável e colaboradores sempre veem a própria tarefa.
 */
export function canSeeTask(
  task: { areaId?: string; ownerId?: string; collaborators?: string[] },
  memberId: string,
  levelOfArea: (areaId: string) => AreaLevel,
): boolean {
  if (!task.areaId) return true
  if (task.ownerId === memberId || task.collaborators?.includes(memberId)) return true
  return canReadArea(levelOfArea(task.areaId))
}
