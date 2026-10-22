import type { User } from "@/lib/domain/types"

/** Cores padrão para membros dinâmicos da equipe */
const PALETTE = [
  "#2f6fb0", // Azul Gabriel
  "#f59e0b", // Âmbar Igor
  "#10b981", // Esmeralda
  "#8b5cf6", // Violeta
  "#ec4899", // Rosa
  "#06b6d4", // Ciano
  "#f97316", // Laranja
  "#6366f1", // Índigo
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * A equipe inicial / fallback.
 * Quando o banco carregar, membros adicionais são sincronizados via syncTeamMembers.
 */
export const TEAM: User[] = [
  { id: "u1", name: "Gabriel", initials: "GA", color: "#2f6fb0" },
  { id: "u2", name: "Igor", initials: "IG", color: "#f59e0b" },
]

const dynamicUsers = new Map<string, User>()

export function syncTeamMembers(members: { teamId: string; displayName?: string; email: string }[]) {
  for (let i = 0; i < members.length; i++) {
    const m = members[i]
    const existingStatic = TEAM.find((t) => t.id === m.teamId)
    const name = m.displayName || m.email.split("@")[0] || m.teamId
    const user: User = {
      id: m.teamId,
      name: existingStatic ? existingStatic.name : name,
      initials: existingStatic ? existingStatic.initials : getInitials(name),
      color: existingStatic ? existingStatic.color : PALETTE[i % PALETTE.length],
    }
    dynamicUsers.set(m.teamId, user)

    // Se não estiver em TEAM, adiciona para que dropdowns e filtros conheçam o novo membro
    if (!TEAM.some((t) => t.id === m.teamId)) {
      TEAM.push(user)
    }
  }
}

export function getUser(id: string): User {
  return dynamicUsers.get(id) ?? TEAM.find((u) => u.id === id) ?? {
    id,
    name: id,
    initials: id.slice(0, 2).toUpperCase(),
    color: "#64748b",
  }
}
