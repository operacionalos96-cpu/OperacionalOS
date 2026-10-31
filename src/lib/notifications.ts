"use client"

import { useEffect } from "react"
import { create } from "zustand"
import { publicId } from "@/lib/domain/jobs"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * Avisos por pessoa (tabela notifications, SQL 0021): "Esperando por você" no Início (fase 2).
 * Quem age avisa os outros; cada um só lê e marca os próprios (RLS).
 */
export interface NotificationData {
  kind: "decisao" | "ok_decisao" | "aprovacao" | "mencao" | "daily"
  title: string
  /** Para onde o aviso leva. */
  href: string
  fromId: string
}

export function notify(userIds: string[], data: NotificationData) {
  const rows = [...new Set(userIds)].filter((id) => id && id !== data.fromId).map((user_id) => ({ id: publicId("evt"), user_id, data }))
  if (!rows.length) return
  void supabaseBrowser()
    .from("notifications")
    .insert(rows)
    .then(({ error }) => error && console.warn("[avisos] não gravou (rodou o SQL 0021?)", error.message))
}

export interface Notification {
  id: string
  data: NotificationData
  created_at: string
}

/** Meus avisos (só os meus: RLS). Lidos = dispensados (apagados), para a lista ficar curta. */
export const useNotifications = create<{ items: Notification[] }>(() => ({ items: [] }))

async function loadMine(meId: string) {
  const { data } = await supabaseBrowser().from("notifications").select("id, data, created_at").eq("user_id", meId).order("created_at", { ascending: false }).limit(30)
  useNotifications.setState({ items: (data as Notification[] | null) ?? [] })
}

/** Carrega os avisos e escuta os novos em tempo real ("Esperando por você" no Início). */
export function useMyNotifications(meId: string) {
  useEffect(() => {
    if (!meId) return
    void loadMine(meId)
    const sb = supabaseBrowser()
    const ch = sb
      .channel(`avisos-${meId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` }, () => void loadMine(meId))
      .subscribe()
    return () => void sb.removeChannel(ch)
  }, [meId])
  return useNotifications((s) => s.items)
}

export function dismissNotification(id: string) {
  useNotifications.setState((s) => ({ items: s.items.filter((n) => n.id !== id) }))
  void supabaseBrowser().from("notifications").delete().eq("id", id)
}
