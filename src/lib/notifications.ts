"use client"

import { publicId } from "@/lib/domain/jobs"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * Avisos por pessoa (tabela notifications, SQL 0021): "Esperando por você" no Início (fase 2).
 * Quem age avisa os outros; cada um só lê e marca os próprios (RLS).
 */
export interface NotificationData {
  kind: "decisao" | "ok_decisao" | "aprovacao" | "mencao"
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
