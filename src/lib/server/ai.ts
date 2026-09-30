import "server-only"

/**
 * Modelo de IA — só no servidor, a chave nunca vai para o navegador.
 * Hoje: Gemini (GEMINI_API_KEY; modelo em GEMINI_MODEL, padrão gemini-2.5-flash).
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
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => {
    throw new AiError("A IA não respondeu a tempo. Tente de novo.", 504)
  })
  if (res.status === 429) throw new AiError("Limite do plano gratuito atingido. Espere um minuto e tente de novo.", 429)
  if (!res.ok) throw new AiError("A IA recusou o pedido. Tente de novo em instantes.", 502)
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? ""
  if (!text) throw new AiError("A IA não trouxe resposta. Tente reformular o balão.", 502)
  return text
}

/** Limite simples por pessoa (por instância do servidor): evita gastar a cota por engano. */
const hits = new Map<string, number[]>()
export function allowRequest(userId: string, perMinute = 10) {
  const now = Date.now()
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= perMinute) return false
  recent.push(now)
  hits.set(userId, recent)
  return true
}
