/**
 * Estrutura Organizacional — Tipos e regras de negócio puras (sem dependência de React/DOM).
 * Suporta múltiplos cargos por pessoa, superior imediato (hierarquia) e níveis de acesso (roles).
 */

export type RoleLevel = "owner" | "admin" | "operator" | "viewer"

export interface RoleLevelMeta {
  id: RoleLevel
  label: string
  description: string
  rank: number
}

export const ROLE_LEVELS: RoleLevelMeta[] = [
  { id: "owner",    label: "Founder / Admin",        description: "Acesso total, governança societária e cofre", rank: 4 },
  { id: "admin",    label: "Gestão Executiva",        description: "Acesso executivo geral, equipes e operações", rank: 3 },
  { id: "operator", label: "Colaborador",             description: "Execução operacional: CRM, tarefas, projetos", rank: 2 },
  { id: "viewer",   label: "Visualizador / Parceiro", description: "Somente leitura de dados e relatórios",       rank: 1 },
]

export interface OrgRole {
  id: string
  title: string
  description?: string
  level: RoleLevel
  color?: string
  icon?: string
  active: boolean
  updatedAt?: string
}

export interface MemberRole {
  id: string
  memberId: string
  roleId: string
  isPrimary?: boolean
  /** Id do membro a quem responde diretamente nesta função */
  reportsToMemberId?: string
  assignedAt: string
  assignedBy: string
  updatedAt?: string
}

export interface OrgMember {
  email: string
  teamId: string
  displayName?: string
  avatarUrl?: string
  roleLevel: RoleLevel
  active: boolean
  joinedAt: string
}

/** Retorna a pontuação hierárquica do nível para comparação. */
export function rankOf(level: RoleLevel): number {
  return ROLE_LEVELS.find((r) => r.id === level)?.rank ?? 0
}

/** Retorna true se o nível do membro for igual ou superior ao nível mínimo exigido. */
export function isAtLeast(current: RoleLevel, required: RoleLevel): boolean {
  return rankOf(current) >= rankOf(required)
}

/** Retorna a lista de cargos atribuídos a um membro específico. */
export function rolesOfMember(
  memberId: string,
  memberRoles: MemberRole[],
  orgRoles: OrgRole[],
): OrgRole[] {
  const assignedRoleIds = new Set(
    memberRoles.filter((mr) => mr.memberId === memberId).map((mr) => mr.roleId),
  )
  return orgRoles.filter((r) => assignedRoleIds.has(r.id))
}

/** Retorna o cargo principal de um membro (marcado como isPrimary ou primeiro encontrado). */
export function primaryRole(
  memberId: string,
  memberRoles: MemberRole[],
  orgRoles: OrgRole[],
): OrgRole | undefined {
  const assignments = memberRoles.filter((mr) => mr.memberId === memberId)
  if (assignments.length === 0) return undefined
  const primaryAssignment = assignments.find((mr) => mr.isPrimary) ?? assignments[0]
  return orgRoles.find((r) => r.id === primaryAssignment.roleId)
}

/** Retorna o ID do superior imediato de um membro. */
export function leaderOfMember(memberId: string, memberRoles: MemberRole[]): string | undefined {
  const assignmentWithLeader = memberRoles.find(
    (mr) => mr.memberId === memberId && !!mr.reportsToMemberId,
  )
  return assignmentWithLeader?.reportsToMemberId
}

/**
 * Previne loops hierárquicos: verifica se definir `targetLeaderId` como superior de `memberId`
 * criaria um ciclo na árvore de subordinação (ex.: A manda em B que manda em A).
 */
export function wouldCreateHierarchyCycle(
  memberId: string,
  targetLeaderId: string | undefined,
  memberRoles: MemberRole[],
): boolean {
  if (!targetLeaderId) return false
  if (memberId === targetLeaderId) return true

  const visited = new Set<string>([memberId])
  let currentLeader: string | undefined = targetLeaderId

  while (currentLeader) {
    if (visited.has(currentLeader)) {
      return true
    }
    visited.add(currentLeader)
    currentLeader = leaderOfMember(currentLeader, memberRoles)
  }

  return false
}

export interface OrgTreeNode {
  memberId: string
  subordinates: OrgTreeNode[]
}

/** Monta a árvore hierárquica baseada nos líderes imediatos. */
export function buildHierarchyTree(
  memberIds: string[],
  memberRoles: MemberRole[],
): OrgTreeNode[] {
  const childrenMap = new Map<string, string[]>()
  const hasLeader = new Set<string>()

  for (const id of memberIds) {
    childrenMap.set(id, [])
  }

  for (const id of memberIds) {
    const leader = leaderOfMember(id, memberRoles)
    if (leader && memberIds.includes(leader)) {
      childrenMap.get(leader)?.push(id)
      hasLeader.add(id)
    }
  }

  // Raízes da hierarquia (quem não reporta a ninguém ou reporta a um líder fora da lista)
  const rootIds = memberIds.filter((id) => !hasLeader.has(id))

  function buildNode(id: string, visited: Set<string>): OrgTreeNode {
    visited.add(id)
    const childIds = (childrenMap.get(id) ?? []).filter((childId) => !visited.has(childId))
    return {
      memberId: id,
      subordinates: childIds.map((c) => buildNode(c, new Set(visited))),
    }
  }

  return rootIds.map((r) => buildNode(r, new Set()))
}
