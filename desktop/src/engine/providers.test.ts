/* eslint-disable @typescript-eslint/no-explicit-any -- teste lê JSON do banco e de servidores falsos; o formato é conferido pelas asserções */
/**
 * Adaptadores contra um servidor falso local (HTTP de verdade, em 127.0.0.1): formato do pedido,
 * chave só no cabeçalho, ferramentas, sem cota com horário de volta, chave recusada e endereço trocado.
 */
import { createServer, type IncomingMessage, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ProviderError, adapterFor, anthropicNative, openAICompatible, safeEndpoint } from "./providers"

let server: Server
let base: string
const seen: { url: string; headers: IncomingMessage["headers"]; body: any }[] = []
let next: (url: string, body: any) => { status: number; headers?: Record<string, string>; body: unknown }

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : null
      seen.push({ url: req.url ?? "", headers: req.headers, body })
      const r = next(req.url ?? "", body)
      res.writeHead(r.status, { "content-type": "application/json", ...(r.headers ?? {}) })
      res.end(JSON.stringify(r.body))
    })
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((ok) => server.close(() => ok())))

const SECRET = "sk-or-v1-segredo-que-nao-pode-vazar"

describe("compatível com OpenAI", () => {
  it("manda system, mensagens e ferramentas; a chave só no cabeçalho; lê texto, ferramentas e uso", async () => {
    next = () => ({
      status: 200,
      body: {
        model: "deepseek/deepseek-chat:free",
        choices: [{ message: { content: "Vou ler a skill.", tool_calls: [{ id: "c1", function: { name: "skill_ler", arguments: '{"nome":"pesquisa_hzk"}' } }, { id: "c2", function: { name: "x", arguments: "{quebrado" } }] } }],
        usage: { prompt_tokens: 50, completion_tokens: 7 },
      },
    })
    const a = openAICompatible({ base: `${base}/v1`, key: SECRET, provider: "openrouter" })
    const r = await a.chat({
      model: "deepseek/deepseek-chat:free", system: "Você é a Pesquisadora.",
      messages: [{ role: "user", content: "oi" }, { role: "assistant", content: "", toolCalls: [{ id: "c0", name: "skill_ler", args: { nome: "a" } }] }, { role: "tool", toolCallId: "c0", name: "skill_ler", content: "corpo" }],
      tools: [{ name: "skill_ler", description: "abre skill", parameters: { type: "object", properties: { nome: { type: "string" } } } }],
    })
    const req = seen.at(-1)!
    expect(req.url).toBe("/v1/chat/completions")
    expect(req.headers.authorization).toBe(`Bearer ${SECRET}`)
    expect(JSON.stringify(req.body)).not.toContain(SECRET)
    expect(req.body.messages[0]).toEqual({ role: "system", content: "Você é a Pesquisadora." })
    expect(req.body.messages[2].tool_calls[0].function).toEqual({ name: "skill_ler", arguments: '{"nome":"a"}' })
    expect(req.body.messages[3]).toEqual({ role: "tool", tool_call_id: "c0", content: "corpo" })
    expect(req.body.tools[0].type).toBe("function")
    expect(r.text).toBe("Vou ler a skill.")
    expect(r.toolCalls[0]).toEqual({ id: "c1", name: "skill_ler", args: { nome: "pesquisa_hzk" } })
    expect(r.toolCalls[1].invalid).toBe(true) // argumento quebrado não é adivinhado
    expect(r.usage).toEqual({ input: 50, output: 7 })
  })

  it("sem chave (local) não manda Authorization", async () => {
    next = () => ({ status: 200, body: { choices: [{ message: { content: "oi" } }] } })
    await openAICompatible({ base: `${base}/v1`, provider: "ollama" }).chat({ model: "qwen3:4b", system: "s", messages: [{ role: "user", content: "x" }] })
    expect(seen.at(-1)!.headers.authorization).toBeUndefined()
  })

  it("429 vira 'sem cota' com o horário de volta (Retry-After); a mensagem não traz a chave", async () => {
    next = () => ({ status: 429, headers: { "retry-after": "120" }, body: { error: { code: "rate_limit_exceeded", message: `chave ${SECRET} sem saldo` } } })
    const before = Date.now()
    const e = await openAICompatible({ base: `${base}/v1`, key: SECRET, provider: "openrouter" }).chat({ model: "m", system: "s", messages: [{ role: "user", content: "x" }] }).catch((x) => x)
    expect(e).toBeInstanceOf(ProviderError)
    expect(e.kind).toBe("quota")
    expect(e.resetsAt.getTime()).toBeGreaterThanOrEqual(before + 119_000)
    expect(e.message).not.toContain(SECRET)
  })

  it("402 e insufficient_quota também são 'sem cota'; 200 com erro no corpo (OpenRouter) também", async () => {
    next = () => ({ status: 402, body: { error: { code: "insufficient_quota" } } })
    expect((await openAICompatible({ base: `${base}/v1`, provider: "openrouter" }).chat({ model: "m", system: "s", messages: [] }).catch((x) => x)).kind).toBe("quota")
    next = () => ({ status: 200, body: { error: { code: 429, message: "Rate limit exceeded: free-models-per-day" } } })
    expect((await openAICompatible({ base: `${base}/v1`, provider: "openrouter" }).chat({ model: "m", system: "s", messages: [] }).catch((x) => x)).kind).toBe("quota")
  })

  it("401 é chave recusada; 500 é fora do ar; servidor que não responde é fora do ar", async () => {
    next = () => ({ status: 401, body: { error: "bad key" } })
    expect((await openAICompatible({ base: `${base}/v1`, provider: "xai", key: "k" }).chat({ model: "m", system: "s", messages: [] }).catch((x) => x)).kind).toBe("auth")
    next = () => ({ status: 503, body: {} })
    expect((await openAICompatible({ base: `${base}/v1`, provider: "xai", key: "k" }).chat({ model: "m", system: "s", messages: [] }).catch((x) => x)).kind).toBe("unavailable")
    expect((await openAICompatible({ base: "http://127.0.0.1:1/v1", provider: "ollama" }).chat({ model: "m", system: "s", messages: [] }).catch((x) => x)).kind).toBe("unavailable")
  })

  it("Ollama: pergunta ao servidor se o modelo usa ferramentas", async () => {
    next = (_u, b) => ({ status: 200, body: { capabilities: b.model === "qwen3:4b" ? ["completion", "tools"] : ["completion"] } })
    const a = openAICompatible({ base: `${base}/v1`, provider: "ollama" })
    expect(await a.supportsTools("qwen3:4b")).toBe(true)
    expect(seen.at(-1)!.url).toBe("/api/show")
    expect(await a.supportsTools("gemma:2b")).toBe(false)
  })
})

