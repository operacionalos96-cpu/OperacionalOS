"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SANDBOX, SUPABASE_KEY, SUPABASE_URL } from "./env"
import { sandboxClient } from "./sandbox"

let client: SupabaseClient | null = null

/** Cliente do navegador (um só por aba). A sessão vive em cookies, renovada pelo middleware. */
export function supabaseBrowser(): SupabaseClient {
  if (SANDBOX) return sandboxClient as unknown as SupabaseClient
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  return client
}
