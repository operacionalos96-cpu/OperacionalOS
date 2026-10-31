"use client"

import { useEffect, useMemo, useState } from "react"
import { create } from "zustand"
import { planId, presenceOf, type Presence } from "@/lib/domain/presence"
import { useCalendarEvents, useDailyPlans } from "@/lib/modules"
import { SANDBOX } from "@/lib/supabase/env"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * "Online" automático (ADR 0009): cada aba aberta entra num canal de presença do Supabase com o
 * team_id da pessoa e some sozinha ao fechar. Nada é gravado no banco.
 */
export const useOnline = create<{ ids: Set<string> }>(() => ({ ids: new Set() }))

let started = false
export function startPresence(meId: string) {
  if (started || !meId) return
  started = true
  if (SANDBOX) {
    useOnline.setState({ ids: new Set([meId]) })
    return
  }
  const channel = supabaseBrowser().channel("presenca-time", { config: { presence: { key: meId } } })
  channel
    .on("presence", { event: "sync" }, () => useOnline.setState({ ids: new Set(Object.keys(channel.presenceState())) }))
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ desde: new Date().toISOString() })
    })
}

/** Relógio que anda de minuto em minuto: o status muda sozinho quando uma reunião começa ou acaba. */
export function useMinute() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}

/** Status de uma pessoa agora (agenda + app aberto + check-in), pela regra de src/lib/domain/presence.ts. */
export function usePresence(memberId: string): Presence {
  const now = useMinute()
  const events = useCalendarEvents((s) => s.items)
  const plans = useDailyPlans((s) => s.items)
  const online = useOnline((s) => s.ids.has(memberId))
  return useMemo(() => presenceOf(memberId, now, { events, online, plan: plans.find((p) => p.id === planId(memberId, now)) }), [memberId, now, events, online, plans])
}
