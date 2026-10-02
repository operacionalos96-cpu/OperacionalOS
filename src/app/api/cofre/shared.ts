import "server-only"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { requireMember } from "@/lib/server/auth"
import { UNLOCK_COOKIE, unlockRemaining } from "@/lib/server/vault"

export const noStore = { "Cache-Control": "no-store" }

/** Membro logado E cofre desbloqueado; senão devolve a resposta de erro pronta. */
export async function requireUnlocked() {
  const member = await requireMember()
  if (!member) return { error: NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore }) }
  if (!process.env.VAULT_ENCRYPTION_KEY)
    return { error: NextResponse.json({ erro: "Cofre não configurado: coloque VAULT_ENCRYPTION_KEY na Vercel." }, { status: 503, headers: noStore }) }
  const remaining = unlockRemaining((await cookies()).get(UNLOCK_COOKIE)?.value, member.userId)
  if (!remaining) return { error: NextResponse.json({ erro: "trancado", trancado: true }, { status: 423, headers: noStore }) }
  return { member, remaining }
}
