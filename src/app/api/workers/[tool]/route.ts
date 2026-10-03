import { NextResponse } from "next/server"
import { JobError } from "@/lib/server/jobs"
import { runTool } from "@/lib/server/worker-tools"
import { WorkerAuthError, authWorker } from "@/lib/server/workers"

/**
 * API REST dos workers: POST /api/workers/<ferramenta> com Authorization: Bearer oos_…
 * (as mesmas ferramentas do MCP). GET também funciona para as de leitura.
 */
export const maxDuration = 60
const noStore = { "Cache-Control": "no-store" }

async function handle(req: Request, tool: string, args: Record<string, unknown>) {
  try {
    const w = await authWorker(req)
    return NextResponse.json(await runTool(w, tool, args), { headers: noStore })
  } catch (e) {
    if (e instanceof WorkerAuthError || e instanceof JobError) {
      const details = e instanceof JobError ? e.details : undefined
      return NextResponse.json({ erro: e.message, ...(details ? { details } : {}) }, { status: e.status, headers: noStore })
    }
    console.error("[workers]", e)
    return NextResponse.json({ erro: "falha interna" }, { status: 500, headers: noStore })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params
  const raw = await req.text()
  if (raw.length > 200_000) return NextResponse.json({ erro: "corpo grande demais" }, { status: 413 })
  let args: Record<string, unknown> = {}
  try {
    args = raw ? JSON.parse(raw) : {}
  } catch {
    return NextResponse.json({ erro: "JSON inválido" }, { status: 400 })
  }
  return handle(req, tool, args && typeof args === "object" ? args : {})
}

export async function GET(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params
  if (!["get_worker_config", "get_queue_status", "get_next_job", "get_job", "get_job_context", "search_knowledge"].includes(tool))
    return NextResponse.json({ erro: "use POST" }, { status: 405 })
  return handle(req, tool, Object.fromEntries(new URL(req.url).searchParams))
}
