import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env"

/** Rotas acessíveis sem login. Todo o resto exige sessão válida. */
const PUBLIC_PATHS = [
  "/login",
  "/auth/confirm",
  "/redefinir-senha",
  // Chamada pelo agendador da Vercel sem login: a própria rota exige o CRON_SECRET.
  "/api/integracoes/sincronizar",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // Falha fechada: sem Supabase configurado, nada além do login abre.
  if (!supabaseConfigured) {
    if (isPublic) return NextResponse.next()
    return redirectTo(request, "/login", { erro: "config" })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Não coloque código entre createServerClient e getClaims (renovação de sessão).
  // getClaims valida a assinatura do JWT; um cookie forjado não passa.
  const { data } = await supabase.auth.getClaims()
  const loggedIn = !!data?.claims?.sub

  if (!loggedIn && !isPublic) {
    return redirectTo(request, "/login", pathname !== "/" ? { voltar: pathname } : undefined, response)
  }
  if (loggedIn && pathname === "/login") {
    return redirectTo(request, "/", undefined, response)
  }
  return response
}

function redirectTo(request: NextRequest, path: string, params?: Record<string, string>, carry?: NextResponse) {
  const url = request.nextUrl.clone()
  url.pathname = path
  url.search = ""
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v)
  const res = NextResponse.redirect(url)
  // Mantém cookies de sessão renovados no redirecionamento.
  carry?.cookies.getAll().forEach((c) => res.cookies.set(c))
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
