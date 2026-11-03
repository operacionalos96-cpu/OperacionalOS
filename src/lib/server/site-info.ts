import "server-only"
import { dddOf } from "@/lib/domain/lead-context"
import { bestPlace, buildSitePrompt, parseSite, parseSiteResult, type SitePage } from "@/lib/domain/site-info"
import type { Lead, SiteInfo } from "@/lib/domain/types"
import { AiError, aiConfigured, generateJson } from "./ai"
import { FetchBlocked, fetchPublicHtml } from "./safe-fetch"

/**
 * Lê o site do lead e devolve segmento exato e cidade (o que entra na 1ª mensagem).
 * Usado pela tela ("Ler sites") e pelo agente do WhatsApp antes de uma abertura.
 * Não grava: quem chama decide onde salvar. `retry`: limite da IA, vale tentar de novo depois.
 */
export async function readSiteInfo(lead: Lead): Promise<{ siteInfo: SiteInfo } | { retry: string }> {
  const checkedAt = new Date().toISOString()
  const fail = (error: string) => ({ siteInfo: { checkedAt, error } satisfies SiteInfo })
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
  try {
    const r = parseSiteResult(await generateJson(buildSitePrompt({ name: lead.name, url: lead.website, hintSegment: lead.company, ddd: dddOf(lead.contact), pages }), { temperature: 0.1 }))
    if (!r) return fail("IA indisponível (resposta inválida)")
    return { siteInfo: { checkedAt, segment: r.segment ?? undefined, city: r.city ?? undefined, uf: r.uf ?? (r.city && place?.city === r.city ? place.uf : undefined), confidence: r.confidence, evidence: r.evidence || undefined } }
  } catch (e) {
    if (e instanceof AiError && e.status === 429) return { retry: e.message }
    if (!(e instanceof AiError)) console.error("[site-info]", e)
    return fail("IA indisponível — tente de novo")
  }
}
