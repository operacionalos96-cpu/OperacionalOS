/**
 * Adaptadores de IA da leva 1 (nota 42, F5.2; nota 41): um compatível com OpenAI (Ollama, LM Studio,
 * OpenRouter, xAI, DeepSeek, Mistral, Kimi, Inception e o personalizado) e um nativo da Anthropic (Claude com chave).
 *
 * - A chave sai do cofre direto para o cabeçalho; nunca entra em mensagem, registro ou erro.
 * - "Sem cota" (429, 402, insufficient_quota) vira QuotaError com o horário de volta, quando o provedor diz.
 * - Os endereços abaixo foram escritos de memória em 14/11/2026: CONFERIR na documentação oficial de cada um
 *   antes de publicar (as páginas estão na nota 41). O personalizado usa o endereço confirmado na janela do app.
 */

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  /** argumentos que não eram JSON válido: a chamada é recusada, nunca adivinhada */
  invalid?: boolean
}
export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string }

export interface ChatRequest {
  model: string
  system: string
  messages: ChatMessage[]
  tools?: ToolDef[]
  maxTokens?: number
}
export interface ChatResult {
  text: string
  toolCalls: ToolCall[]
  usage: { input: number; output: number }
  model: string
}
export interface ChatAdapter {
  chat(req: ChatRequest): Promise<ChatResult>
  /** O modelo aceita ferramentas? (Ollama: pergunta ao servidor; os demais: sim.) */
  supportsTools(model: string): Promise<boolean>
}

export class ProviderError extends Error {
  constructor(
    public kind: "quota" | "auth" | "unavailable" | "bad_request" | "other",
    message: string,
    public resetsAt: Date | null = null,
    public status = 0,
  ) {
    super(message)
  }
}

export const PROVIDERS: Record<string, { label: string; protocol: "openai" | "anthropic"; base: string; local?: boolean; key: boolean; docs: string }> = {
  ollama: { label: "Ollama", protocol: "openai", base: "http://localhost:11434/v1", local: true, key: false, docs: "https://docs.ollama.com/api/openai-compatibility" },
  lmstudio: { label: "LM Studio", protocol: "openai", base: "http://localhost:1234/v1", local: true, key: false, docs: "https://lmstudio.ai/docs/developer/openai-compat" },
  openrouter: { label: "OpenRouter", protocol: "openai", base: "https://openrouter.ai/api/v1", key: true, docs: "https://openrouter.ai/docs/api/reference/limits" },
  xai: { label: "xAI (Grok)", protocol: "openai", base: "https://api.x.ai/v1", key: true, docs: "https://docs.x.ai/docs/overview" },
  deepseek: { label: "DeepSeek", protocol: "openai", base: "https://api.deepseek.com/v1", key: true, docs: "https://api-docs.deepseek.com/" },
  mistral: { label: "Mistral", protocol: "openai", base: "https://api.mistral.ai/v1", key: true, docs: "https://docs.mistral.ai/" },
  kimi: { label: "Kimi (Moonshot)", protocol: "openai", base: "https://api.moonshot.ai/v1", key: true, docs: "https://platform.moonshot.ai/docs" },
  inception: { label: "Inception", protocol: "openai", base: "https://api.inceptionlabs.ai/v1", key: true, docs: "https://docs.inceptionlabs.ai/get-started/get-started" },
  anthropic: { label: "Claude (chave de API)", protocol: "anthropic", base: "https://api.anthropic.com", key: true, docs: "https://docs.anthropic.com/en/api/messages" },
}

/** Endereço que o motor aceita: https fora do PC; http só para o próprio PC. Sem usuário:senha nem "?". */
export function safeEndpoint(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.username || u.password || u.search || u.hash) return null
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1"
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null
  return u.toString().replace(/\/+$/, "")
}

