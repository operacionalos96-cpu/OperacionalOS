import type { User } from "@/lib/domain/types"

/**
 * Pessoas da equipe — fonte ÚNICA: a tabela `members` do banco (carregada na store como
 * `orgMembers`). Aqui só se DERIVA nome, iniciais e cor de cada pessoa, sempre do mesmo jeito,
 * para que a mesma pessoa apareça igual em qualquer tela ou app.
 *
 * - Em componentes, use `useTeam()` (src/lib/use-team.ts): atualiza quando alguém entra ou sai.
 * - `getUser(id)` serve para mostrar quem fez algo (inclusive quem já saiu da equipe).
 * - `TEAM` é a lista atual de pessoas ativas, para código fora de componentes.
 */

/** Cores fixas de quem já existia (não mudam de uma versão para outra). */
const FIXED: Record<string, { name: string; color: string }> = {
  u1: { name: "Gabriel", color: "#2f6fb0" },
  u2: { name: "Igor", color: "#f59e0b" },
}

/** Demais pessoas: cor escolhida pelo id (estável — não depende da ordem da lista). */
const PALETTE = ["#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#84cc16", "#e11d48"]

export function colorFor(id: string): string {
  if (FIXED[id]) return FIXED[id].color
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export interface MemberLike {
  teamId: string
  displayName?: string
  email: string
  active?: boolean
  joinedAt?: string
}

/** Como uma pessoa aparece no app. O nome cadastrado no banco sempre vence. */
export function userFrom(m: MemberLike): User {
  const name = m.displayName?.trim() || FIXED[m.teamId]?.name || m.email.split("@")[0] || m.teamId
  return { id: m.teamId, name, initials: initialsOf(name), color: colorFor(m.teamId) }
}

/** Lista de pessoas ATIVAS, sempre na mesma ordem (quem entrou primeiro vem antes). */
export function teamFrom(members: MemberLike[]): User[] {
  return members
    .filter((m) => m.active !== false && m.teamId)
    .sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "") || a.teamId.localeCompare(b.teamId))
    .map(userFrom)
}

// ---------- diretório atual (preenchido pela store quando o banco carrega) ----------

/** Antes do banco responder: só os fundadores, para a tela não piscar vazia. */
export const TEAM: User[] = Object.entries(FIXED).map(([id, f]) => ({ id, name: f.name, initials: initialsOf(f.name), color: f.color }))
const everyone = new Map<string, User>(TEAM.map((u) => [u.id, u]))

/** Chamado pela store a cada carga de `members`. Substitui a lista inteira (nunca acumula). */
export function syncTeamMembers(members: MemberLike[]) {
  for (const m of members) everyone.set(m.teamId, userFrom(m))
  TEAM.splice(0, TEAM.length, ...teamFrom(members))
}

export function getUser(id: string): User {
  return everyone.get(id) ?? { id, name: id, initials: id.slice(0, 2).toUpperCase(), color: colorFor(id) }
}
