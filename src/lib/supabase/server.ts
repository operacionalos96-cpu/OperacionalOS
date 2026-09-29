import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { SUPABASE_KEY, SUPABASE_URL } from "./env"

/** Cliente para Route Handlers / Server Components. Crie um novo a cada requisição. */
export async function supabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o middleware já renova a sessão.
        }
      },
    },
  })
}
