import type { User } from "@/lib/domain/types"

/**
 * A equipe. Edite nomes e cores aqui — é o único lugar necessário.
 * Os `id`s não devem mudar depois que houver dados salvos.
 */
export const TEAM: User[] = [
  { id: "u1", name: "Gabriel", initials: "GA", color: "#2f6fb0" },
  { id: "u2", name: "Igor", initials: "IG", color: "#f59e0b" },
]

export function getUser(id: string): User {
  return TEAM.find((u) => u.id === id) ?? TEAM[0]
}
