import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { appUrl, requireMember } from "@/lib/server/auth"
import { saveConnection } from "@/lib/server/integrations"
import { exchangeCode, fetchProfile, isProvider } from "@/lib/server/providers"

function sameState(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Volta da plataforma: confere o state, troca o código por tokens e salva (criptografado). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ plataforma: string }> }) {
  const { plataforma } = await params
  const q = request.nextUrl.searchParams
  const back = (msg: string) => {
    const res = NextResponse.redirect(`${appUrl()}/conteudos?aba=contas&integracao=${encodeURIComponent(msg)}`)
    res.cookies.set("oauth_state", "", { path: "/api/integracoes", maxAge: 0 })
    return res
  }

  if (!isProvider(plataforma)) return back("plataforma-invalida")
  const member = await requireMember()
  if (!member) return NextResponse.redirect(`${appUrl()}/login`)
  if (q.get("error")) return back("cancelada")

  let saved: { state: string; contaId: string; plataforma: string }
  try {
    saved = JSON.parse(request.cookies.get("oauth_state")?.value ?? "")
  } catch {
    return back("sessao-expirada")
  }
  const state = q.get("state") ?? ""
  // Anti-CSRF: o state precisa ser exatamente o que este navegador gerou há menos de 10 min.
  if (!state || !saved?.state || !sameState(state, saved.state) || saved.plataforma !== plataforma) return back("sessao-expirada")

  const code = q.get("code")
  if (!code) return back("cancelada")

  try {
    const tokens = await exchangeCode(plataforma, code)
    const profile = await fetchProfile(plataforma, tokens.accessToken)
    await saveConnection({
      accountId: saved.contaId,
      platform: plataforma,
      externalId: profile.externalId,
      displayName: profile.displayName,
      tokens,
      userId: member.userId,
    })
    return back(`conectado-${plataforma}`)
  } catch (e) {
    console.error("[integracao] falha no callback", plataforma, e instanceof Error ? e.message : e)
    return back("falhou")
  }
}
