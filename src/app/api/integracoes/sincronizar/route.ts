import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { requireMember } from "@/lib/server/auth"
import { syncAllMetrics } from "@/lib/server/integrations"

export const maxDuration = 60

/** Botão "Atualizar métricas" (membro logado). */
export async function POST() {
  const member = await requireMember()
  if (!member) return NextResponse.json({ error: "não autorizado" }, { status: 401 })
  return NextResponse.json(await syncAllMetrics())
}

/** Agendamento diário da Vercel (Cron): exige "Authorization: Bearer CRON_SECRET". */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const given = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${secret}`
  const ok = !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  if (!ok) return NextResponse.json({ error: "não autorizado" }, { status: 401 })
  return NextResponse.json(await syncAllMetrics())
}
