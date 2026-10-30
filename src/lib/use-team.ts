"use client"

import { useMemo } from "react"
import { TEAM, teamFrom } from "@/config/team"
import { useStore } from "@/lib/store"

/**
 * Pessoas ativas da equipe, derivadas da tabela `members` (fonte única, src/config/team.ts).
 * Atualiza a tela quando alguém é convidado ou desativado — use em listas, filtros e seletores.
 */
export function useTeam() {
  const members = useStore((s) => s.orgMembers)
  return useMemo(() => (members.length ? teamFrom(members) : TEAM), [members])
}
