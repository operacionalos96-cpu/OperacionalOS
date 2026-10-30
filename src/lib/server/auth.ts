import "server-only"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * Garante, NO SERVIDOR, que quem chamou está logado e é membro.
 * getUser() confere o token com o Supabase (não confia só no cookie).
 */
export async function requireMember() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()
  if (!data.user?.email) return null
  // Filtra pelo próprio e-mail: membros enxergam a equipe inteira (migration 0017).
  const { data: member } = await supabase
    .from("members")
    .select("team_id, active")
    .eq("email", data.user.email.toLowerCase())
    .maybeSingle()
  if (!member || member.active === false) return null
  return { userId: data.user.id, teamId: member.team_id as string, email: data.user.email ?? "" }
}

/** Endereço público do app (fixo na configuração; não confia no cabeçalho Host). */
export function appUrl() {
  const url = process.env.APP_URL ?? "http://localhost:3000"
  return url.replace(/\/+$/, "")
}
