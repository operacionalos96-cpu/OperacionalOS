"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_KEY, SUPABASE_URL } from "./env"

let client: SupabaseClient | null = null

/** Cliente do navegador (um só por aba). A sessão vive em cookies, renovada pelo middleware. */
export function supabaseBrowser(): SupabaseClient {
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  return client
}