function resetsFrom(h: Headers, now = Date.now()): Date | null {
  const ra = h.get("retry-after")
  if (ra) {
    const s = Number(ra)
    if (Number.isFinite(s)) return new Date(now + s * 1000)
    const d = Date.parse(ra)
    if (!Number.isNaN(d)) return new Date(d)
  }
  for (const k of ["anthropic-ratelimit-requests-reset", "anthropic-ratelimit-tokens-reset", "x-ratelimit-reset-requests", "x-ratelimit-reset"]) {
    const v = h.get(k)
    if (!v) continue
    const n = Number(v)
    if (Number.isFinite(n)) return new Date(n > 1e12 ? n : n > 1e9 ? n * 1000 : now + n * 1000)
    const d = Date.parse(v)
    if (!Number.isNaN(d)) return new Date(d)
  }
  return null
}

async function failure(res: Response, provider: string): Promise<ProviderError> {
  let detail = ""
  try {
    const body = (await res.json()) as { error?: { code?: string; type?: string; message?: string } | string }
    const e = typeof body.error === "string" ? { message: body.error } : body.error
    detail = [e?.code, e?.type].filter(Boolean).join(" ")
  } catch {
    /* corpo sem JSON */
  }
  const quota = res.status === 429 || res.status === 402 || /insufficient_quota|rate_limit|quota/i.test(detail)
  if (quota) return new ProviderError("quota", `${provider} atingiu o limite`, resetsFrom(res.headers), res.status)
  if (res.status === 401 || res.status === 403) return new ProviderError("auth", `${provider} recusou a chave`, null, res.status)
  if (res.status >= 500) return new ProviderError("unavailable", `${provider} fora do ar (${res.status})`, null, res.status)
  // nunca devolve o texto do provedor: ele pode ecoar o pedido (e o pedido pode ter dado da pessoa)
  return new ProviderError(res.status === 400 || res.status === 404 || res.status === 422 ? "bad_request" : "other", `${provider} respondeu ${res.status}${detail ? ` (${detail.slice(0, 60)})` : ""}`, null, res.status)
}

async function post(url: string, headers: Record<string, string>, body: unknown, provider: string, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    throw new ProviderError("unavailable", `${provider} não respondeu`)
  }
}

const parseArgs = (raw: unknown): { args: Record<string, unknown>; invalid?: boolean } => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return { args: raw as Record<string, unknown> }
  if (typeof raw !== "string" || !raw.trim()) return { args: {} }
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" && !Array.isArray(v) ? { args: v } : { args: {}, invalid: true }
  } catch {
    return { args: {}, invalid: true }
  }
}

