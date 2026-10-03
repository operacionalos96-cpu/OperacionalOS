"use client"

import { create } from "zustand"
import { makeEvent, type BusinessEvent, type BusinessEventType, type EventInput } from "@/lib/domain/ai-office"
import { publicId } from "@/lib/domain/jobs"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * Event System do AI Office — um lugar só para registrar o que aconteceu no negócio.
 *
 *   recordEvent({ type: "lead.approved", entity: { type: "lead", id }, actor: { type: "human", id: meId }, metadata })
 *
 * 1) grava na tabela `events` (só inserir/ler — histórico imutável, SQL 0010);
 * 2) avisa quem se inscreveu com `onBusinessEvent` (automações hoje; webhooks/MCP/workers depois);
 * 3) entra no feed ao vivo (inclusive o que o sócio fez, via tempo real).
 * Se a tabela ainda não existir, nada quebra: só não fica gravado.
 */

type Handler = (e: BusinessEvent) => void
const handlers = new Map<BusinessEventType | "*", Set<Handler>>()

export function onBusinessEvent(type: BusinessEventType | "*", handler: Handler) {
  const set = handlers.get(type) ?? new Set()
  set.add(handler)
  handlers.set(type, set)
  return () => set.delete(handler)
}

function notify(e: BusinessEvent) {
  for (const h of [...(handlers.get(e.event_type) ?? []), ...(handlers.get("*") ?? [])]) {
    try {
      h(e)
    } catch (err) {
      console.error(`[evento ${e.event_type}]`, err)
    }
  }
}

export function recordEvent(input: EventInput): BusinessEvent {
  const e = makeEvent(input, publicId("evt"), new Date().toISOString())
  useEventFeed.getState().add(e)
  notify(e)
  void supabaseBrowser()
    .from("events")
    .insert(e)
    .then(({ error }) => error && console.warn("[eventos] não gravou (rodou o SQL 0010?)", error.message))
  return e
}

// ---------- feed ao vivo ----------

interface FeedState {
  events: BusinessEvent[]
  loaded: boolean
  load(limit?: number): Promise<void>
  add(e: BusinessEvent): void
}

export const useEventFeed = create<FeedState>((set, get) => ({
  events: [],
  loaded: false,
  async load(limit = 150) {
    const { data, error } = await supabaseBrowser().from("events").select("*").order("created_at", { ascending: false }).limit(limit)
    if (error) return set({ loaded: true })
    const known = new Set(get().events.map((e) => e.id))
    const fresh = (data as BusinessEvent[]).filter((e) => !known.has(e.id))
    set((s) => ({ loaded: true, events: [...s.events, ...fresh].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 500) }))
  },
  add(e) {
    if (get().events.some((x) => x.id === e.id)) return
    set((s) => ({ events: [e, ...s.events].slice(0, 500) }))
  },
}))

let live: (() => void) | null = null
/** Carrega o histórico recente e escuta novos eventos (do sócio também). Chame uma vez após o login. */
export function startEventFeed() {
  if (live) return
  void useEventFeed.getState().load()
  const sb = supabaseBrowser()
  const channel = sb
    .channel("eventos-ai-office")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
      const e = payload.new as BusinessEvent
      if (useEventFeed.getState().events.some((x) => x.id === e.id)) return // eu mesmo gravei
      useEventFeed.getState().add(e)
      notify(e)
    })
    .subscribe()
  live = () => sb.removeChannel(channel)
}
