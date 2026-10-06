"use client"

import { defaultAgents, type Agent, type Hypothesis, type HypothesisStatus, type Learning } from "@/lib/domain/ai-office"
import { leadMatches } from "@/lib/domain/contact"
import { funnelOf, repliedPatch, sentPatch, type FunnelStep } from "@/lib/domain/funnel"
import { approvePatch, contactedPatch, conversionData, feedbackRows, isDiscarded, prospectQueue, rejectPatch, rejectionLabel, reviewStatus, type RejectionReason } from "@/lib/domain/prospecting"
import { moveHypothesis } from "@/lib/domain/ai-office"
import type { Lead, LeadAnalysis } from "@/lib/domain/types"
import { recordEvent } from "@/lib/event-service"
import { uid } from "@/lib/format"
import { useAgents, useHypotheses, useLearnings } from "@/lib/modules"
import { useStore } from "@/lib/store"

/**
 * Camada de serviços do AI Office. As telas usam ESTAS funções (nada de regra de
 * negócio dentro de componente) e, no futuro, um servidor MCP/webhook expõe as
 * mesmas como ferramentas, com os mesmos nomes:
 *
 *   leitura:  search_leads, get_lead, get_next_lead, get_approved_leads, get_rejected_leads,
 *             get_conversion_data, get_feedback, get_agent_status, search_learnings, search_hypotheses
 *   escrita:  create_lead*, update_lead*, add_analysis, add_learning, create_hypothesis,
 *             approve_lead, reject_lead, confirm_contact            (*hoje pela store/importação)
 *
 * Toda escrita registra um evento (recordEvent) — histórico para aprendizado.
 */

const leads = () => useStore.getState().leads
const me = () => useStore.getState().meId
const human = () => ({ type: "human" as const, id: me() })
const now = () => new Date().toISOString()
const lead = (id: string) => leads().find((l) => l.id === id)

// ---------- leitura ----------

export const tools = {
  search_leads: (query: string, opts: { includeDiscarded?: boolean } = {}) => leads().filter((l) => (opts.includeDiscarded || !isDiscarded(l)) && leadMatches(l, query)),
  get_lead: (id: string) => lead(id),
  /** Próximo da fila de revisão (do responsável, por padrão quem está logado). */
  get_next_lead: (ownerId: string | undefined = me()) => prospectQueue(leads(), ownerId)[0],
  get_approved_leads: () => leads().filter((l) => reviewStatus(l) === "approved"),
  get_rejected_leads: () => leads().filter((l) => reviewStatus(l) === "rejected"),
  get_conversion_data: () => conversionData(leads()),
  get_feedback: () => feedbackRows(leads()),
  get_agent_status: () => useAgents.getState().items.map(({ id, name, status, currentTask, lastActivity, preferredModel }) => ({ id, name, status, currentTask, lastActivity, preferredModel })),
  search_learnings: (q = "") => useLearnings.getState().items.filter((x) => `${x.title} ${x.description} ${x.category}`.toLowerCase().includes(q.toLowerCase())),
  search_hypotheses: (q = "") => useHypotheses.getState().items.filter((x) => `${x.title} ${x.description}`.toLowerCase().includes(q.toLowerCase())),
}

// ---------- escrita (decisão humana) ----------

export function approveLead(id: string) {
  const l = lead(id)
  if (!l) return
  useStore.getState().updateLead(id, approvePatch(l, me(), now()))
  recordEvent({ type: "lead.approved", entity: { type: "lead", id }, actor: human(), metadata: snapshot(l) })
}

export function rejectLead(id: string, reason: RejectionReason, notes?: string) {
  const l = lead(id)
  if (!l) return
  const patch = rejectPatch(l, me(), now(), reason, notes)
  useStore.getState().updateLead(id, patch)
  useStore.getState().logInteraction(id, "nota", `Descartado na revisão: ${rejectionLabel(reason)}${notes?.trim() ? ` — ${notes.trim()}` : ""}`)
  recordEvent({
    type: "lead.rejected",
    entity: { type: "lead", id },
    actor: human(),
    metadata: { ...snapshot(l), reason, reasonLabel: rejectionLabel(reason), notes: patch.review?.rejectionNotes },
  })
}

/** Desfaz uma decisão (volta para pendente). O evento original continua no histórico. */
export function undoReview(id: string, previous: Lead["review"]) {
  useStore.getState().updateLead(id, { review: previous ?? { status: "pending" } })
}

