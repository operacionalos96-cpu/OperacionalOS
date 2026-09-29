import "server-only"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL } from "@/lib/supabase/env"

/**
 * Cliente com a chave SECRET: ignora RLS. Só existe no servidor ("server-only"
 * quebra o build se alguém importar isto num componente do navegador).
 * Use apenas depois de validar que quem chamou é membro (requireMember).
 */
export function supabaseAdmin() {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error("SUPABASE_SECRET_KEY não configurada no servidor.")
  return createClient(SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}
