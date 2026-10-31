"use client"

import { useMemo } from "react"
import { canSee, visiblePages } from "@/lib/domain/access-pages"
import { TEAM_SETTINGS_ID } from "@/lib/domain/daily"
import { useTeamSettings } from "@/lib/modules"
import { useMeRoleLevel, useStore } from "@/lib/store"
import { useAreaList, usePeople } from "@/lib/use-hzk"

/** As abas que EU vejo (src/lib/domain/access-pages.ts): menu, busca, celular e cartões da Início. */
export function useVisiblePages(): (href: string) => boolean {
  const meId = useStore((s) => s.meId)
  const level = useMeRoleLevel()
  const areas = useAreaList()
  const people = usePeople()
  const overrides = useTeamSettings((s) => s.items.find((x) => x.id === TEAM_SETTINGS_ID)?.pagesByMember)
  return useMemo(() => {
    const v = visiblePages(meId, level, { areas, people, overrides })
    return (href: string) => canSee(v, href)
  }, [meId, level, areas, people, overrides])
}