export function openAICompatible(opts: { base: string; key?: string | null; provider: string; timeoutMs?: number }): ChatAdapter {
  const base = opts.base.replace(/\/+$/, "")
  const auth: Record<string, string> = opts.key ? { authorization: `Bearer ${opts.key}` } : {}
  const timeout = opts.timeoutMs ?? 180_000
  return {
    async supportsTools(model) {
      if (opts.provider !== "ollama") return true
      // Ollama: /api/show diz as capacidades do modelo; sem resposta clara, trata como "não usa ferramentas"
      try {
        const res = await fetch(`${base.replace(/\/v1$/, "")}/api/show`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model }), signal: AbortSignal.timeout(10_000) })
        if (!res.ok) return false
        const j = (await res.json()) as { capabilities?: string[] }
        return Array.isArray(j.capabilities) && j.capabilities.includes("tools")
      } catch {
        return false
      }
    },
    async chat(req) {
      const messages: unknown[] = [{ role: "system", content: req.system }]
      for (const m of req.messages) {
        if (m.role === "tool") messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content })
        else if (m.role === "assistant" && m.toolCalls?.length)
          messages.push({ role: "assistant", content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) })
        else messages.push({ role: m.role, content: m.content })
      }
      const body: Record<string, unknown> = { model: req.model, messages, max_tokens: req.maxTokens ?? 2048 }
      if (req.tools?.length) body.tools = req.tools.map((t) => ({ type: "function", function: t }))
      const res = await post(`${base}/chat/completions`, auth, body, opts.provider, timeout)
      if (!res.ok) throw await failure(res, opts.provider)
      const j = (await res.json()) as {
        model?: string
        choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number }
        error?: { code?: string; message?: string }
      }
      // OpenRouter às vezes devolve 200 com "error" no corpo
      if (j.error) throw /quota|rate|limit/i.test(`${j.error.code} ${j.error.message}`) ? new ProviderError("quota", `${opts.provider} atingiu o limite`) : new ProviderError("other", `${opts.provider} devolveu erro`)
      const msg = j.choices?.[0]?.message
      if (!msg) throw new ProviderError("other", `${opts.provider} respondeu sem mensagem`)
      return {
        text: typeof msg.content === "string" ? msg.content : "",
        toolCalls: (msg.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${i}`, name: String(c.function?.name ?? ""), ...parseArgs(c.function?.arguments) })),
        usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 },
        model: j.model ?? req.model,
      }
    },
  }
}

export function anthropicNative(opts: { key: string; base?: string; timeoutMs?: number }): ChatAdapter {
  const base = (opts.base ?? PROVIDERS.anthropic.base).replace(/\/+$/, "")
  const timeout = opts.timeoutMs ?? 180_000
  return {
    supportsTools: async () => true,
    async chat(req) {
      const messages: { role: "user" | "assistant"; content: unknown[] }[] = []
      const push = (role: "user" | "assistant", block: unknown) => {
        const last = messages[messages.length - 1]
        if (last && last.role === role) last.content.push(block)
        else messages.push({ role, content: [block] })
      }
      for (const m of req.messages) {
        if (m.role === "user") push("user", { type: "text", text: m.content })
        else if (m.role === "tool") push("user", { type: "tool_result", tool_use_id: m.toolCallId, content: m.content })
        else {
          if (m.content) push("assistant", { type: "text", text: m.content })
          for (const c of m.toolCalls ?? []) push("assistant", { type: "tool_use", id: c.id, name: c.name, input: c.args })
        }
      }
      const body: Record<string, unknown> = { model: req.model, system: req.system, messages, max_tokens: req.maxTokens ?? 2048 }
      if (req.tools?.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
      const res = await post(`${base}/v1/messages`, { "x-api-key": opts.key, "anthropic-version": "2023-06-01" }, body, "anthropic", timeout)
      if (!res.ok) throw await failure(res, "anthropic")
      const j = (await res.json()) as { model?: string; content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number } }
      const blocks = j.content ?? []
      return {
        text: blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
        toolCalls: blocks.filter((b) => b.type === "tool_use").map((b, i) => ({ id: b.id || `toolu_${i}`, name: String(b.name ?? ""), ...parseArgs(b.input) })),
        usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0 },
        model: j.model ?? req.model,
      }
    },
  }
}

/** Monta o adaptador de uma IA da entrega. A chave vem do cofre; o endereço do personalizado tem de ser o confirmado. */
export function adapterFor(ia: { kind: string; provider: string; endpoint?: string | null }, key: string | null, confirmedEndpoint?: string | null): ChatAdapter {
  if (ia.kind === "acp" || ia.kind === "assinatura") throw new ProviderError("other", "tipo de IA não liberado nesta versão")
  if (ia.kind === "compativel") {
    const ep = ia.endpoint ? safeEndpoint(ia.endpoint) : null
    if (!ep) throw new ProviderError("bad_request", "endereço do provedor personalizado inválido")
    // a chave fica presa ao endereço confirmado na janela do app: se o banco mudou o endereço, não manda a chave
    if (key && (!confirmedEndpoint || safeEndpoint(confirmedEndpoint) !== ep)) throw new ProviderError("auth", "endereço mudou; confirme de novo na janela do app")
    return openAICompatible({ base: ep, key, provider: ia.provider })
  }
  const p = PROVIDERS[ia.provider]
  if (!p) throw new ProviderError("bad_request", `provedor sem adaptador: ${ia.provider}`)
  if (p.key && !key) throw new ProviderError("auth", `falta a chave de ${p.label} no cofre do PC`)
  return p.protocol === "anthropic" ? anthropicNative({ key: key as string }) : openAICompatible({ base: p.base, key, provider: ia.provider })
}
