import "server-only"
import { funnelOf, nextStep } from "@/lib/domain/funnel"
import type { Lead } from "@/lib/domain/types"
import { FREE_REPLY, agentPlan, agentSentPatch, buildReplyPrompt, isOptOut, mergeAgentSettings, needsHumanPatch, parseAgentReply, releasePatch, unanswered, type AgentReply, type ChatMessage } from "@/lib/domain/whatsapp-agent"
import { AiError, aiConfigured, generateJson } from "./ai"
import { rateHit } from "./rate-limit"
import { FunnelError, allLeads, getLead, loadFunnel, log, saveLead, stopFunnel, view } from "./whatsapp-funnel"
import { supabaseAdmin } from "./supabase-admin"

/**
 * Agente do WhatsApp no servidor (ADR 0018). A extensão pergunta "o que faço agora?" (agenda),
 * executa no WhatsApp Web e registra aqui. Ritmo, limites e regras ficam no servidor
 * (src/lib/domain/whatsapp-agent.ts); a extensão nunca decide sozinha quem recebe o quê.
 */
export async function loadAgentSettings() {
  const { data } = await supabaseAdmin().from("ai_settings").select("data").eq("id", "whatsapp_agent").maybeSingle()
  return mergeAgentSettings(data?.data)
}

export async function saveAgentSettings(raw: unknown, by: string) {
  const data = mergeAgentSettings(raw)
  const { error } = await supabaseAdmin().from("ai_settings").upsert({ id: "whatsapp_agent", data, updated_at: new Date().toISOString(), updated_by: by })
  if (error) throw error
  return data
}

/** Próxima ação do agente para os leads do dono do token (o WhatsApp daquele PC). */
export async function agentAgenda(ownerId: string) {
  const [s, steps, leads] = await Promise.all([loadAgentSettings(), loadFunnel(), allLeads()])
  const now = new Date()
  const plan = agentPlan(leads, steps, s, now, ownerId)
  if (plan.state !== "agir" || !plan.action) return plan
  const l = leads.find((x) => x.id === plan.action!.leadId)!
  return { ...plan, lead: { id: l.id, name: l.name, contact: l.contact ?? null }, view: await view(l, steps, now) }
}

/**
 * O lead respondeu: decide o que fazer. Pedido para parar é decidido sem IA; o resto a IA classifica
 * e a resposta passa pela validação (parseAgentReply). Não envia nada: a extensão envia e registra.
 */
export async function agentReply(leadId: string, messages: ChatMessage[], actorId: string): Promise<AgentReply & { view: Awaited<ReturnType<typeof view>> }> {
  const [s, steps, l] = await Promise.all([loadAgentSettings(), loadFunnel(), getLead(leadId)])
  if (!s.enabled) throw new FunnelError("agente desligado", 409)
  if (l.agent?.needsHuman) throw new FunnelError("este lead está com um humano", 409)
  const pending = unanswered(messages)
  // Consta que ele respondeu, mas a conversa não mostra: melhor um humano olhar do que o agente ficar tentando.
  if (!pending.length) return { action: "humano", intent: "resposta não encontrada", reason: "não achei a resposta dele na conversa", view: await handOff(l, actorId, "não achei a resposta dele na conversa") }
  const now = new Date()
  if (pending.some((m) => isOptOut(m.text))) return { action: "parar", intent: "pediu para parar", reason: "pedido explícito", view: await stop(l, actorId, "pediu para parar") }
  // Áudio, foto ou vídeo do lead: a IA não ouve nem vê; um humano assume.
  if (pending.some((m) => m.kind !== "texto")) return { action: "humano", intent: `mandou ${pending.find((m) => m.kind !== "texto")!.kind}`, reason: "mensagem que não é texto", view: await handOff(l, actorId, "mandou áudio/vídeo/imagem") }
  if (!aiConfigured()) throw new FunnelError("IA não configurada", 503)
  if (!(await rateHit(`agente:min:${actorId}`, 8, 60)) || !(await rateHit(`agente:dia:${actorId}`, 400, 86_400))) throw new FunnelError("muitas respostas seguidas — espere um minuto", 429)
  let r: AgentReply
  try {
    r = parseAgentReply(await generateJson(buildReplyPrompt({ lead: l, steps, s, messages, now }), { temperature: 0.3 }), { offer: s.offer, hasNext: !!nextStep(l, steps, now) })
  } catch (e) {
    if (e instanceof AiError) throw new FunnelError(e.message, e.status === 429 ? 429 : 503)
    throw e
  }
  if (r.action === "parar") return { ...r, view: await stop(l, actorId, r.reason || r.intent) }
  if (r.action === "humano") return { ...r, view: await handOff(l, actorId, r.reason || r.intent) }
  return { ...r, view: await view(l, steps, now) }
}

async function stop(l: Lead, actorId: string, why: string) {
  await log(l, actorId, `Agente tirou do funil: ${why}`, null, {})
  return stopFunnel(l.id, actorId)
}

/** A extensão não conseguiu executar (conversa não abriu, falta arquivo, botão não apareceu): passa para um humano. */
export async function agentHandOff(leadId: string, reason: string, actorId: string) {
  return handOff(await getLead(leadId), actorId, reason.slice(0, 200) || "o agente não conseguiu enviar")
}

async function handOff(l: Lead, actorId: string, reason: string) {
  const next: Lead = { ...l, agent: needsHumanPatch(l, reason, new Date().toISOString()) }
  await saveLead(next)
  await log(next, actorId, `Agente pediu um humano: ${reason}`, null, { agent: true })
  return view(next, await loadFunnel(), new Date())
}

/** A extensão enviou a resposta escrita pela IA (não é passo do funil: o passo não anda). */
export async function agentFreeSent(leadId: string, text: string, actorId: string) {
  const body = text.trim().slice(0, 700)
  if (!body) throw new FunnelError("mensagem vazia")
  const [steps, l] = await Promise.all([loadFunnel(), getLead(leadId)])
  const at = new Date().toISOString()
  const next: Lead = { ...l, funnel: { ...funnelOf(l), lastSentAt: at }, agent: agentSentPatch(l, FREE_REPLY, at), lastActivityAt: at }
  await saveLead(next)
  await log(next, actorId, `Agente respondeu (WhatsApp): ${body}`, "lead.followup_sent", { agent: true, free: true, channel: "whatsapp" })
  return view(next, steps, new Date())
}

/** Um humano assumiu e devolveu o lead para o agente. */
export async function releaseToAgent(leadId: string, actorId: string) {
  const l = await getLead(leadId)
  const next: Lead = { ...l, agent: releasePatch(l) }
  await saveLead(next)
  await log(next, actorId, "Devolvido para o agente do WhatsApp", null, {})
  return next
}
