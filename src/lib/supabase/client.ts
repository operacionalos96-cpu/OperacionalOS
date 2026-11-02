"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SANDBOX, SUPABASE_KEY, SUPABASE_URL } from "./env"
import { sandboxClient } from "./sandbox"

let client: SupabaseClient | null = null

/**
 * Cliente do navegador (um só por aba). A sessão vive em cookies, renovada pelo middleware.
 * Tempo real com o heartbeat num Web Worker: com a aba em segundo plano o Chrome segura os timers
 * da página (1x por minuto), a conexão caía e a pessoa sumia do "online" (ADR 0015).
 */
export function supabaseBrowser(): SupabaseClient {
  if (SANDBOX) return sandboxClient as unknown as SupabaseClient
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY, { realtime: { worker: true } })
  return client
}
