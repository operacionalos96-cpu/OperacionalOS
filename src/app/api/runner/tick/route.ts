import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { deliverDue } from "@/lib/server/webhooks"

/**
 * Agendador (pg_cron do Supabase chama a cada minuto, com Authorization: Bearer CRON_SECRET):
 * recolhe leases vencidos e envia webhooks devidos. Sem IA. Idempotente: rodar 2x não duplica.
 */
export const maxDuration = 60

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET ?? ""
  const got = Buffer.from(req.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return secret.length >= 16 && got.length === want.length && timingSafeEqual(got, want)
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  const started = Date.now()
  const { data: reaped, error } = await supabaseAdmin().rpc("reap_expired_leases")
  if (error) return NextResponse.json({ erro: "fila indisponível (rodou o SQL 0011?)" }, { status: 500 })
  const webhooks = await deliverDue(25).catch((e) => ({ attempted: 0, delivered: 0, erro: e instanceof Error ? e.message.slice(0, 120) : "falha" }))
  return NextResponse.json({ reaped, webhooks, ms: Date.now() - started })
}

export const GET = POST
