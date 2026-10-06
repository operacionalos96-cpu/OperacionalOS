"use client"

import { create } from "zustand"
import type { Lead, SiteInfo } from "@/lib/domain/types"
import { useStore } from "@/lib/store"

/**
 * Lê os sites dos leads um por um (o Gemini gratuito aceita ~15 pedidos/min), salvando em
 * lead.siteInfo. Roda enquanto a página estiver aberta; dá para parar e continuar depois.
 */
interface RunnerState {
  running: boolean
  done: number
  total: number
  current: string | null
  last: string | null
  start(leads: Lead[]): void
  stop(): void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Precisa ler: tem site e ainda não foi lido (ou a IA estava fora da última vez). */
export const needsSiteInfo = (l: Lead) => !!l.website && (!l.siteInfo || (!!l.siteInfo.error && /IA/.test(l.siteInfo.error)))

export async function readSite(leadId: string): Promise<{ siteInfo?: SiteInfo; erro?: string; retry?: boolean }> {
  const res = await fetch("/api/leads/site-info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId }), cache: "no-store" })
  const body = await res.json().catch(() => ({}))
  return res.ok ? body : { erro: body.erro ?? "falhou", retry: res.status === 429 || res.status >= 500 }
}

export const useSiteInfoRunner = create<RunnerState>((set, get) => ({
  running: false,
  done: 0,
  total: 0,
  current: null,
  last: null,
  start(leads) {
    if (get().running) return
    const queue = leads.filter(needsSiteInfo)
    set({ running: true, done: 0, total: queue.length, current: null, last: null })
    void (async () => {
      for (const l of queue) {
        if (!get().running) break
        set({ current: l.name })
        let r = await readSite(l.id)
        for (let tries = 0; r.retry && tries < 3 && get().running; tries++) {
          await sleep(30_000) // limite do plano gratuito: espera e tenta de novo
          r = await readSite(l.id)
        }
        if (r.siteInfo) {
          useStore.getState().updateLead(l.id, { siteInfo: r.siteInfo })
          const s = r.siteInfo
          set({ last: s.error && !s.segment && !s.city ? `${l.name}: ${s.error}` : `${l.name} → ${[s.segment, s.city].filter(Boolean).join(" · ") || "sem dados"}` })
        } else set({ last: `${l.name}: ${r.erro}` })
        set((st) => ({ done: st.done + 1 }))
        await sleep(5500)
      }
      set({ running: false, current: null })
    })()
  },
  stop() {
    set({ running: false })
  },
}))
