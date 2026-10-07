import { NextResponse } from "next/server"
import { JOB_TYPES, idempotencyKey, mergeConfig } from "@/lib/domain/jobs"
import { requireMember } from "@/lib/server/auth"
import { supabaseAdmin } from "@/lib/server/supabase-admin"
import { createWebhook, rotateWebhookSecret } from "@/lib/server/webhooks"
import { saveFunnel } from "@/lib/server/whatsapp-funnel"
import { createWorker, rotateWorkerToken, type Scope } from "@/lib/server/workers"
import type { LeadVideo } from "@/lib/domain/prospect-video"
import type { Lead } from "@/lib/domain/types"

/**
 * Ações HUMANAS do AI Office (só membros logados). Tokens e segredos voltam UMA vez,
 * na criação/troca, e nunca mais são exibidos.
 */
const noStore = { "Cache-Control": "no-store" }
const bad = (erro: string, status = 400) => NextResponse.json({ erro }, { status, headers: noStore })
const strs = (v: unknown, max = 50) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, max) : [])

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const member = await requireMember()
  if (!member) return bad("não autorizado", 401)
  if (!process.env.SUPABASE_SECRET_KEY) return bad("servidor sem SUPABASE_SECRET_KEY", 503)
  const { action } = await params
  const b = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>
  const id = typeof b.id === "string" ? b.id : ""
  const db = supabaseAdmin()
  const rpcOk = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args)
    if (error) return bad(/not_retryable|not_cancellable/.test(error.message) ? "não é possível nesse status" : "falhou", 409)
    return NextResponse.json({ ok: true, data }, { headers: noStore })
  }

  try {
    switch (action) {
      case "workers.create": {
        const name = typeof b.name === "string" ? b.name.trim() : ""
        if (!name) return bad("dê um nome ao worker")
        const r = await createWorker({ name, agentId: typeof b.agentId === "string" ? b.agentId : undefined, engine: typeof b.engine === "string" ? b.engine : undefined, capabilities: strs(b.capabilities), scopes: strs(b.scopes) as Scope[], createdBy: member.teamId })
        return NextResponse.json(r, { headers: noStore })
      }
      case "workers.toggle":
        await db.from("workers").update({ enabled: !!b.enabled }).eq("id", id)
        return NextResponse.json({ ok: true }, { headers: noStore })
      case "workers.rotate":
        return NextResponse.json({ token: await rotateWorkerToken(id) }, { headers: noStore })
      case "webhooks.create": {
        const name = typeof b.name === "string" ? b.name.trim() : ""
        const endpoint = typeof b.endpoint === "string" ? b.endpoint.trim() : ""
        if (!name || !endpoint) return bad("nome e endpoint são obrigatórios")
        return NextResponse.json(await createWebhook({ name, endpoint, eventTypes: strs(b.eventTypes), createdBy: member.teamId }), { headers: noStore })
      }
      case "webhooks.toggle":
        await db.from("webhooks").update({ enabled: !!b.enabled, updated_at: new Date().toISOString() }).eq("id", id)
        return NextResponse.json({ ok: true }, { headers: noStore })
      case "webhooks.events":
        await db.from("webhooks").update({ event_types: strs(b.eventTypes), updated_at: new Date().toISOString() }).eq("id", id)
        return NextResponse.json({ ok: true }, { headers: noStore })
      case "webhooks.rotate":
        return NextResponse.json({ secret: await rotateWebhookSecret(id) }, { headers: noStore })
      case "webhooks.delete":
        await db.from("webhooks").delete().eq("id", id)
        return NextResponse.json({ ok: true }, { headers: noStore })
      case "jobs.retry":
        return rpcOk("retry_job", { p_public_id: id, p_actor: member.teamId })
      case "jobs.cancel":
        return rpcOk("cancel_job", { p_public_id: id, p_actor: member.teamId })
      case "jobs.enqueue": {
        const type = typeof b.jobType === "string" ? b.jobType : ""
        const def = JOB_TYPES[type]
        if (!def) return bad("tipo de job desconhecido")
        const entityId = typeof b.entityId === "string" ? b.entityId : ""
        if (!entityId) return bad("entityId obrigatório")
        // Manual também é idempotente: pedir 2x a mesma análise não duplica (versão sobe se forçar).
        const version = typeof b.version === "number" ? b.version : 1
        return rpcOk("enqueue_job", {
          p_job_type: type, p_agent_id: def.agentId, p_entity_type: typeof b.entityType === "string" ? b.entityType : "lead", p_entity_id: entityId,
          p_payload: (b.payload as object) ?? {}, p_idempotency_key: idempotencyKey(type, entityId, version), p_created_by: member.teamId,
          p_priority: def.priority, p_max_attempts: def.maxAttempts, p_required_capabilities: def.requiredCapabilities,
          p_correlation_id: b.entityType === "lead" || !b.entityType ? `lead:${entityId}` : null,
        })
      }
      case "deliveries.retry":
        return rpcOk("retry_delivery", { p_id: id })
      case "config.update": {
        const data = mergeConfig(b.data)
        await db.from("ai_settings").upsert({ id: "queue", data, updated_at: new Date().toISOString(), updated_by: member.teamId })
        return NextResponse.json({ ok: true, data }, { headers: noStore })
      }
      case "funnel.update":
        return NextResponse.json({ ok: true, ...(await saveFunnel(b.steps, member.teamId, b.video)) }, { headers: noStore })
      case "ext.connect": {
        // Token da extensão do WhatsApp: só o escopo do funil; aparece UMA vez.
        const r = await createWorker({ name: `Extensão WhatsApp (${member.email.split("@")[0] || member.teamId})`, engine: "chrome-extension", capabilities: [], scopes: ["whatsapp:funnel"], createdBy: member.teamId })
        return NextResponse.json(r, { headers: noStore })
      }
      // ---------- vídeo de análise do lead (revisão humana) ----------
      case "video.url":
      case "video.approve":
      case "video.discard":
      case "video.generate": {
        const { data: row } = await db.from("leads").select("data").eq("id", id).maybeSingle()
        if (!row) return bad("lead não encontrado", 404)
        const l = row.data as Lead
        const v = l.video
        const save = async (video: LeadVideo) => {
          const { error } = await db.from("leads").update({ data: { ...l, video }, updated_at: new Date().toISOString() }).eq("id", id)
          if (error) throw error
          return NextResponse.json({ ok: true, video }, { headers: noStore })
        }
        if (action === "video.url") {
          const p = b.n === 2 ? v?.path2 : v?.path
          if (!p) return bad("o vídeo ainda não existe", 404)
          const { data } = await db.storage.from("conteudos").createSignedUrl(p, 60 * 60)
          return data ? NextResponse.json({ url: data.signedUrl }, { headers: noStore }) : bad("falhou", 500)
        }
        if (action === "video.approve") {
          if (v?.status !== "pronto" || !v.path) return bad("só dá para aprovar um vídeo pronto", 409)
          return save({ ...v, status: "aprovado", approvedAt: new Date().toISOString(), approvedBy: member.teamId })
        }
        if (action === "video.discard") {
          if (!v) return bad("não há vídeo", 404)
          return save({ ...v, status: "descartado" })
        }
        // gerar (ou gerar de novo): pedido humano, fora da regra automática do funil
        if (!/^https?:\/\//i.test(l.website ?? "")) return bad("o lead não tem site")
        if (v?.status === "gerando" || v?.status === "analisando") return bad("já está em andamento", 409)
        const version = (v?.version ?? 0) + 1
        // começa pela análise (Claude); ao concluir, o banco pede o render
        const def = JOB_TYPES.analyze_for_video
        const { data: q, error } = await db.rpc("enqueue_job", {
          p_job_type: "analyze_for_video", p_agent_id: def.agentId, p_entity_type: "lead", p_entity_id: id,
          p_payload: { website: l.website, name: l.name, version, manual: true }, p_idempotency_key: idempotencyKey("analyze_for_video", id, version), p_created_by: member.teamId,
          p_priority: def.priority + 10, p_max_attempts: def.maxAttempts, p_required_capabilities: def.requiredCapabilities, p_correlation_id: `lead:${id}`,
        })
        if (error) return bad("falhou ao pedir o vídeo", 500)
        const job = (q as { job: { public_id: string } }[] | null)?.[0]?.job
        return save({ status: "analisando", analysisJobId: job?.public_id, version, requestedAt: new Date().toISOString() })
      }
      default:
        return bad("ação desconhecida", 404)
    }
  } catch (e) {
    return bad(e instanceof Error ? e.message.slice(0, 200) : "falhou", 400)
  }
}
