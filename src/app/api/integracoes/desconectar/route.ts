import { NextResponse, type NextRequest } from "next/server"
import { requireMember } from "@/lib/server/auth"
import { removeConnection } from "@/lib/server/integrations"

/** POST { conta } — apaga a conexão e os tokens (cascade). */
export async function POST(request: NextRequest) {
  const member = await requireMember()
  if (!member) return NextResponse.json({ error: "não autorizado" }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { conta?: string }
  if (!body.conta || !/^[A-Za-z0-9-]{1,64}$/.test(body.conta)) return NextResponse.json({ error: "conta inválida" }, { status: 400 })
  await removeConnection(body.conta)
  return NextResponse.json({ ok: true })
}
