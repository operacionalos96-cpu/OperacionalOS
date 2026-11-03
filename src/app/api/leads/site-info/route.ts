import { NextResponse } from "next/server"
import type { Lead } from "@/lib/domain/types"
import { requireMember } from "@/lib/server/auth"
import { rateHit } from "@/lib/server/rate-limit"
import { readSiteInfo } from "@/lib/server/site-info"
import { supabaseAdmin } from "@/lib/server/supabase-admin"

/**
 * POST /api/leads/site-info { leadId } — lê o site do lead e devolve segmento exato e cidade.
 * Não grava: o navegador salva em lead.siteInfo (correções humanas em segment/city continuam valendo).
 */
export const maxDuration = 45
const noStore = { "Cache-Control": "no-store" }

export async function POST(req: Request) {
  const member = await requireMember()
  if (!member) return NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore })
  if (!(await rateHit(`site:min:${member.userId}`, 12, 60)) || !(await rateHit(`site:dia:${member.userId}`, 400, 86_400)))
    return NextResponse.json({ erro: "Muitas leituras de site seguidas. Espere um minuto." }, { status: 429, headers: noStore })

  const { leadId } = ((await req.json().catch(() => ({}))) ?? {}) as { leadId?: unknown }
  if (typeof leadId !== "string" || !leadId || leadId.length > 64) return NextResponse.json({ erro: "lead inválido" }, { status: 400, headers: noStore })
  const { data } = await supabaseAdmin().from("leads").select("data").eq("id", leadId).maybeSingle()
  if (!data) return NextResponse.json({ erro: "lead não encontrado" }, { status: 404, headers: noStore })
  const r = await readSiteInfo(data.data as Lead)
  if ("retry" in r) return NextResponse.json({ erro: r.retry, retry: true }, { status: 429, headers: noStore })
  return NextResponse.json(r, { headers: noStore })
}
