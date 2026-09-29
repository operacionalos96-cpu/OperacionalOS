import { randomBytes } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { appUrl, requireMember } from "@/lib/server/auth"
import { authorizeUrl, isProvider, providerConfigured } from "@/lib/server/providers"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * Início da conexão: /api/integracoes/youtube/conectar?conta=<id da conta de conteúdo>
 * Gera um "state" aleatório (anti-CSRF) guardado em cookie httpOnly e manda para a plataforma.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ plataforma: string }> }) {
  const { plataforma } = await params
  const back = (msg: string) => NextResponse.redirect(`${appUrl()}/conteudos?aba=contas&integracao=${encodeURIComponent(msg)}`)

  if (!isProvider(plataforma)) return back("plataforma-invalida")
  const member = await requireMember()
  if (!member) return NextResponse.redirect(`${appUrl()}/login`)
  if (!providerConfigured(plataforma)) return back("nao-configurada")

  const contaId = request.nextUrl.searchParams.get("conta") ?? ""
  if (!/^[A-Za-z0-9-]{1,64}$/.test(contaId)) return back("conta-invalida")

  // A conta precisa existir e ser da mesma plataforma (lida com as permissões do próprio usuário).
  const supabase = await supabaseServer()
  const { data } = await supabase.from("content_accounts").select("data").eq("id", contaId).maybeSingle()
  if (!data || (data.data as { platform?: string }).platform !== plataforma) return back("conta-invalida")

  const state = randomBytes(24).toString("base64url")
  const res = NextResponse.redirect(authorizeUrl(plataforma, state))
  res.cookies.set("oauth_state", JSON.stringify({ state, contaId, plataforma }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integracoes",
    maxAge: 600,
  })
  return res
}