/** Humano confirmou que ENVIOU a mensagem (abrir o WhatsApp não conta). */
export function confirmContact(id: string, message: string, channel: Lead["firstContactChannel"] = "whatsapp") {
  const l = lead(id)
  if (!l) return
  const patch = contactedPatch(l, message, now(), channel)
  // 1ª mensagem = passo 0 do funil de WhatsApp.
  const funnel = channel === "whatsapp" ? sentPatch(l, 0, patch.firstContactAt, me()) : l.funnel
  useStore.getState().updateLead(id, { ...patch, funnel, lastActivityAt: patch.firstContactAt })
  useStore.getState().logInteraction(id, "mensagem", `Primeiro contato (${channel}): ${message}`)
  recordEvent({ type: "lead.contacted", entity: { type: "lead", id }, actor: human(), metadata: { ...snapshot(l), channel, message } })
}

export function markReplied(id: string) {
  const l = lead(id)
  if (!l) return
  useStore.getState().updateLead(id, { funnel: repliedPatch(l, now()) })
  useStore.getState().logInteraction(id, "mensagem", "Respondeu no WhatsApp")
  recordEvent({ type: "lead.replied", entity: { type: "lead", id }, actor: human(), metadata: snapshot(l) })
}

/** Passo do funil enviado pela pessoa (o 1º usa confirmContact). */
export function funnelSent(id: string, index: number, step: FunnelStep, text: string) {
  const l = lead(id)
  if (!l) return
  if (index === 0) return confirmContact(id, text)
  const at = now()
  useStore.getState().updateLead(id, { funnel: sentPatch(l, index, at, me()), lastActivityAt: at })
  useStore.getState().logInteraction(id, "mensagem", `Funil · ${step.label} (WhatsApp): ${text || (step.kind === "audio" ? "(áudio enviado)" : step.kind === "video" ? "(vídeo enviado)" : "")}`)
  recordEvent({ type: "lead.followup_sent", entity: { type: "lead", id }, actor: human(), metadata: { ...snapshot(l), step: index, kind: step.kind, label: step.label, channel: "whatsapp" } })
}

/** Tira o lead do funil (não quer, pediu para parar…). */
export function stopFunnel(id: string) {
  const l = lead(id)
  if (!l) return
  useStore.getState().updateLead(id, { funnel: { ...funnelOf(l), stopped: true } })
  useStore.getState().logInteraction(id, "mensagem", "Saiu do funil de WhatsApp")
}

/** Análise vinda de um agente ou da planilha. Guarda junto quem analisou. */
export function addAnalysis(id: string, analysis: LeadAnalysis, actor: { type: "agent" | "system" | "human"; id: string }) {
  const l = lead(id)
  if (!l) return
  const a = { ...analysis, analyzedAt: now(), analyzedBy: actor.id }
  useStore.getState().updateLead(id, { analysis: a })
  recordEvent({ type: "lead.analyzed", entity: { type: "lead", id }, actor, metadata: { name: l.name, ...a } })
}

/** O que vai junto em todo evento de lead: o suficiente para aprender sem ter que reconsultar. */
function snapshot(l: Lead) {
  return {
    name: l.name,
    segment: l.segment,
    city: l.city,
    source: l.source,
    siteScore: l.analysis?.siteScore,
    qualificationScore: l.analysis?.qualificationScore,
    problems: l.analysis?.problems,
  }
}

// ---------- agentes, aprendizados, hipóteses ----------

/** Garante os 4 funcionários (ids fixos: rodar de novo não duplica). */
export function ensureDefaultAgents() {
  const s = useAgents.getState()
  if (!s.loaded) return
  for (const a of defaultAgents(now())) if (!s.items.some((x) => x.id === a.id)) s.save(a)
}

export function updateAgent(id: string, patch: Partial<Agent>) {
  useAgents.getState().patch(id, patch)
}

export function addLearning(input: Pick<Learning, "title" | "description" | "category" | "evidence" | "confidence">, by: { type: "human" | "agent"; id: string } = human()) {
  const l: Learning = { id: uid(), status: "draft", createdBy: by.id, createdAt: now(), ...input }
  useLearnings.getState().save(l)
  recordEvent({ type: "learning.created", entity: { type: "learning", id: l.id }, actor: by, metadata: { name: l.title, category: l.category } })
  return l
}

export function createHypothesis(
  input: Pick<Hypothesis, "title" | "description" | "evidence" | "confidence" | "proposedTest">,
  by: { type: "human" | "agent"; id: string } = human(),
) {
  const h: Hypothesis = { id: uid(), status: "proposed", createdBy: by.id, createdAt: now(), ...input }
  useHypotheses.getState().save(h)
  recordEvent({ type: "hypothesis.created", entity: { type: "hypothesis", id: h.id }, actor: by, metadata: { name: h.title } })
  return h
}

/** Só HUMANO move hipótese (aprovar, testar, validar, rejeitar). Nada muda regra sozinho. */
export function decideHypothesis(id: string, to: HypothesisStatus) {
  const h = useHypotheses.getState().items.find((x) => x.id === id)
  const next = h && moveHypothesis(h, to, me(), now())
  if (next) useHypotheses.getState().save(next)
  return !!next
}
