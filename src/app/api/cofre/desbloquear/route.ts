import { NextResponse } from "next/server"
import { requireMember } from "@/lib/server/auth"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { MIN_VAULT_PASSWORD, UNLOCK_COOKIE, UNLOCK_SECONDS, allowUnlockAttempt, hashVaultPassword, unlockToken, verifyVaultPassword } from "@/lib/server/vault"
import { noStore } from "../shared"

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/cofre" }

/**
 * Senha do cofre: própria, separada do login (vazar uma não abre a outra).
 * Fica só o hash scrypt em vault_settings (sem acesso pelo navegador).
 */
async function gate() {
  const member = await requireMember()
  if (!member) return { error: NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore }) }
  if (!process.env.SUPABASE_SECRET_KEY || !process.env.VAULT_ENCRYPTION_KEY)
    return { error: NextResponse.json({ erro: "Cofre não configurado no servidor (SUPABASE_SECRET_KEY / VAULT_ENCRYPTION_KEY)." }, { status: 503, headers: noStore }) }
  const { data, error } = await supabaseAdmin().from("vault_settings").select("password_hash").eq("id", "default").maybeSingle()
  if (error)
    return {
      error: NextResponse.json(
        { erro: error.code === "PGRST205" || error.code === "42P01" ? "As tabelas do cofre não existem: rode o SQL 0008 no Supabase." : `Erro no banco (${error.code ?? "sem código"}: ${String(error.message ?? "").slice(0, 160)})` },
        { status: 500, headers: noStore },
      ),
    }
  return { member, hash: data?.password_hash as string | undefined }
}

/** GET: o cofre já tem senha criada? (decide entre "criar" e "abrir"). */
export async function GET() {
  const g = await gate()
  if (g.error) return g.error
  return NextResponse.json({ configurado: !!g.hash }, { headers: noStore })
}

/**
 * POST { senha }                → abre por 5 min
 * POST { senha, nova }          → troca a senha do cofre (precisa da atual)
 * POST { nova } (sem senha ainda criada) → cria a senha do cofre e já abre
 */
export async function POST(req: Request) {
  const g = await gate()
  if (g.error) return g.error
  if (!allowUnlockAttempt(g.member.userId)) return NextResponse.json({ erro: "Muitas tentativas. Espere 5 minutos." }, { status: 429, headers: noStore })

  const body = (await req.json().catch(() => ({}))) as { senha?: unknown; nova?: unknown }
  const senha = typeof body.senha === "string" ? body.senha.slice(0, 200) : ""
  const nova = typeof body.nova === "string" ? body.nova.slice(0, 200) : ""
  if (nova && nova.length < MIN_VAULT_PASSWORD)
    return NextResponse.json({ erro: `A senha do cofre precisa de pelo menos ${MIN_VAULT_PASSWORD} caracteres.` }, { status: 400, headers: noStore })

  if (!g.hash) {
    if (!nova) return NextResponse.json({ erro: "Crie a senha do cofre primeiro." }, { status: 400, headers: noStore })
  } else if (!senha || !verifyVaultPassword(senha, g.hash)) {
    return NextResponse.json({ erro: "Senha do cofre incorreta." }, { status: 401, headers: noStore })
  }

  if (nova) {
    const { error } = await supabaseAdmin()
      .from("vault_settings")
      .upsert({ id: "default", password_hash: hashVaultPassword(nova), updated_by: g.member.teamId, updated_at: new Date().toISOString() })
    if (error) return NextResponse.json({ erro: "Não foi possível salvar a senha do cofre." }, { status: 500, headers: noStore })
  }

  const res = NextResponse.json({ ok: true, segundos: UNLOCK_SECONDS }, { headers: noStore })
  res.cookies.set(UNLOCK_COOKIE, unlockToken(g.member.userId), { ...cookieOptions, maxAge: UNLOCK_SECONDS })
  return res
}

/** DELETE: tranca na hora. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: noStore })
  res.cookies.set(UNLOCK_COOKIE, "", { ...cookieOptions, maxAge: 0 })
  return res
}
