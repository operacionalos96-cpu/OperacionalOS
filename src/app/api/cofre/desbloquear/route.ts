import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env"
import { requireMember } from "@/lib/server/auth"
import { UNLOCK_COOKIE, UNLOCK_SECONDS, allowUnlockAttempt, unlockToken } from "@/lib/server/vault"
import { noStore } from "../shared"

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/cofre" }

/** POST: confere a senha da conta e abre o cofre por 5 min. DELETE: tranca na hora. */
export async function POST(req: Request) {
  const member = await requireMember()
  if (!member?.email) return NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore })
  if (!process.env.VAULT_ENCRYPTION_KEY)
    return NextResponse.json({ erro: "Cofre não configurado: coloque VAULT_ENCRYPTION_KEY na Vercel." }, { status: 503, headers: noStore })
  if (!allowUnlockAttempt(member.userId)) return NextResponse.json({ erro: "Muitas tentativas. Espere 5 minutos." }, { status: 429, headers: noStore })

  const body = (await req.json().catch(() => ({}))) as { senha?: unknown }
  const password = typeof body.senha === "string" ? body.senha : ""
  if (!password || password.length > 200) return NextResponse.json({ erro: "Senha incorreta." }, { status: 401, headers: noStore })

  // Confere a senha com um cliente descartável (não mexe na sessão atual do navegador).
  const check = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await check.auth.signInWithPassword({ email: member.email, password })
  if (error) {
    // Senha errada → mensagem simples. Qualquer outra falha → código do Supabase (nunca a senha), para dar para corrigir.
    const wrong = error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)
    if (!wrong) console.error("[cofre] conferência da senha falhou:", error.status, error.code, error.message)
    const masked = member.email.replace(/^(.{2}).*(@.*)$/, "$1***$2")
    return NextResponse.json({ erro: wrong ? `Senha incorreta para ${masked}.` :`Não foi possível conferir a senha (${error.code ?? error.status ?? "erro"}: ${error.message.slice(0, 120)})` }, { status: 401, headers: noStore })
  }
  if (data.user?.id !== member.userId) return NextResponse.json({ erro: "Esta senha é de outra conta." }, { status: 401, headers: noStore })
  await check.auth.signOut({ scope: "local" }).catch(() => {}) // descarta a sessão de conferência

  const res = NextResponse.json({ ok: true, segundos: UNLOCK_SECONDS }, { headers: noStore })
  res.cookies.set(UNLOCK_COOKIE, unlockToken(member.userId), { ...cookieOptions, maxAge: UNLOCK_SECONDS })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: noStore })
  res.cookies.set(UNLOCK_COOKIE, "", { ...cookieOptions, maxAge: 0 })
  return res
}
