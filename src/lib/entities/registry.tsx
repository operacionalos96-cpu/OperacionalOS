"use client"

import { useMemo } from "react"
import {
  CheckSquareIcon,
  ClapperboardIcon,
  CircleDotIcon,
  FileTextIcon,
  NetworkIcon,
  PackageIcon,
  TargetIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import { useStore } from "@/lib/store"
import { useContentItems, useProducts, useGoals, useRelations } from "@/lib/modules"
import { openTaskDetail } from "@/lib/ui-store"
import type { EntityRef, EntityType } from "./types"
import type { EntitySnapshot } from "./summary"
import { useMindMaps } from "@/lib/maps"

/**
 * Registro de entidades (lado da tela): ícone e para onde cada tipo abre.
 * Um módulo novo entra aqui (+ tipo em types.ts e resumo em summary.ts) e
 * automaticamente aparece na busca, nos vínculos, nas relações e no "onde aparece".
 */
export const ENTITY_ICON: Record<EntityType, LucideIcon> = {
  lead: UserIcon,
  task: CheckSquareIcon,
  product: PackageIcon,
  content: ClapperboardIcon,
  transaction: WalletIcon,
  note: FileTextIcon,
  map: NetworkIcon,
  mapNode: CircleDotIcon,
  goal: TargetIcon,
  member: UsersIcon,
}

/** Endereço da página da entidade (tarefa abre em painel, então não tem rota própria). */
export function entityHref(ref: EntityRef): string | null {
  switch (ref.type) {
    case "lead":
      return `/pipeline/${ref.id}`
    case "product":
      return `/produtos/${ref.id}`
    case "content":
      return `/conteudos/${ref.id}`
    case "transaction":
      return "/financeiro"
    case "note":
      return `/tarefas?nota=${ref.id}`
    case "map":
      return `/mapas/${ref.id}`
    case "mapNode":
      return `/mapas/${ref.id.split("/")[0]}`
    case "goal":
      return `/metas/${ref.id}`
    case "member":
      return "/equipe"
    case "task":
      return null
  }
}

/** Abre a entidade do jeito certo para o tipo. */
export function openEntity(ref: EntityRef, navigate: (href: string) => void) {
  if (ref.type === "task") return openTaskDetail(ref.id)
  const href = entityHref(ref)
  if (href) navigate(href)
}

/** Todos os dados necessários para resumir/relacionar qualquer entidade, reativos. */
export function useEntitySnapshot(): EntitySnapshot {
  const leads = useStore((s) => s.leads)
  const tasks = useStore((s) => s.tasks)
  const notes = useStore((s) => s.notes)
  const transactions = useStore((s) => s.transactions)
  const orgMembers = useStore((s) => s.orgMembers)
  const mindMaps = useMindMaps()
  const products = useProducts((s) => s.items)
  const contents = useContentItems((s) => s.items)
  const relations = useRelations((s) => s.items)
  const goals = useGoals((s) => s.items)
  return useMemo(
    () => ({
      leads,
      tasks,
      notes,
      transactions,
      mindMaps,
      products,
      contents,
      relations,
      goals,
      members: orgMembers.map((m) => ({ teamId: m.teamId, displayName: m.displayName, email: m.email })),
    }),
    [leads, tasks, notes, transactions, mindMaps, products, contents, relations, goals, orgMembers],
  )
}
