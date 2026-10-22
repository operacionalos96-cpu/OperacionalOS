"use client"

import { isAtLeast, type RoleLevel } from "@/lib/domain/org"
import { useMeRoleLevel } from "@/lib/store"

/**
 * Hook para controle de acesso declarativo baseado nos níveis de papel:
 * - isOwner: Founder/Admin com governança societária e cofre
 * - canAdmin: Gestão Executiva ou superior (membros, cargos, configurações)
 * - canEdit: Colaborador ou superior (criação/edição de leads, tarefas, lançamentos)
 * - canView: Visualizador ou parceiro (leitura)
 */
export function useAccess() {
  const currentLevel = useMeRoleLevel()

  return {
    level: currentLevel,
    isOwner: currentLevel === "owner",
    canAdmin: isAtLeast(currentLevel, "admin"),
    canEdit: isAtLeast(currentLevel, "operator"),
    canView: isAtLeast(currentLevel, "viewer"),
    hasMinimum: (requiredLevel: RoleLevel) => isAtLeast(currentLevel, requiredLevel),
  }
}
