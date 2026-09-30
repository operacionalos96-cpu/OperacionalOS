import { NextResponse } from "next/server"
import { buildPrompt, parseAiResult, validateAiRequest } from "@/lib/domain/ai-map"
import { AiError, allowRequest, generateJson } from "@/lib/server/ai"
import { requireMember } from "@/lib/server/auth"

/** POST /api/ia/mapa — sugestões para um balão (expandir, lacunas, resumir). Só membros logados. */
export async function POST(req: Request) {
  const member = await requireMember()
  if (!member) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  if (!allowRequest(member.userId)) return NextResponse.json({ erro: "Muitos pedidos seguidos. Espere um minuto." }, { status: 429 })

  const body = await req.json().catch(() => null)
  const request = validateAiRequest(body)
  if (!request) return NextResponse.json({ erro: "pedido inválido" }, { status: 400 })
  const existing = Array.isArray(body?.existing) ? (body.existing as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 300) : []

  try {
    const result = parseAiResult(request.action, await generateJson(buildPrompt(request)), existing)
    if (!result) return NextResponse.json({ erro: "A IA não trouxe nada novo. Tente com mais contexto no balão." }, { status: 422 })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AiError) return NextResponse.json({ erro: err.message }, { status: err.status })
    console.error("[ia/mapa]", err)
    return NextResponse.json({ erro: "Falha na IA." }, { status: 500 })
  }
}
