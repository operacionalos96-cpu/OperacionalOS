/**
 * AI Office — agentes, eventos do negócio, aprendizados e hipóteses.
 * Regras puras (testadas em ai-office.test.ts). Nada aqui chama IA: agentes são
 * cadastro + status; quem executa (GPT, Claude, Gemini…) virá por MCP/webhooks,
 * e `preferredModel` é só uma preferência trocável.
 */

// ---------- agentes ----------

export type AgentStatus = "idle" | "working" | "waiting" | "error" | "disabled"

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  status: AgentStatus
  currentTask?: string
  lastActivity?: string
  capabilities: string[]
  /** O que o agente PODE fazer no sistema (ferramentas/MCP). Nada muda regra sem humano. */
  permissions: string[]
  /** Texto livre ("GPT", "Claude", "Gemini"…). Trocar não muda o agente. */
  preferredModel?: string
  createdAt: string
  updatedAt?: string
}

export const AGENT_STATUS: Record<AgentStatus, { label: string; tone: "muted" | "brand" | "warning" | "danger" }> = {
  idle: { label: "Parado", tone: "muted" },
  working: { label: "Trabalhando", tone: "brand" },
  waiting: { label: "Aguardando", tone: "warning" },
  error: { label: "Erro", tone: "danger" },
  disabled: { label: "Desligado", tone: "muted" },
}

/** Os 4 funcionários iniciais (ids fixos: criar de novo não duplica). */
export function defaultAgents(now: string): Agent[] {
  const base = { status: "idle" as const, createdAt: now }
  return [
    {
      ...base,
      id: "prospector",
      name: "Prospector",
      role: "Encontrar empresas para prospecção",
      description: "Busca empresas do nicho/cidade com site ruim, antigo ou sem site, e cadastra como lead pendente de revisão.",
      capabilities: ["buscar empresas", "cadastrar lead"],
      permissions: ["search_leads", "create_lead"],
      preferredModel: "Claude",
    },
    {
      ...base,
      id: "web-analyst",
      name: "Web Analyst",
      role: "Analisar sites e registrar problemas/oportunidades",
      description: "Avalia o site de cada lead (mobile, velocidade, visual, conversão) e grava nota, problemas e oportunidade na análise.",
      capabilities: ["analisar site", "dar nota", "listar problemas"],
      permissions: ["get_lead", "add_analysis"],
      preferredModel: "GPT",
    },
    {
      ...base,
      id: "intelligence",
      name: "Intelligence Agent",
      role: "Achar padrões nas decisões e resultados",
      description: "Compara o que a análise previu com o que vocês decidiram (aprovar/descartar), respostas e vendas, e propõe hipóteses.",
      capabilities: ["comparar decisões", "achar padrões", "propor hipóteses"],
      permissions: ["get_approved_leads", "get_rejected_leads", "get_conversion_data", "get_feedback", "create_hypothesis"],
      preferredModel: "Claude",
    },
    {
      ...base,
      id: "video-studio",
      name: "Video Studio",
      role: "Gerar o vídeo de análise de cada lead que chega nessa parte do funil",
      description: "Abre o site real do lead, tira os prints, mede problemas que dá para provar na página e renderiza o vídeo personalizado. Uma pessoa aprova antes de enviar.",
      capabilities: ["print do site", "detectar problemas visíveis", "renderizar vídeo"],
      permissions: ["get_job_context", "create_upload_urls", "complete_job"],
      preferredModel: "Worker local (sem IA)",
    },
    {
      ...base,
      id: "knowledge-manager",
      name: "Knowledge Manager",
      role: "Transformar aprendizados em conhecimento",
      description: "Organiza aprendizados validados em conhecimento estruturado para sincronizar com o Obsidian.",
      capabilities: ["organizar aprendizados", "escrever notas"],
      permissions: ["search_learnings", "search_hypotheses", "add_learning"],
      preferredModel: "Gemini",
    },
  ]
}

// ---------- eventos do negócio ----------

export const EVENT_TYPES = [
  "lead.created",
  "lead.analyzed",
  "lead.approved",
  "lead.rejected",
  "lead.contacted",
  "lead.replied",
  "lead.interested",
  "lead.proposal",
  "lead.converted",
  "lead.lost",
  "lead.followup_sent",
  "agent.started",
  "agent.completed",
  "agent.failed",
  "learning.created",
  "hypothesis.created",
  "member.invited",
] as const

export type BusinessEventType = (typeof EVENT_TYPES)[number]
export type ActorType = "human" | "agent" | "system"

