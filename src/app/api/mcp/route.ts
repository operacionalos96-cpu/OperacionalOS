import { NextResponse } from "next/server"
import { JobError } from "@/lib/server/jobs"
import { TOOLS, runTool, toolsFor } from "@/lib/server/worker-tools"
import { WorkerAuthError, authWorker } from "@/lib/server/workers"

/**
 * Servidor MCP (Streamable HTTP, sem sessão): POST /api/mcp com JSON-RPC 2.0.
 * Autenticação: Authorization: Bearer <token do worker>. As ferramentas listadas
 * dependem dos escopos do worker. Nenhuma IA roda aqui: o MCP só dá acesso à fila.
 */
export const maxDuration = 60
const PROTOCOL = "2025-06-18"

type RpcReq = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> }
const ok = (id: RpcReq["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result })
const fail = (id: RpcReq["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })

export async function POST(req: Request) {
  let worker
  try {
    worker = await authWorker(req)
  } catch (e) {
    const status = e instanceof WorkerAuthError ? e.status : 401
    return NextResponse.json(fail(null, -32001, e instanceof Error ? e.message : "não autorizado"), { status, headers: { "WWW-Authenticate": "Bearer" } })
  }
  let body: RpcReq | RpcReq[]
  try {
    body = JSON.parse(await req.text())
  } catch {
    return NextResponse.json(fail(null, -32700, "JSON inválido"), { status: 400 })
  }
  const batch = Array.isArray(body) ? body : [body]
  const out = []
  for (const m of batch) {
    if (m.id === undefined) continue // notificação (ex.: notifications/initialized): sem resposta
    try {
      switch (m.method) {
        case "initialize":
          out.push(ok(m.id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "operacionalos-ai-office", version: "1.0.0" }, instructions: "Fila de trabalho do AI Office. Use claim_next_job, execute, complete_job. Sem trabalho: respeite poll.retry_after_seconds." }))
          break
        case "ping":
          out.push(ok(m.id, {}))
          break
        case "tools/list":
          out.push(ok(m.id, { tools: toolsFor(worker).map(([name, t]) => ({ name, description: t.description, inputSchema: t.input })) }))
          break
        case "tools/call": {
          const name = String(m.params?.name ?? "")
          if (!TOOLS[name]) {
            out.push(fail(m.id, -32602, `ferramenta desconhecida: ${name}`))
            break
          }
          try {
            const result = await runTool(worker, name, (m.params?.arguments as Record<string, unknown>) ?? {})
            out.push(ok(m.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result && typeof result === "object" && !Array.isArray(result) ? result : { value: result } }))
          } catch (e) {
            // Erro de ferramenta volta como resultado com isError (o modelo vê e corrige).
            const msg = e instanceof JobError || e instanceof WorkerAuthError ? e.message : "falha interna"
            const details = e instanceof JobError ? e.details : undefined
            out.push(ok(m.id, { isError: true, content: [{ type: "text", text: JSON.stringify({ erro: msg, ...(details ? { details } : {}) }) }] }))
          }
          break
        }
        default:
          out.push(fail(m.id, -32601, `método não suportado: ${m.method}`))
      }
    } catch {
      out.push(fail(m.id, -32603, "falha interna"))
    }
  }
  if (!out.length) return new NextResponse(null, { status: 202 })
  return NextResponse.json(Array.isArray(body) ? out : out[0], { headers: { "Cache-Control": "no-store" } })
}

export function GET() {
  return NextResponse.json({ erro: "use POST (MCP Streamable HTTP, sem SSE)" }, { status: 405, headers: { Allow: "POST" } })
}
