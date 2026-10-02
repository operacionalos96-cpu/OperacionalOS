import { NextResponse } from "next/server"
import { TEAM } from "@/config/team"
import { saleToTransaction, salesProvider } from "@/lib/server/sales-webhooks"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { rateHit } from "@/lib/server/rate-limit"

/**
 * POST /api/webhooks/hotmart  (ou /kiwify): venda aprovada → entrada no financeiro.
 * Pública para a plataforma conseguir chamar, mas só aceita com o segredo certo
 * (HOTMART_HOTTOK / KIWIFY_TOKEN na Vercel). Sem segredo configurado: recusa tudo.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params
  const provider = salesProvider(id)
  if (!provider) return NextResponse.json({ erro: "plataforma desconhecida" }, { status: 404 })

  const secret = process.env[provider.secretEnv]
  if (!secret) return NextResponse.json({ erro: `${provider.secretEnv} não configurado` }, { status: 503 })

  const rawBody = await req.text()
  if (rawBody.length > 200_000) return NextResponse.json({ erro: "corpo grande demais" }, { status: 413 })
  if (!provider.verify({ headers: req.headers, url: req.url, rawBody }, secret)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })

  // Mesmo com o segredo certo, no máximo 120 vendas por minuto por plataforma (segredo vazado não vira enxurrada).
  if (!(await rateHit(`webhook:${provider.id}`, 120, 60))) return NextResponse.json({ erro: "muitas requisições" }, { status: 429 })

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 })
  }
  const sale = provider.parse(body)
  // Reembolso, boleto gerado etc.: responde 200 para a plataforma não ficar reenviando.
  if (!sale) return NextResponse.json({ ok: true, ignorado: true })

  try {
    const db = supabaseAdmin()
    const { data: products } = await db.from("products").select("id, name:data->>name").limit(1000)
    const owner = process.env.WEBHOOK_OWNER_ID || TEAM[0].id
    const tx = saleToTransaction(provider, sale, (products ?? []) as { id: string; name: string }[], owner)
    // Mesma venda de novo (a plataforma reenvia): não duplica.
    const { error } = await db.from("transactions").upsert({ id: tx.id, data: tx }, { onConflict: "id", ignoreDuplicates: true })
    if (error) throw error
    return NextResponse.json({ ok: true, id: tx.id })
  } catch (err) {
    console.error(`[webhook ${provider.id}]`, err)
    return NextResponse.json({ erro: "falha ao registrar" }, { status: 500 })
  }
}