export interface BusinessEvent {
  id: string
  event_type: BusinessEventType
  entity_type: string
  entity_id: string
  actor_type: ActorType
  actor_id: string
  metadata: Record<string, unknown>
  created_at: string
  /** Mesma história (ex.: "lead:<id>" do cadastro à venda). */
  correlation_id?: string | null
  /** Qual evento/job causou este. */
  causation_id?: string | null
}

export interface EventInput {
  type: BusinessEventType
  entity: { type: string; id: string }
  actor: { type: ActorType; id: string }
  metadata?: Record<string, unknown>
  correlationId?: string
  causationId?: string
}

/** Correlação padrão: toda a história de um lead compartilha "lead:<id>". */
export const correlationFor = (entity: { type: string; id: string }) => (entity.type === "lead" ? `lead:${entity.id}` : undefined)

export function makeEvent(input: EventInput, id: string, now: string): BusinessEvent {
  return {
    id,
    event_type: input.type,
    entity_type: input.entity.type,
    entity_id: input.entity.id,
    actor_type: input.actor.type,
    actor_id: input.actor.id,
    metadata: input.metadata ?? {},
    created_at: now,
    correlation_id: input.correlationId ?? correlationFor(input.entity) ?? null,
    causation_id: input.causationId ?? null,
  }
}

const VERB: Record<BusinessEventType, string> = {
  "lead.created": "cadastrado",
  "lead.analyzed": "analisado",
  "lead.approved": "aprovado",
  "lead.rejected": "descartado",
  "lead.contacted": "primeiro contato realizado",
  "lead.replied": "respondeu",
  "lead.interested": "demonstrou interesse",
  "lead.proposal": "recebeu proposta",
  "lead.converted": "virou cliente",
  "lead.lost": "perdido",
  "lead.followup_sent": "recebeu mensagem do funil",
  "agent.started": "começou",
  "agent.completed": "concluiu",
  "agent.failed": "falhou",
  "learning.created": "novo aprendizado",
  "hypothesis.created": "nova hipótese",
  "member.invited": "convidado para a equipe",
}

/** Frase do feed: "Lead Costa Lion aprovado", "Web Analyst concluiu análise". */
export function describeEvent(e: Pick<BusinessEvent, "event_type" | "entity_id" | "metadata">, name?: string): string {
  const label = name || (typeof e.metadata.name === "string" ? e.metadata.name : "") || `#${e.entity_id.slice(0, 6)}`
  const extra = typeof e.metadata.task === "string" ? ` ${e.metadata.task}` : typeof e.metadata.reasonLabel === "string" ? ` · ${e.metadata.reasonLabel}` : ""
  if (e.event_type.startsWith("agent.")) return `${label} ${VERB[e.event_type]}${extra}`
  if (e.event_type === "learning.created" || e.event_type === "hypothesis.created") return `${VERB[e.event_type]}: ${label}`
  if (e.event_type === "member.invited") return `${label} ${VERB[e.event_type]}`
  return `Lead ${label} ${VERB[e.event_type]}${extra}`
}

// ---------- aprendizados e hipóteses ----------

export interface Learning {
  id: string
  title: string
  description: string
  category: string
  /** Evidências (ids de leads/eventos, números…). */
  evidence: string
  /** 0–1 */
  confidence: number
  status: "draft" | "active" | "archived"
  createdBy: string
  createdAt: string
  updatedAt?: string
}

export type HypothesisStatus = "proposed" | "approved" | "testing" | "validated" | "rejected"

export interface Hypothesis {
  id: string
  title: string
  description: string
  evidence: string
  confidence: number
  proposedTest: string
  status: HypothesisStatus
  createdBy: string
  createdAt: string
  /** Quem aprovou/validou/rejeitou (sempre humano). */
  decidedBy?: string
  decidedAt?: string
  updatedAt?: string
}

export const HYPOTHESIS_STATUS: Record<HypothesisStatus, string> = {
  proposed: "Proposta",
  approved: "Aprovada",
  testing: "Em teste",
  validated: "Validada",
  rejected: "Rejeitada",
}

/**
 * Próximos status permitidos. Toda mudança é feita por HUMANO (decidedBy);
 * hipótese nunca muda regra de prospecção sozinha.
 */
export const HYPOTHESIS_NEXT: Record<HypothesisStatus, HypothesisStatus[]> = {
  proposed: ["approved", "rejected"],
  approved: ["testing", "rejected"],
  testing: ["validated", "rejected"],
  validated: [],
  rejected: [],
}

export function moveHypothesis(h: Hypothesis, to: HypothesisStatus, by: string, at: string): Hypothesis | null {
  if (!HYPOTHESIS_NEXT[h.status].includes(to)) return null
  return { ...h, status: to, decidedBy: by, decidedAt: at }
}