describe("Anthropic nativo (Claude com chave)", () => {
  it("system separado, tools com input_schema, resultado de ferramenta como tool_result; chave em x-api-key", async () => {
    next = () => ({ status: 200, body: { model: "claude-sonnet-5-5", content: [{ type: "text", text: "Pronto." }, { type: "tool_use", id: "tu1", name: "arquivos__ler", input: { caminho: "a.md" } }], usage: { input_tokens: 30, output_tokens: 4 } } })
    const r = await anthropicNative({ key: "sk-ant-x", base }).chat({
      model: "claude-sonnet-5-5", system: "Você é o bot.",
      messages: [{ role: "user", content: "leia" }, { role: "assistant", content: "", toolCalls: [{ id: "tu0", name: "arquivos__ler", args: { caminho: "b" } }] }, { role: "tool", toolCallId: "tu0", name: "arquivos__ler", content: "texto" }],
      tools: [{ name: "arquivos__ler", description: "lê", parameters: { type: "object", properties: {} } }],
    })
    const req = seen.at(-1)!
    expect(req.url).toBe("/v1/messages")
    expect(req.headers["x-api-key"]).toBe("sk-ant-x")
    expect(req.headers["anthropic-version"]).toBe("2023-06-01")
    expect(req.body.system).toBe("Você é o bot.")
    expect(req.body.tools[0]).toEqual({ name: "arquivos__ler", description: "lê", input_schema: { type: "object", properties: {} } })
    expect(req.body.messages.map((m: any) => m.role)).toEqual(["user", "assistant", "user"])
    expect(req.body.messages[2].content[0]).toEqual({ type: "tool_result", tool_use_id: "tu0", content: "texto" })
    expect(r).toMatchObject({ text: "Pronto.", toolCalls: [{ id: "tu1", name: "arquivos__ler", args: { caminho: "a.md" } }], usage: { input: 30, output: 4 } })
  })

  it("429 com anthropic-ratelimit-requests-reset vira 'sem cota' com o horário", async () => {
    next = () => ({ status: 429, headers: { "anthropic-ratelimit-requests-reset": "2026-11-15T03:00:00Z" }, body: { type: "error", error: { type: "rate_limit_error" } } })
    const e = await anthropicNative({ key: "k", base }).chat({ model: "m", system: "s", messages: [] }).catch((x) => x)
    expect(e.kind).toBe("quota")
    expect(e.resetsAt.toISOString()).toBe("2026-11-15T03:00:00.000Z")
  })
})

describe("qual adaptador, e a chave presa ao endereço confirmado", () => {
  it("personalizado: manda a chave só se o endereço do banco for o confirmado no app", () => {
    const ia = { kind: "compativel", provider: "meu", endpoint: "https://ia.exemplo.com/v1" }
    expect(() => adapterFor(ia, "k", "https://ia.exemplo.com/v1")).not.toThrow()
    expect(() => adapterFor(ia, "k", "https://outro.exemplo.com/v1")).toThrow(/confirme/)
    expect(() => adapterFor(ia, "k", null)).toThrow(/confirme/)
    expect(() => adapterFor({ ...ia, endpoint: "http://ia.exemplo.com/v1" }, null)).toThrow(/inválido/)
  })
  it("provedor com chave sem chave no cofre, ACP e assinatura são recusados", () => {
    expect(() => adapterFor({ kind: "chave", provider: "openrouter" }, null)).toThrow(/cofre/)
    expect(() => adapterFor({ kind: "acp", provider: "codex" }, null)).toThrow(/não liberado/)
    expect(() => adapterFor({ kind: "assinatura", provider: "claude_code" }, null)).toThrow(/não liberado/)
    expect(() => adapterFor({ kind: "local", provider: "ollama" }, null)).not.toThrow()
    expect(() => adapterFor({ kind: "chave", provider: "anthropic" }, "k")).not.toThrow()
  })
  it("endereço seguro: https fora do PC, http só local, sem usuário:senha nem '?'", () => {
    expect(safeEndpoint("https://ia.exemplo.com/v1/")).toBe("https://ia.exemplo.com/v1")
    expect(safeEndpoint("http://localhost:11434/v1")).toBe("http://localhost:11434/v1")
    expect(safeEndpoint("http://ia.exemplo.com/v1")).toBeNull()
    expect(safeEndpoint("https://u:p@ia.exemplo.com/v1")).toBeNull()
    expect(safeEndpoint("https://ia.exemplo.com/v1?key=abc")).toBeNull()
    expect(safeEndpoint("file:///c:/x")).toBeNull()
  })
})
