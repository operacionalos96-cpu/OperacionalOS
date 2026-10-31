"use client"

import { useMemo } from "react"
import { DEFAULT_AREAS, peopleFrom, type Area, type PeopleContext } from "@/lib/domain/areas"
import { useAreas, useMemberRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"

/**
 * Áreas da empresa (tabela areas, fonte única). Antes da migration 0021 rodar, a tabela vem vazia:
 * mostra a proposta padrão do blueprint (a mesma que a migration semeia) para a tela não ficar vazia.
 */
export function useAreaList(): Area[] {
  const areas = useAreas((s) => s.items)
  return useMemo(() => [...(areas.length ? areas : DEFAULT_AREAS)].sort((a, b) => a.order - b.order), [areas])
}

/** Quem é a CEO e quem são os founders agora (cargos em Equipe › Cargos). */
export function usePeople(): PeopleContext {
  const roles = useMemberRoles((s) => s.items)
  return useMemo(() => peopleFrom(roles), [roles])
}

/** Limite em R$ para um gasto ir à CEO (vazio = não definido). */
export function useCeoLimit() {
  return useStore((s) => s.financeSettings.ceoApprovalLimitCents ?? null)
}
