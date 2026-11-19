import { NextResponse } from "next/server"
import { FunnelError, syncFromChat, loadFunnel, lookupByPhone, markReplied, markSent, stopFunnel, todayList } from "@/lib/server/whatsapp-funnel"
import { agentAgenda, agentFreeSent, agentHandOff, agentReply } from "@/lib/server/whatsapp-agent"
import { WorkerAuthError, authWorker, requireScope } from "@/lib/server/workers"
import type { ChatMessage } from "@/lib/domain/whatsapp-agent"

/**
 * API da extensão "Funil no WhatsApp Web" (Authorization: Bearer oos_… com escopo whatsapp:funnel).
 * Nada aqui envia mensagem: só consulta e registra o que a pessoa (ou o agente, ADR 0018) fez no WhatsApp.
 * Ações agent_* exigem também o escopo whatsapp:agent.
 */
const noStore = { "Cache-Control": "no-store" }
/** agent_agenda pode ler o site do lead antes da abertura. */
export const maxDuration = 45

const KINDS = new Set(["texto", "audio", "video", "outro"])
/** Mensagens que a extensão leu na conversa (conteúdo do lead: dado não confiável, só texto curto). */
function chatMessages(v: unknown): ChatMessage[] {
  if (!Array.isArray(v)) return []
  return v.slice(-30).flatMap((m) => {
    const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>
    if (typeof o.out !== "boolean") return []
    const kind = typeof o.kind === "string" && KINDS.has(o.kind) ? (o.kind as ChatMessage["kind"]) : "outro"
    return [{ out: o.out, kind, text: typeof o.text === "string" ? o.text.slice(0, 1000) : "", ...(typeof o.time === "string" ? { time: o.time.slice(0, 20) } : {}) }]
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  try {
    const w = await authWorker(req)
    requireScope(w, "whatsapp:funnel")
    if (!w.createdBy) throw new WorkerAuthError("token sem dono — gere outro em Prospecção › Conectar extensão", 403)
    const { action } = await params
    if (action.startsWith("agent_")) requireScope(w, "whatsapp:agent")
    const raw = await req.text()
    if (raw.length > 20_000) return NextResponse.json({ erro: "corpo grande demais" }, { status: 413, headers: noStore })
    const b = ((raw ? JSON.parse(raw) : {}) ?? {}) as Record<string, unknown>
    const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "")
    const data = await (async () => {
      switch (action) {
        case "ping":
          return { ok: true, nome: w.name }
        case "funnel":
          return { steps: await loadFunnel() }
        case "lookup":
          return lookupByPhone(str("phone"), str("name"))
        case "sent":
          return markSent(str("leadId"), Number(b.step), str("text").slice(0, 4000), w.createdBy!)
        case "replied":
          return markReplied(str("leadId"), w.createdBy!, b.auto === true)
        case "sync":
          return syncFromChat(str("leadId"), Array.isArray(b.sent) ? (b.sent as unknown[]).map(Number).slice(0, 20) : [], b.replied === true, w.createdBy!)
        case "stop":
          return stopFunnel(str("leadId"), w.createdBy!)
        case "today":
          return { items: await todayList(w.createdBy) }
        // ---------- agente (envia sozinho) ----------
        case "agent_agenda":
          return agentAgenda(w.createdBy!)
        case "agent_sent":
          return markSent(str("leadId"), Number(b.step), str("text").slice(0, 4000), w.createdBy!, { agent: true })
        case "agent_reply":
          return agentReply(str("leadId"), chatMessages(b.messages), w.createdBy!)
        case "agent_free_sent":
          return agentFreeSent(str("leadId"), str("text"), w.createdBy!)
        case "agent_human":
          return agentHandOff(str("leadId"), str("reason"), w.createdBy!)
        default:
          throw new FunnelError("ação desconhecida", 404)
      }
    })()
    return NextResponse.json(data, { headers: noStore })
  } catch (e) {
    if (e instanceof WorkerAuthError || e instanceof FunnelError) return NextResponse.json({ erro: e.message }, { status: e.status, headers: noStore })
    if (e instanceof SyntaxError) return NextResponse.json({ erro: "JSON inválido" }, { status: 400, headers: noStore })
    console.error("[ext]", e)
    return NextResponse.json({ erro: "falha interna" }, { status: 500, headers: noStore })
  }
}
