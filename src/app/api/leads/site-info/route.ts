import { NextResponse } from "next/server"
import { dddOf } from "@/lib/domain/lead-context"
import { bestPlace, buildSitePrompt, parseSite, parseSiteResult, type SitePage } from "@/lib/domain/site-info"
import type { Lead, SiteInfo } from "@/lib/domain/types"
import { AiError, aiConfigured, generateJson } from "@/lib/server/ai"
import { requireMember } from "@/lib/server/auth"
import { rateHit } from "@/lib/server/rate-limit"
import { FetchBlocked, fetchPublicHtml } from "@/lib/server/safe-fetch"
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
  const lead = data.data as Lead
  const checkedAt = new Date().toISOString()
  const fail = (error: string) => NextResponse.json({ siteInfo: { checkedAt, error } satisfies SiteInfo }, { headers: noStore })
  if (!lead.website) return fail("lead sem site")

  // Página inicial + uma de contato/sobre (é onde costuma estar o endereço).
  const pages: SitePage[] = []
  try {
    const home = await fetchPublicHtml(lead.website)
    pages.push(parseSite(home.html, home.url))
    const first = pages[0]
    if (first.contactLinks.length && !first.ldPlaces.length && first.places.length < 2) {
      const extra = await fetchPublicHtml(first.contactLinks[0], { timeoutMs: 7000 }).catch(() => null)
      if (extra) pages.push(parseSite(extra.html, extra.url))
    }
  } catch (e) {
    return fail(e instanceof FetchBlocked ? e.message : "site não abriu")
  }
  if (!pages[0].text && !pages[0].title) return fail("site sem conteúdo legível")

  // A cidade "bruta" do texto às vezes é bairro ou nome da empresa: só a IA confere e decide.
  if (!aiConfigured()) return fail("IA não configurada")
  const place = bestPlace(pages)
  let siteInfo: SiteInfo
  try {
    const r = parseSiteResult(await generateJson(buildSitePrompt({ name: lead.name, url: lead.website, hintSegment: lead.company, ddd: dddOf(lead.contact), pages }), { temperature: 0.1 }))
    if (!r) return fail("IA indisponível (resposta inválida)")
    siteInfo = { checkedAt, segment: r.segment ?? undefined, city: r.city ?? undefined, uf: r.uf ?? (r.city && place?.city === r.city ? place.uf : undefined), confidence: r.confidence, evidence: r.evidence || undefined }
  } catch (e) {
    if (e instanceof AiError && e.status === 429) return NextResponse.json({ erro: e.message, retry: true }, { status: 429, headers: noStore })
    if (!(e instanceof AiError)) console.error("[site-info]", e)
    return fail("IA indisponível — tente de novo")
  }
  return NextResponse.json({ siteInfo }, { headers: noStore })
}
