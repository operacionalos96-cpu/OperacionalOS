"use client"

import { create } from "zustand"
import { DEFAULT_FUNNEL, mergeFunnel, mergeVideoPlan, type FunnelStep, type VideoPlan } from "@/lib/domain/funnel"
import { supabaseBrowser } from "@/lib/supabase/client"
import { opsAction } from "@/components/ai-office/ops-store"

/** Roteiro do funil de WhatsApp (o mesmo para o sistema e para a extensão). Fica em ai_settings "whatsapp_funnel". */
interface FunnelState {
  steps: FunnelStep[]
  /** Quando começar a gerar os vídeos personalizados. */
  video: VideoPlan
  loaded: boolean
  load(): Promise<void>
  save(steps: FunnelStep[], video?: VideoPlan): Promise<void>
}

export const useFunnel = create<FunnelState>((set, get) => ({
  steps: DEFAULT_FUNNEL,
  video: { when: "respondeu" },
  loaded: false,
  async load() {
    if (get().loaded) return
    const { data } = await supabaseBrowser().from("ai_settings").select("data").eq("id", "whatsapp_funnel").maybeSingle()
    const d = (data?.data ?? {}) as { steps?: unknown; video?: unknown }
    const steps = mergeFunnel(d.steps)
    set({ steps, video: mergeVideoPlan(d.video, steps), loaded: true })
  },
  async save(steps, video) {
    const r = await opsAction<{ steps: FunnelStep[]; video: VideoPlan }>("funnel.update", { steps, video: video ?? get().video })
    set({ steps: r.steps, video: r.video, loaded: true })
  },
}))
