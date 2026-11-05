import { NextResponse } from "next/server"
import {
  CAPTURE_SCHEMA,
  CAPTURE_SYSTEM,
  CAPTURE_TZ,
  buildCaptureUserMessage,
  dateKeyIn,
  normalizeCapture,
  parseCaptureOutput,
  sanitizeContext,
  validateCaptureRequest,
  type CaptureContext,
} from "@/lib/domain/smart-capture"
import { AiError, allowRequest, generateStructured } from "@/lib/server/ai"
import { requireMember } from "@/lib/server/auth"
import { loadCaptureContext } from "@/lib/server/capture-context"
import { SANDBOX } from "@/lib/supabase/env"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * POST /api/ia/captura — texto informal → propostas de tarefa (ADR 0019).
 * Só LÊ: nada é gravado aqui. A tela mostra a prévia e só cria o que a pessoa confirmar,
 * pelo fluxo normal de criar tarefa. Só membros logados; limite por pessoa (10/min, 200/dia).
 */
export async function POST(req: Request) {
  const started = Date.now()
  // Modo demonstração (só desenvolvimento): sem login, e o contexto vem do banco local da tela.
  const member = SANDBOX ? { userId: "sandbox" } : await requireMember()
  if (!member) return NextResponse.json({ erro: "não autorizado" }, { status: 401 })
  // (No modo demonstração não conta: o contador fica no banco real.)
  if (!SANDBOX && !(await allowRequest(member.userId))) return NextResponse.json({ erro: "Muitos pedidos de IA. Espere um pouco (limite: 10 por minuto, 200 por dia)." }, { status: 429 })

  const body = await req.json().catch(() => null)
  const request = validateCaptureRequest(body)
  if (!request) return NextResponse.json({ erro: "Escreva o que precisa ser feito (até 6.000 caracteres)." }, { status: 400 })

  let ctx: CaptureContext
  try {
    ctx = SANDBOX ? sanitizeContext(body?.context) : await loadCaptureContext(await supabaseServer())
  } catch (err) {
    console.error("[ia/captura] contexto:", err instanceof Error ? err.message : err)
    return NextResponse.json({ erro: "Não foi possível ler projetos, equipe e leads. Tente de novo." }, { status: 502 })
  }

  // Data de referência = o momento da captura, no fuso de São Paulo (não o do servidor nem o do navegador).
  const referenceDate = dateKeyIn(new Date(), CAPTURE_TZ)
  try {
    const result = await generateStructured({ system: CAPTURE_SYSTEM, user: buildCaptureUserMessage(request.text, ctx, referenceDate), schema: CAPTURE_SCHEMA })
    const raw = parseCaptureOutput(result.text)
    if (!raw) throw new AiError("A IA devolveu uma resposta fora do formato. Tente de novo.", 502)
    const tasks = normalizeCapture(raw, ctx, referenceDate)
    // Log mínimo: sem o texto nem os dados — só volume, tempo e custo.
    console.info("[ia/captura]", { provider: result.provider, model: result.model, ms: Date.now() - started, chars: request.text.length, tasks: tasks.length, inTokens: result.inputTokens, outTokens: result.outputTokens })
    return NextResponse.json({ referenceDate, timeZone: CAPTURE_TZ, provider: result.provider, tasks })
  } catch (err) {
    console.error("[ia/captura]", { ms: Date.now() - started, erro: err instanceof Error ? err.message.slice(0, 200) : "desconhecido" })
    if (err instanceof AiError) return NextResponse.json({ erro: err.message }, { status: err.status })
    return NextResponse.json({ erro: "Falha na IA. Tente de novo." }, { status: 500 })
  }
}
