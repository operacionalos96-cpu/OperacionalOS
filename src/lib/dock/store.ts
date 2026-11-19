"use client"

import { create } from "zustand"
import { toast } from "sonner"
import type { DockData } from "@/lib/domain/dock"
import { SANDBOX } from "@/lib/supabase/env"
import { supabaseBrowser } from "@/lib/supabase/client"
import { friendlyError, type DockApi } from "./api"
import { sandboxDockApi } from "./sandbox-api"
import { supabaseDockApi } from "./supabase-api"

/**
 * Estado do HZK Dock na tela. Uma loja só: carrega tudo o que a RLS devolve, escuta o tempo real
 * e recarrega depois de cada ação. Erros do banco viram aviso em português (friendlyError).
 */
interface DockStore {
  api: DockApi | null
  data: DockData | null
  loading: boolean
  error: string | null
  start: () => () => void
  refresh: () => Promise<void>
  /** Roda uma ação do banco; avisa o erro e devolve null se falhar. */
  run: <T>(fn: (api: DockApi) => Promise<T>, ok?: string) => Promise<T | null>
}

let stopFn: (() => void) | null = null
let users = 0

export const useDock = create<DockStore>((set, get) => ({
  api: null,
  data: null,
  loading: true,
  error: null,

  start() {
    users++
    if (!get().api) {
      const api = SANDBOX ? sandboxDockApi() : supabaseDockApi(supabaseBrowser())
      set({ api })
      void get().refresh()
      stopFn = api.subscribe(() => void get().refresh())
    }
    return () => {
      users--
      if (users === 0) {
        stopFn?.()
        stopFn = null
        set({ api: null })
      }
    }
  },

  async refresh() {
    const api = get().api
    if (!api) return
    try {
      const data = await api.load()
      set({ data, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: friendlyError(e) })
    }
  },

  async run(fn, ok) {
    const api = get().api
    if (!api) return null
    try {
      const r = await fn(api)
      if (ok) toast.success(ok)
      await get().refresh()
      return r
    } catch (e) {
      toast.error(friendlyError(e))
      await get().refresh()
      return null
    }
  },
}))

/** Chave de idempotência: a mesma mensagem enviada duas vezes não vira duas entregas. */
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
