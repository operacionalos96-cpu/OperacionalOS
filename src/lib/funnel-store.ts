"use client"

import { create } from "zustand"
import { DEFAULT_FUNNEL, mergeFunnel, type FunnelStep } from "@/lib/domain/funnel"
import { supabaseBrowser } from "@/lib/supabase/client"
import { opsAction } from "@/components/ai-office/ops-store"

/** Roteiro do funil de WhatsApp (o mesmo para o sistema e para a extensão). Fica em ai_settings "whatsapp_funnel". */
interface FunnelState {
  steps: FunnelStep[]
  loaded: boolean
  load(): Promise<void>
  save(steps: FunnelStep[]): Promise<void>
}

export const useFunnel = create<FunnelState>((set, get) => ({
  steps: DEFAULT_FUNNEL,
  loaded: false,
  async load() {
    if (get().loaded) return
    const { data } = await supabaseBrowser().from("ai_settings").select("data").eq("id", "whatsapp_funnel").maybeSingle()
    set({ steps: mergeFunnel((data?.data as { steps?: unknown } | undefined)?.steps), loaded: true })
  },
  async save(steps) {
    const r = await opsAction<{ steps: FunnelStep[] }>("funnel.update", { steps })
    set({ steps: r.steps, loaded: true })
  },
}))
