import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { deliverDue } from "@/lib/server/webhooks"

/**
 * Agendador (pg_cron do Supabase chama a cada minuto, com Authorization: Bearer CRON_SECRET):
 * recolhe leases vencidos e envia webhooks devidos. Sem IA. Idempotente: rodar 2x não duplica.
 */
export const maxDuration = 60

function authorized(req: Request) {
  // Espaços/quebras de linha colados junto com o segredo (na Vercel ou no cofre do Supabase) não contam.
  const secret = (process.env.CRON_SECRET ?? "").trim()
  const sent = (req.headers.get("authorization") ?? "").trim().replace(/^Bearer\s+/i, "").trim()
  const got = Buffer.from(`Bearer ${sent}`)
  const want = Buffer.from(`Bearer ${secret}`)
  return secret.length >= 16 && got.length === want.length && timingSafeEqual(got, want)
}

/** Impressão digital curta (6 primeiros hex do SHA-256): compara valores sem revelar nenhum. */
const fp = (v: string) => (v ? createHash("sha256").update(v).digest("hex").slice(0, 6) : "vazio")

export async function POST(req: Request) {
  if (!authorized(req)) {
    const expected = (process.env.CRON_SECRET ?? "").trim()
    const sent = (req.headers.get("authorization") ?? "").trim().replace(/^Bearer\s+/i, "").trim()
    return NextResponse.json(
      { erro: "não autorizado", servidor_tem_cron_secret: expected.length >= 16, recebido: fp(sent), esperado: expected ? fp(expected) : "vazio" },
      { status: 401 },
    )
  }
  const started = Date.now()
  const { data: reaped, error } = await supabaseAdmin().rpc("reap_expired_leases")
  if (error) return NextResponse.json({ erro: "fila indisponível (rodou o SQL 0011?)" }, { status: 500 })
  const webhooks = await deliverDue(25).catch((e) => ({ attempted: 0, delivered: 0, erro: e instanceof Error ? e.message.slice(0, 120) : "falha" }))
  return NextResponse.json({ reaped, webhooks, ms: Date.now() - started })
}

export const GET = POST
