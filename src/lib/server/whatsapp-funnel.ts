import "server-only"
import { randomUUID } from "node:crypto"
import { publicId } from "@/lib/domain/jobs"
import { makeEvent, type BusinessEventType } from "@/lib/domain/ai-office"
import { findLeadByName, findLeadByPhone, followupsDue, funnelOf, mergeFunnel, nextStep, renderTemplate, repliedPatch, sentPatch, type FunnelStep } from "@/lib/domain/funnel"
import { contactedPatch } from "@/lib/domain/prospecting"
import { stepMediaFor, videoOrdinal } from "@/lib/domain/prospect-video"
import type { Lead } from "@/lib/domain/types"
import { supabaseAdmin } from "./supabase-admin"

/**
 * Funil de WhatsApp no servidor (usado pela extensão do Chrome). A extensão NUNCA envia
 * sozinha: ela escreve a mensagem na caixa do WhatsApp Web e a pessoa aperta Enter.
 * Aqui só se consulta o lead/passo e se registra o que o humano fez.
 */
export class FunnelError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

export async function loadFunnel(): Promise<FunnelStep[]> {
  const { data } = await supabaseAdmin().from("ai_settings").select("data").eq("id", "whatsapp_funnel").maybeSingle()
  return mergeFunnel((data?.data as { steps?: unknown } | undefined)?.steps)
}

export async function saveFunnel(raw: unknown, by: string) {
  const steps = mergeFunnel(raw)
  const { error } = await supabaseAdmin().from("ai_settings").upsert({ id: "whatsapp_funnel", data: { steps }, updated_at: new Date().toISOString(), updated_by: by })
  if (error) throw error
  return steps
}

async function allLeads(): Promise<Lead[]> {
  const out: Lead[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabaseAdmin().from("leads").select("data").order("id").range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []).map((r) => r.data as Lead))
    if (!data || data.length < 1000) break
  }
  return out
}

async function getLead(id: string): Promise<Lead> {
  if (!id || id.length > 64) throw new FunnelError("lead inválido")
  const { data } = await supabaseAdmin().from("leads").select("data").eq("id", id).maybeSingle()
  if (!data) throw new FunnelError("lead não encontrado", 404)
  return data.data as Lead
}

async function saveLead(l: Lead) {
  const { error } = await supabaseAdmin().from("leads").update({ data: l, updated_at: new Date().toISOString() }).eq("id", l.id)
  if (error) throw error
}

async function log(l: Lead, actorId: string, text: string, type: BusinessEventType, metadata: Record<string, unknown>) {
  const at = new Date().toISOString()
  const db = supabaseAdmin()
  const activity = { id: randomUUID(), leadId: l.id, kind: "mensagem", text: text.slice(0, 4000), authorId: actorId, createdAt: at }
  await db.from("activities").insert({ id: activity.id, data: activity })
  const e = makeEvent({ type, entity: { type: "lead", id: l.id }, actor: { type: "human", id: actorId }, metadata: { name: l.name, via: "extensao_whatsapp", ...metadata } }, publicId("evt"), at)
  const { error } = await db.from("events").insert(e)
  if (error) console.warn("[funil] evento não gravou", error.message)
}

/** Link temporário (15 min) do áudio/vídeo, para a extensão anexar na conversa. */
async function mediaLink(media: FunnelStep["media"] | null) {
  if (!media) return null
  const { data } = await supabaseAdmin().storage.from("conteudos").createSignedUrl(media.path, 15 * 60)
  return data ? { url: data.signedUrl, name: media.name, mime: media.mime, size: media.size } : null
}

/** O que a extensão mostra para o lead da conversa aberta. */
async function view(l: Lead, steps: FunnelStep[], now: Date) {
  const f = funnelOf(l)
  const n = nextStep(l, steps, now)
  // Vídeo: o personalizado do lead (aprovado) tem prioridade sobre o arquivo padrão do funil.
  const m = n ? stepMediaFor(l, n.step, videoOrdinal(steps, n.index)) : null
  return {
    lead: { id: l.id, name: l.name, company: l.company ?? null, segment: l.segment ?? null, city: l.city ?? null, stage: l.stage, website: l.website ?? null, problems: l.analysis?.problems?.slice(0, 3) ?? [] },
    funnel: { step: f.step, total: steps.length, lastSentAt: f.lastSentAt ?? null, repliedAt: f.repliedAt ?? null, stopped: !!f.stopped },
    // Texto de cada passo já personalizado: a extensão compara com o que está na conversa.
    steps: steps.map((s, i) => ({ index: i, label: s.label, kind: s.kind, trigger: s.trigger, delayDays: s.delayDays, done: i < f.step, text: s.template ? renderTemplate(s.template, l, now) : "", sentAt: [...f.history].reverse().find((h) => h.step === i)?.at ?? null })),
    next: n
      ? {
          index: n.index,
          label: n.step.label,
          kind: n.step.kind,
          trigger: n.step.trigger,
          due: n.due,
          waitingReply: n.waitingReply,
          dueAt: n.dueAt ? n.dueAt.toISOString() : null,
          text: n.step.template ? renderTemplate(n.step.template, l, now) : "",
          media: await mediaLink(m?.media ?? null),
          missingMedia: n.step.kind !== "texto" && !m?.media,
          mediaNote: m?.note ?? null,
        }
      : null,
  }
}

