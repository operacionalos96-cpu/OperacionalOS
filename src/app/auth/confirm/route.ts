import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { supabaseServer } from "@/lib/supabase/server"

/** Destinos permitidos depois de confirmar o link do e-mail (nada de redirecionar para fora). */
const ALLOWED_NEXT = new Set(["/redefinir-senha", "/"])

/**
 * Recebe o link do e-mail (recuperação de senha / convite), troca pelo login
 * e manda para a tela certa. Aceita os dois formatos do Supabase: `code` (PKCE)
 * e `token_hash` + `type`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const next = ALLOWED_NEXT.has(searchParams.get("next") ?? "") ? searchParams.get("next")! : "/redefinir-senha"
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await supabaseServer()
  let ok = false
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  }

  return NextResponse.redirect(new URL(ok ? next : "/login?erro=link", origin))
}
