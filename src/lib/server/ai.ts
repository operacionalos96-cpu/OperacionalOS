import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { rateHit } from "./rate-limit"

/**
 * Modelo de IA — só no servidor, a chave nunca vai para o navegador.
 * - generateJson (mapas): Gemini (GEMINI_API_KEY; GEMINI_MODEL opcional, senão tenta os Flash atuais em ordem).
 * - generateStructured (captura inteligente, ADR 0019): Claude se houver ANTHROPIC_API_KEY
 *   (CLAUDE_MODEL opcional), senão Gemini — os dois com a resposta presa a um JSON Schema.
 * Trocar de modelo = mais um provedor aqui; as telas não mudam.
 */
export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message)
  }
}

export function aiConfigured() {
  return !!process.env.GEMINI_API_KEY
}

/** Pede ao modelo uma resposta em JSON e devolve o texto dela. */
export async function generateJson(prompt: string, opts: { temperature?: number } = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new AiError("IA não configurada: coloque GEMINI_API_KEY na Vercel.", 503)
  // Nome de modelo muda e o gratuito às vezes fica sobrecarregado: tenta o próximo da lista.
  // Começa pelo mais leve/rápido (sugestões curtas não precisam do maior).
  const models = geminiModels()
  let res: Response | undefined
  let overloaded = false
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: opts.temperature ?? 0.7, maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined) // demorou demais: tenta o próximo modelo
    if (!r) {
      overloaded = true
      continue
    }
    res = r
    // 404 = modelo não existe nesta conta; 500/503 = sobrecarga passageira → próximo modelo.
    if (r.status === 500 || r.status === 503) overloaded = true
    if (![404, 500, 503].includes(r.status)) break
  }
  if (!res || (!res.ok && overloaded)) throw new AiError("O Gemini está sobrecarregado agora (plano gratuito). Tente de novo em alguns minutos.", 503)
  if (res.status === 429) throw new AiError("Limite do plano gratuito atingido. Espere um minuto e tente de novo.", 429)
  if (!res.ok) {
    // Motivo do Google (nunca contém a chave): ajuda a saber se é chave inválida, permissão ou modelo.
    const err = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string } }
    const reason = `${res.status} ${err.error?.status ?? ""} ${err.error?.message ?? ""}`.trim().slice(0, 240)
    console.error("[ia] Gemini recusou:", reason)
    const hint =
      res.status === 400 && /API key/i.test(reason) ? "A chave do Gemini é inválida. Gere outra no AI Studio." :
      res.status === 403 ? "A chave não tem permissão para a API do Gemini." :
      res.status === 503 || res.status === 500 ? "O Gemini está sobrecarregado agora (plano gratuito). Tente de novo em alguns minutos." :
      "A IA recusou o pedido."
    throw new AiError(`${hint} (${reason})`, 502)
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  if (!text) throw new AiError("A IA não trouxe resposta. Tente reformular o balão.", 502)
  return text
}

function geminiModels() {
  return [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.5-flash"].filter(Boolean) as string[])]
}

// ---------- saída estruturada (JSON Schema) — captura inteligente, ADR 0019 ----------

/** Claude quando há ANTHROPIC_API_KEY (não treina com os dados, schema garantido); senão o Gemini já configurado. */
export function structuredProvider(): "claude" | "gemini" | null {
  if (process.env.ANTHROPIC_API_KEY) return "claude"
  if (process.env.GEMINI_API_KEY) return "gemini"
  return null
}

export interface StructuredRequest {
  /** Instruções fixas (iguais em toda chamada: o Claude guarda em cache). */
  system: string
  /** Contexto variável + texto do usuário. */
  user: string
  schema: Record<string, unknown>
  timeoutMs?: number
}

export interface StructuredResult {
  /** Texto JSON devolvido pelo modelo (quem chama valida). */
  text: string
  provider: "claude" | "gemini"
  model: string
  inputTokens?: number
  outputTokens?: number
}

export async function generateStructured(req: StructuredRequest): Promise<StructuredResult> {
  const provider = structuredProvider()
  if (provider === "claude") return claudeStructured(req)
  if (provider === "gemini") return geminiStructured(req)
  throw new AiError("IA não configurada: coloque ANTHROPIC_API_KEY (ou GEMINI_API_KEY) na Vercel.", 503)
}

async function claudeStructured(req: StructuredRequest): Promise<StructuredResult> {
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5"
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: req.timeoutMs ?? 45_000 })
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 16_000,
      // Se o modelo recusar por política, a própria API tenta outro modelo na mesma chamada.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Extração curta: pouco raciocínio basta e responde mais rápido.
      output_config: { effort: "low", format: { type: "json_schema", schema: req.schema } },
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
    })
    if (res.stop_reason === "refusal") throw new AiError("A IA recusou este texto. Reescreva ou crie as tarefas manualmente.", 422)
    if (res.stop_reason === "max_tokens") throw new AiError("Texto longo demais para estruturar de uma vez. Divida em partes.", 422)
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("")
    if (!text) throw new AiError("A IA não trouxe resposta. Tente de novo.", 502)
    return { text, provider: "claude", model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof Anthropic.RateLimitError) throw new AiError("Limite da IA atingido. Espere um minuto e tente de novo.", 429)
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("A chave da Anthropic é inválida (ANTHROPIC_API_KEY).", 502)
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new AiError("A IA demorou demais para responder. Tente de novo.", 504)
    if (err instanceof Anthropic.APIError) {
      console.error("[ia] Claude recusou:", err.status, err.message.slice(0, 240))
      throw new AiError(`A IA recusou o pedido (${err.status ?? "rede"}).`, 502)
    }
    throw err
  }
}

async function geminiStructured(req: StructuredRequest): Promise<StructuredResult> {
  const key = process.env.GEMINI_API_KEY as string
  let lastStatus = 0
  for (const model of geminiModels()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: req.schema, temperature: 0.2, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 30_000),
    }).catch(() => undefined)
    if (!r) {
      lastStatus = 504
      continue
    }
    lastStatus = r.status
    if ([404, 500, 503].includes(r.status)) continue
    if (r.status === 429) throw new AiError("Limite do plano gratuito do Gemini atingido. Espere um minuto e tente de novo.", 429)
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: { status?: string; message?: string } }
      console.error("[ia] Gemini recusou:", `${r.status} ${err.error?.status ?? ""} ${err.error?.message ?? ""}`.trim().slice(0, 240))
      throw new AiError("A IA recusou o pedido.", 502)
    }
    const data = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
    if (!text) throw new AiError("A IA não trouxe resposta. Tente de novo.", 502)
    return { text, provider: "gemini", model, inputTokens: data.usageMetadata?.promptTokenCount, outputTokens: data.usageMetadata?.candidatesTokenCount }
  }
  throw new AiError(lastStatus === 504 ? "A IA demorou demais para responder. Tente de novo." : "O Gemini está sobrecarregado agora. Tente de novo em alguns minutos.", 503)
}

/** Limite por pessoa (contador no banco, vale para todas as cópias do servidor): 10/min e 200/dia. */
export async function allowRequest(userId: string) {
  return (await rateHit(`ia:min:${userId}`, 10, 60)) && (await rateHit(`ia:dia:${userId}`, 200, 86_400))
}