export async function lookupByPhone(phone: string, name = "") {
  const digits = phone.replace(/\D/g, "")
  if (digits && (digits.length < 10 || digits.length > 15)) throw new FunnelError("número inválido")
  if (!digits && name.trim().length < 3) throw new FunnelError("informe número ou nome")
  const [steps, leads] = await Promise.all([loadFunnel(), allLeads()])
  const byPhone = digits ? findLeadByPhone(leads, digits) : undefined
  // Sem número visível (conta comercial, contato salvo): tenta pelo nome da conversa.
  const l = byPhone ?? (name.trim() ? findLeadByName(leads, name.slice(0, 120)) : undefined)
  return l ? { found: true as const, byName: !byPhone, ...(await view(l, steps, new Date())) } : { found: false as const }
}

export async function markSent(leadId: string, index: number, text: string, actorId: string) {
  const [steps, l] = await Promise.all([loadFunnel(), getLead(leadId)])
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) throw new FunnelError("passo inválido")
  const at = new Date().toISOString()
  const step = steps[index]
  const body = text.trim() || (step.kind === "texto" ? renderTemplate(step.template, l, new Date()) : `(${step.kind === "audio" ? "áudio" : "vídeo"} enviado${step.media ? `: ${step.media.name}` : ""})`)
  const next: Lead = {
    ...l,
    ...(index === 0 && l.contactStatus !== "contacted" ? contactedPatch(l, body, at, "whatsapp") : {}),
    funnel: sentPatch(l, index, at, actorId),
    lastActivityAt: at,
  }
  await saveLead(next)
  await log(next, actorId, `Funil · ${step.label} (WhatsApp): ${body}`, index === 0 ? "lead.contacted" : "lead.followup_sent", { step: index, kind: step.kind, label: step.label, channel: "whatsapp" })
  return view(next, steps, new Date())
}

export async function markReplied(leadId: string, actorId: string, auto = false) {
  const [steps, l] = await Promise.all([loadFunnel(), getLead(leadId)])
  const f = funnelOf(l)
  // Detecção automática: só conta se for depois da nossa última mensagem (e uma vez).
  if (auto && f.repliedAt && (!f.lastSentAt || f.repliedAt >= f.lastSentAt)) return view(l, steps, new Date())
  const at = new Date().toISOString()
  const next: Lead = { ...l, funnel: repliedPatch(l, at), lastActivityAt: at }
  await saveLead(next)
  await log(next, actorId, auto ? "Respondeu no WhatsApp (detectado pela extensão)" : "Respondeu no WhatsApp", "lead.replied", { step: f.step, auto })
  return view(next, steps, new Date())
}

/**
 * O que a extensão viu na conversa do WhatsApp: passos já enviados e se ele respondeu depois.
 * Só anda para frente (nunca desfaz um registro).
 */
export async function syncFromChat(leadId: string, sent: number[], replied: boolean, actorId: string) {
  const [steps, l] = await Promise.all([loadFunnel(), getLead(leadId)])
  const f = funnelOf(l)
  const fresh = [...new Set(sent)].filter((i) => Number.isInteger(i) && i >= f.step && i < steps.length).sort((a, b) => a - b)
  const waiting = nextStep(l, steps, new Date())?.waitingReply
  if (!fresh.length && !(replied && waiting)) return view(l, steps, new Date())
  let next: Lead = l
  const at = new Date()
  for (const i of fresh) {
    const iso = new Date(at.getTime() + i).toISOString()
    next = { ...next, ...(i === 0 && next.contactStatus !== "contacted" ? contactedPatch(next, renderTemplate(steps[0].template, next, at), iso, "whatsapp") : {}), funnel: sentPatch(next, i, iso, actorId), lastActivityAt: iso }
  }
  if (replied) next = { ...next, funnel: repliedPatch(next, new Date(at.getTime() + 100).toISOString()) }
  await saveLead(next)
  const parts = [fresh.length ? `enviado(s): ${fresh.map((i) => steps[i].label).join(", ")}` : "", replied ? "ele respondeu" : ""].filter(Boolean)
  await log(next, actorId, `Funil atualizado pela conversa do WhatsApp — ${parts.join("; ")}`, fresh.length ? "lead.followup_sent" : "lead.replied", { synced: true, steps: fresh, replied })
  return view(next, steps, new Date())
}

export async function stopFunnel(leadId: string, actorId: string) {
  const [steps, l] = await Promise.all([loadFunnel(), getLead(leadId)])
  const next: Lead = { ...l, funnel: { ...funnelOf(l), stopped: true } }
  await saveLead(next)
  await log(next, actorId, "Saiu do funil de WhatsApp", "lead.followup_sent", { stopped: true })
  return view(next, steps, new Date())
}

/** Lista do dia: quem vence hoje (dias) e quem respondeu e está esperando o próximo passo. */
export async function todayList(ownerId: string | null) {
  const [steps, leads] = await Promise.all([loadFunnel(), allLeads()])
  const now = new Date()
  return followupsDue(leads, steps, now, ownerId ?? undefined)
    .slice(0, 100)
    .map((x) => ({ leadId: x.lead.id, name: x.lead.name, contact: x.lead.contact ?? null, step: x.index, label: x.step.label, kind: x.step.kind, overdue: x.dueAt.getTime() < now.getTime() - 86_400_000 }))
}
