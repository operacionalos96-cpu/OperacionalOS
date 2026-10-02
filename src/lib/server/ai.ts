import "server-only"
import { rateHit } from "./rate-limit"

/**
 * Modelo de IA — só no servidor, a chave nunca vai para o navegador.
 * Hoje: Gemini (GEMINI_API_KEY; GEMINI_MODEL opcional, senão tenta os Flash atuais em ordem).
 * Trocar de modelo (ex.: Claude) = mais um provedor aqui; as telas não mudam.
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
export async function generateJson(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new AiError("IA não configurada: coloque GEMINI_API_KEY na Vercel.", 503)
  // Nome de modelo muda e o gratuito às vezes fica sobrecarregado: tenta o próximo da lista.
  // Começa pelo mais leve/rápido (sugestões curtas não precisam do maior).
  const models = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-flash-lite-latest", "gemini-flash-latest", "gemini-3.5-flash"].filter(Boolean) as string[])]
  let res: Response | undefined
  let overloaded = false
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 1024 },
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

/** Limite por pessoa (contador no banco, vale para todas as cópias do servidor): 10/min e 200/dia. */
export async function allowRequest(userId: string) {
  return (await rateHit(`ia:min:${userId}`, 10, 60)) && (await rateHit(`ia:dia:${userId}`, 200, 86_400))
}
