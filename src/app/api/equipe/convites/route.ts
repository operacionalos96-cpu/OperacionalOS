import { NextResponse } from "next/server"
import { appUrl } from "@/lib/server/auth"
import { supabaseServer } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import type { RoleLevel } from "@/lib/domain/org"

const noStore = { "Cache-Control": "no-store" }
const allowedLevels = new Set<RoleLevel>(["admin", "operator", "viewer"])

export async function POST(request: Request) {
  const sessionClient = await supabaseServer()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: "Faça login para continuar." }, { status: 401, headers: noStore })
  }

  let body: { email?: unknown; displayName?: unknown; roleLevel?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Corpo da solicitação inválido." }, { status: 400, headers: noStore })
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : ""
  const roleLevel = body.roleLevel as RoleLevel
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400, headers: noStore })
  }
  if (!allowedLevels.has(roleLevel)) {
    return NextResponse.json({ error: "Nível de acesso inválido. O endpoint não permite criar owners." }, { status: 400, headers: noStore })
  }

  let admin: ReturnType<typeof supabaseAdmin>
  try {
    admin = supabaseAdmin()
  } catch {
    return NextResponse.json({ error: "Convites não configurados no servidor. Configure SUPABASE_SECRET_KEY e faça redeploy." }, { status: 503, headers: noStore })
  }

  const { data: inviter, error: inviterError } = await admin
    .from("members")
    .select("role_level, active")
    .eq("email", user.email.toLowerCase())
    .maybeSingle()

  if (inviterError) {
    return NextResponse.json({ error: "Não foi possível validar suas permissões." }, { status: 500, headers: noStore })
  }
  if (!inviter || inviter.active === false || !["owner", "admin"].includes(String(inviter.role_level))) {
    return NextResponse.json({ error: "Somente owners e admins podem convidar membros." }, { status: 403, headers: noStore })
  }

  const { data: existingMember, error: existingError } = await admin
    .from("members")
    .select("email")
    .eq("email", email)
    .maybeSingle()
  if (existingError) {
    return NextResponse.json({ error: "Não foi possível verificar se o e-mail já está cadastrado." }, { status: 500, headers: noStore })
  }
  if (existingMember) {
    return NextResponse.json({ error: "Este e-mail já está cadastrado na equipe." }, { status: 409, headers: noStore })
  }

  const redirectTo = `${appUrl()}/auth/confirm?next=/redefinir-senha`
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { display_name: displayName || email.split("@")[0] },
  })
  if (inviteError || !invited.user) {
    const message = inviteError?.message ?? "Não foi possível gerar o convite."
    const alreadyExists = /already|registered|exists/i.test(message)
    return NextResponse.json({
      error: alreadyExists
        ? "Já existe uma conta de autenticação com este e-mail. Verifique o usuário no Supabase Auth antes de convidá-lo novamente."
        : "O Supabase não conseguiu enviar o convite. Confira a configuração de e-mail e as URLs permitidas.",
    }, { status: alreadyExists ? 409 : 502, headers: noStore })
  }

  const teamId = `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
  const { error: memberError } = await admin.from("members").insert({
    email,
    team_id: teamId,
    display_name: displayName || email.split("@")[0],
    role_level: roleLevel,
    active: true,
  })

  if (memberError) {
    // Compensa o convite para não deixar uma conta sem autorização de acesso ao app.
    await admin.auth.admin.deleteUser(invited.user.id)
    return NextResponse.json({ error: "A conta foi criada, mas não foi possível registrar o membro. A operação foi revertida; tente novamente." }, { status: 500, headers: noStore })
  }

  return NextResponse.json({
    ok: true,
    email,
    message: "Convite enviado. A pessoa deverá abrir o e-mail e definir uma senha para entrar.",
  }, { status: 201, headers: noStore })
}
