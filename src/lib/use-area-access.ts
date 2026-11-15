"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { supabaseBrowser } from "@/lib/supabase/client"
import type { AreaGrant, AreaLevel } from "@/lib/domain/area-access"

/** Linha da tabela area_access (migration 0025). */
interface Row {
  id: string
  member_id: string
  area_id: string
  level: AreaLevel
  expires_at: string | null
  granted_by: string
  granted_at: string
}

const fromRow = (r: Row): AreaGrant => ({
  id: r.id,
  memberId: r.member_id,
  areaId: r.area_id,
  level: r.level,
  expiresAt: r.expires_at ?? undefined,
  grantedBy: r.granted_by,
  grantedAt: r.granted_at,
})

/** Mensagem para a pessoa quando o banco recusa (RLS ou trava da área). */
function explain(message: string) {
  if (/row-level security|permission denied|42501|Só um owner/i.test(message)) return "Você não tem permissão para isso nesta área."
  return "Não foi possível salvar. Tente de novo."
}

/**
 * Concessões de acesso por área (ADR 0020). O banco devolve só as que a pessoa pode ver:
 * as próprias, as das áreas que ela gere e, para owner, todas. Atualiza em tempo real.
 */
export function useAreaAccess() {
  const [grants, setGrants] = useState<AreaGrant[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("area_access").select("*")
    if (!error) setGrants(((data as Row[] | null) ?? []).map(fromRow))
    setLoaded(true)
  }, [])

  useEffect(() => {
    void reload()
    const sb = supabaseBrowser()
    const ch = sb
      .channel("acesso-por-area")
      .on("postgres_changes", { event: "*", schema: "public", table: "area_access" }, () => void reload())
      .subscribe()
    return () => void sb.removeChannel(ch)
  }, [reload])

  /** Concede (ou troca o nível/prazo de) o acesso de uma pessoa a uma área. */
  const grant = useCallback(
    async (input: { memberId: string; areaId: string; level: AreaLevel; expiresAt?: string; grantedBy: string }) => {
      const existing = grants.find((g) => g.memberId === input.memberId && g.areaId === input.areaId)
      const { error } = await supabaseBrowser()
        .from("area_access")
        .upsert({
          id: existing?.id ?? `acc_${crypto.randomUUID().replaceAll("-", "")}`,
          member_id: input.memberId,
          area_id: input.areaId,
          level: input.level,
          expires_at: input.expiresAt ?? null,
          granted_by: input.grantedBy,
        })
      if (error) {
        toast.error(explain(error.message))
        return false
      }
      toast.success(existing ? "Acesso atualizado" : "Acesso concedido")
      await reload()
      return true
    },
    [grants, reload],
  )

  const revoke = useCallback(
    async (id: string) => {
      const { error } = await supabaseBrowser().from("area_access").delete().eq("id", id)
      if (error) {
        toast.error(explain(error.message))
        return
      }
      toast.success("Acesso retirado")
      await reload()
    },
    [reload],
  )

  return { grants, loaded, grant, revoke, reload }
}
