/**
 * Camada de dados do HZK Dock (ADR 0023). Duas implementações da mesma interface:
 *  - supabase-api.ts: o app de verdade. Lê pelas tabelas (a RLS da 0027 decide o que volta) e
 *    escreve SÓ pelas funções office_* / dock_* (o navegador não escreve direto em tabela nenhuma).
 *  - sandbox-api.ts: modo demonstração (NEXT_PUBLIC_SANDBOX=1), tudo no navegador, para testar telas.
 */
import type { AccessLevel, AvatarColor, AvatarStyle, DockData } from "@/lib/domain/dock"

export interface NewAgent {
  name: string
  title: string
  instructions: string
  connectionId: string | null
  model: string | null
  canCreateAgents?: boolean
}
export interface AgentPatch extends NewAgent {
  description?: string
  backupModels: { connectionId: string; model: string }[]
  capabilities?: string[]
  effort?: string
  parentAgentId?: string | null
}
export interface NewConnection {
  kind: "local" | "chave" | "compativel"
  provider: string
  label: string
  endpoint?: string | null
  termsVersion?: string | null
}
export interface NewProposal {
  areaId: string
  skillId: string | null
  sourceSkillId?: string | null
  name: string
  description?: string
  label: string
  whatChanged: string
  why: string
  body: string
  minLevel: number
}
export interface NewRoutine {
  id?: string | null
  agentId: string
  title: string
  prompt: string
  kind: "diaria" | "semanal" | "mensal"
  time: string
  weekday?: number | null
  monthday?: number | null
}

export interface DockApi {
  readonly mode: "supabase" | "sandbox"
  load(): Promise<DockData>
  /** Avisa quando algo mudou no banco (tempo real). Devolve a função de desligar. */
  subscribe(onChange: () => void): () => void

  acceptConsent(): Promise<void>
  createAgent(a: NewAgent): Promise<string>
  createAgentFromKit(kitBotId: string, name?: string): Promise<string>
  updateAgent(id: string, a: AgentPatch): Promise<void>
  setAccess(id: string, level: AccessLevel): Promise<void>
  setAvatar(id: string, style: AvatarStyle | null, color: AvatarColor | null, glyph: string | null): Promise<void>
  setPaused(id: string, paused: boolean): Promise<void>

  saveConnection(c: NewConnection): Promise<string>
  setConnectionEnabled(id: string, enabled: boolean): Promise<void>
  /** Liga ou desliga o motor na nuvem para os bots desta pessoa (ADR 0026). */
  setCloudEngine(on: boolean): Promise<void>

  openThread(kind: "direta" | "canal", agentIds: string[], title?: string, lead?: string | null): Promise<string>
  sendMessage(threadId: string, body: string, mentions: string[], idempotencyKey: string): Promise<void>
  setThreadModel(threadId: string, agentId: string, connectionId: string | null, model?: string | null): Promise<void>
  continueWith(threadId: string, agentId: string, idempotencyKey: string): Promise<string>

  installSkill(agentId: string, skillId: string, pin?: number | null): Promise<void>
  uninstallSkill(agentId: string, skillId: string): Promise<void>
  ackSkillUpdate(agentId: string, skillId: string, mode: "atualizar" | "fixar"): Promise<void>
  savePersonalSkill(s: { name: string; description: string; body: string }): Promise<string>
  proposeSkill(p: NewProposal): Promise<string>
  decideProposal(id: string, approve: boolean, note?: string): Promise<void>

  installConnector(agentId: string, connectorId: string, readOnly: boolean): Promise<void>
  uninstallConnector(agentId: string, connectorId: string): Promise<void>
  setGrant(agentId: string, connectorId: string, actionKey: string, on: boolean): Promise<void>
  requestConnector(name: string, url: string | null, why: string): Promise<void>
  decideRequest(id: string, accept: boolean, note?: string): Promise<void>

  decideApproval(id: string, approve: boolean, draft?: Record<string, unknown> | null, always?: boolean): Promise<void>

  saveRoutine(r: NewRoutine): Promise<string>
  setRoutineEnabled(id: string, enabled: boolean): Promise<void>
}

/** Erros do banco (códigos office_* / dock_*) em português de gente. */
const ERRORS: Record<string, string> = {
  office_consent_required: "Aceite o termo do Dock antes de começar.",
  office_level_not_released: "Os níveis 2 e 3 chegam com a área isolada do Windows.",
  office_kind_not_released: "Programas de agente (ACP) chegam na segunda leva.",
  office_kind_not_offered: "Assinatura não tem botão nesta fase.",
  office_terms_required: "Aceite o aviso do provedor personalizado.",
  office_skill_level: "Este bot não tem o nível que a skill pede.",
  office_connector_level: "Este bot não tem o nível que o app pede.",
  office_connector_not_installed: "Instale o app neste bot (fora do só leitura) primeiro.",
  office_grant_only_class_c: "\"Sempre permitir\" vale só para ações de classe C pedidas por você.",
  office_limit_agents: "Limite de 20 bots.",
  office_limit_depth: "O organograma vai até 3 níveis.",
  office_limit_connections: "Limite de 30 conexões de IA.",
  office_limit_skills: "Limite de skills neste bot.",
  office_limit_connectors: "Limite de apps neste bot.",
  office_limit_routines: "Limite de 20 rotinas.",
  office_approval_closed: "Esta aprovação já foi decidida.",
  office_approval_expired: "Esta aprovação venceu (7 dias).",
  office_needs_founder: "Ação com dinheiro: só um founder aprova.",
  office_invalid_schedule: "Horário da rotina incompleto.",
  dock_use_proposal: "Mudança em skill da área vai como proposta para o responsável.",
  dock_scripts_not_released: "Skill com script chega com a área isolada do Windows.",
  dock_signal_looks_personal: "O texto parece ter dado pessoal (e-mail, link ou número). Deixe só o padrão.",
  dock_proposal_stale: "A skill mudou desde a proposta: refaça em cima da versão atual.",
  dock_founder_only: "Só os founders fazem isso.",
  dock_area_not_allowed: "Você não tem acesso a esta área.",
  dock_limit_requests: "Você já tem muitos pedidos abertos.",
  dock_limit_proposals: "Você já tem muitas propostas abertas.",
}
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e)
  const code = msg.match(/(?:office|dock)_[a-z_0-9]+/)?.[0]
  return (code && ERRORS[code]) || (code ? `Não deu certo (${code}).` : "Não deu certo. Tente de novo.")
}
