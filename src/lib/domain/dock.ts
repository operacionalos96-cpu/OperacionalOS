/**
 * HZK Dock v3 (ADR 0023, migration 0027): tipos e regras puras da tela.
 *
 * O banco é quem garante as travas (funções office_* e dock_*). Estas funções repetem as mesmas
 * regras só para a tela avisar ANTES de tentar ("pede nível 1", "só classe C"…). Se uma mudar no
 * banco, muda aqui junto. Testadas em dock.test.ts.
 */
import type { AgentState } from "./office"

/* ---------- primeira leva (decisão do Gabriel, 14/11/2026) ---------- */
/** Mesmos números de private.office_limit na 0027. */
export const DOCK_RELEASE = { maxLevel: 1, acp: false, scripts: false } as const

export type AccessLevel = 0 | 1 | 2 | 3
export const LEVELS: { n: AccessLevel; title: string; text: string }[] = [
  { n: 0, title: "Só conversa", text: "pesquisa e escreve; não toca no seu PC" },
  { n: 1, title: "Pastas", text: "lê e escreve só nas pastas que você liberar" },
  { n: 2, title: "Programas", text: "também roda comandos dentro dessas pastas" },
  { n: 3, title: "PC inteiro", text: "mouse, teclado e o seu navegador" },
]
export const levelReleased = (n: number) => n >= 0 && n <= DOCK_RELEASE.maxLevel
export const LOCKED_LEVEL_REASON = "Chega com a área isolada do Windows (decisão de 14/11/2026)."

/* ---------- avatar ---------- */
export type AvatarStyle = "constelacao" | "saturno" | "halo"
export type AvatarColor = "grafite" | "aco" | "musgo" | "areia" | "vinho" | "lilas"
export const AVATAR_STYLES: { id: AvatarStyle; label: string }[] = [
  { id: "constelacao", label: "Astro" },
  { id: "saturno", label: "Módulo" },
  { id: "halo", label: "Visor" },
]
/** Paleta curta, sem laranja: o laranja é só para "precisa de você" (nota 34). */
export const AVATAR_COLORS: { id: AvatarColor; label: string; hex: string }[] = [
  { id: "grafite", label: "Ciano", hex: "#0fb5e0" },
  { id: "aco", label: "Azul", hex: "#2f6bff" },
  { id: "musgo", label: "Verde", hex: "#12c97a" },
  { id: "areia", label: "Amarelo", hex: "#ffc21a" },
  { id: "vinho", label: "Rosa", hex: "#ff4d8d" },
  { id: "lilas", label: "Violeta", hex: "#8b5cf6" },
]
export const AVATAR_ICONS = ["lupa", "codigo", "barras"] as const
/**
 * Formato dos olhos do avatar com rosto. Fica no mesmo campo do banco que guardava a letra ou o ícone
 * (avatar_glyph aceita nomes assim); letra e ícone antigos caem na cápsula.
 */
export const AVATAR_EYES = [
  { id: "capsula", label: "Cápsula" },
  { id: "ponto", label: "Ponto" },
  { id: "largo", label: "Largo" },
] as const
export type AvatarEyesId = (typeof AVATAR_EYES)[number]["id"]
export const avatarEyes = (glyph: string): AvatarEyesId => (AVATAR_EYES.some((e) => e.id === glyph) ? (glyph as AvatarEyesId) : "capsula")
/** Glifo do avatar: '' = primeira letra do nome; 1 caractere = letra; senão, ícone. */
export function avatarGlyph(name: string, glyph: string) {
  if (glyph && glyph.length > 1) return glyph
  return (glyph || name.trim()[0] || "?").toUpperCase()
}

/* ---------- dados (como a RLS devolve, já em camelCase) ---------- */
export interface DockAgent {
  id: string
  name: string
  title: string
  description: string
  instructions: string
  parentAgentId: string | null
  connectionId: string | null
  model: string | null
  backupModels: { connectionId: string; model: string }[]
  capabilities: string[]
  effort: string
  paused: boolean
  canCreateAgents: boolean
  accessLevel: AccessLevel
  avatarStyle: AvatarStyle
  avatarColor: AvatarColor
  avatarGlyph: string
  origin: "do_zero" | "modelo_pessoal" | "modelo_area" | "proposto_por_bot"
  pcPending: "lote" | "bloqueio" | null
}
export type ConnectionKind = "local" | "chave" | "assinatura" | "acp" | "compativel"
export interface DockConnection {
  id: string
  kind: ConnectionKind
  provider: string
  label: string
  status: "pendente" | "conectada" | "sem_cota" | "erro" | "desligada"
  models: string[]
  quotaResetsAt: string | null
  endpoint: string | null
}
export interface DockThread {
  id: string
  kind: "direta" | "canal"
  title: string
  agentIds: string[]
  leadAgentId: string
  archived: boolean
  continuedFromThreadId: string | null
  createdAt: string
}
export interface DockMessage {
  id: string
  threadId: string
  authorType: "human" | "agent" | "system"
  authorId: string
  kind: "texto" | "relatorio" | "progresso" | "aviso"
  body: string
  report: { result?: string; evidence?: string; unblock?: string; status?: string } | null
  provider: string | null
  model: string | null
  connectionId: string | null
  fallbackFrom: string | null
  fallbackReason: string | null
  createdAt: string
}
export interface DockThreadModel { threadId: string; agentId: string; connectionId: string; model: string | null }
export interface DockSkill {
  id: string
  scope: "area" | "pessoal"
  areaId: string | null
  name: string
  description: string
  inKit: boolean
  currentVersion: number
  archived: boolean
  createdBy: string
}
export interface DockSkillVersion {
  skillId: string
  version: number
  label: string
  whatChanged: string
  minLevel: number
  requiredConnectors: string[]
  hasScripts: boolean
  examples: string[]
  publishedAt: string
  approvedBy: string | null
}
export interface DockAgentSkill { agentId: string; skillId: string; pinnedVersion: number | null; seenVersion: number }
export interface DockProposal {
  id: string
  areaId: string
  skillId: string | null
  name: string
  label: string
  whatChanged: string
  why: string
  baseVersion: number | null
  minLevel: number
  signalCount: number
  status: "aberta" | "aprovada" | "recusada" | "retirada"
  proposedBy: string
  proposedAt: string
}
export type ActionClass = "A" | "B" | "C" | "D"
export interface DockConnector {
  id: string
  name: string
  category: "programacao" | "design" | "dados" | "produtividade" | "pesquisa" | "automacoes"
  description: string
  note: string
  runsAt: "pc" | "empresa"
  minLevel: number
  wave: number
  status: "rascunho" | "aprovado" | "suspenso"
  sourceUrl: string | null
  approvedBy: string | null
  approvedAt: string | null
}
export interface DockConnectorAction {
  connectorId: string
  actionKey: string
  label: string
  actionClass: ActionClass
  maxItems: number
  sendsOutside: boolean
  money: boolean
  enabled: boolean
}
export interface DockAgentConnector { agentId: string; connectorId: string; readOnly: boolean; status: string }
export interface DockGrant { agentId: string; connectorId: string; actionKey: string; expiresAt: string | null }
export interface DockApproval {
  id: string
  agentId: string
  threadId: string | null
  connectorId: string
  actionKey: string
  actionClass: "C" | "D"
  gate: "lote" | "bloqueio"
  approver: "dono" | "founder"
  origin: "humano" | "rotina" | "bot" | "externo"
  originDetail: string
  /** o que a ação é, pelo catálogo (não pela IA) */
  actionLabel: string
  /** descrição escrita pelo bot */
  title: string
  summary: string
  /** dinheiro: precisa do dono E de um founder */
  ownerOkAt: string | null
  founderOkAt: string | null
  draft: Record<string, unknown>
  itemCount: number
  status: "pendente" | "aprovada" | "recusada" | "executando" | "executada" | "falhou" | "cancelada"
  createdAt: string
  expiresAt: string
  decidedAt: string | null
  resultSummary: string | null
}
export interface DockRequest { id: string; name: string; url: string | null; why: string; requestedBy: string; requestedAt: string; status: "aberto" | "aceito" | "recusado" }
export interface DockKitBot { id: string; areaId: string; name: string; title: string; suggestedLevel: number; skillIds: string[]; avatarColor: AvatarColor; avatarGlyph: string }
export interface DockRoutine {
  id: string
  agentId: string
  title: string
  prompt: string
  kind: "diaria" | "semanal" | "mensal"
  timeLocal: string
  weekday: number | null
  monthday: number | null
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
}
export interface DockUsage { agentId: string; connectionId: string | null; provider: string; model: string; free: boolean; costUsd: number | null; fallbackFrom: string | null; createdAt: string }
export interface DockBridge { online: boolean; lastSeenAt: string | null; name: string | null }

export interface DockData {
  consent: boolean
  suspended: boolean
  agents: DockAgent[]
  connections: DockConnection[]
  threads: DockThread[]
  messages: DockMessage[]
  threadModels: DockThreadModel[]
  skills: DockSkill[]
  versions: DockSkillVersion[]
  agentSkills: DockAgentSkill[]
  proposals: DockProposal[]
  connectors: DockConnector[]
  actions: DockConnectorAction[]
  agentConnectors: DockAgentConnector[]
  grants: DockGrant[]
  approvals: DockApproval[]
  requests: DockRequest[]
  kitBots: DockKitBot[]
  routines: DockRoutine[]
  usage: DockUsage[]
  policies: { provider: string; dataClass: "local" | "padrao" | "conferir" | "treina" }[]
  bridge: DockBridge
  /** estado de cada bot (office-state/v1), calculado pelo servidor ou pela demonstração */
  states: Record<string, AgentState>
}

/* ---------- regras ---------- */
export const versionOf = (d: Pick<DockData, "versions">, skillId: string, version: number) =>
  d.versions.find((v) => v.skillId === skillId && v.version === version)

/** Por que o bot NÃO pode receber a skill (null = pode). Mesma ordem de office_install_skill. */
export function skillBlock(d: Pick<DockData, "versions" | "agentConnectors">, agent: Pick<DockAgent, "id" | "accessLevel">, skill: Pick<DockSkill, "id" | "currentVersion" | "archived">): string | null {
  if (skill.archived) return "skill arquivada"
  const v = versionOf(d, skill.id, skill.currentVersion)
  if (!v) return "versão não encontrada"
  if (v.minLevel > agent.accessLevel) return `pede nível ${v.minLevel}`
  const have = new Set(d.agentConnectors.filter((c) => c.agentId === agent.id).map((c) => c.connectorId))
  const missing = v.requiredConnectors.filter((c) => !have.has(c))
  if (missing.length) return `usa o app ${missing.join(", ")}`
  return null
}

/**
 * Versão que o bot usa agora (igual a private.office_skill_version_for): fixada, ou a maior versão
 * entre a aceita e a atual que não pede MAIS (nível, conector, script) que a aceita.
 */
export function effectiveVersion(d: Pick<DockData, "versions" | "skills">, install: DockAgentSkill, agentLevel: number): number | null {
  const skill = d.skills.find((s) => s.id === install.skillId)
  if (!skill || skill.archived) return null
  const seen = versionOf(d, skill.id, install.seenVersion)
  if (!seen) return null
  let eff: number | null = install.pinnedVersion
  if (eff === null) {
    eff = d.versions
      .filter((v) => v.skillId === skill.id && v.version >= install.seenVersion && v.version <= skill.currentVersion)
      .filter((v) => v.minLevel <= seen.minLevel && v.requiredConnectors.every((c) => seen.requiredConnectors.includes(c)) && (seen.hasScripts || !v.hasScripts))
      .reduce<number | null>((m, v) => (m === null || v.version > m ? v.version : m), null)
  }
  const ev = eff === null ? undefined : versionOf(d, skill.id, eff)
  return ev && ev.minLevel <= agentLevel ? ev.version : null
}

/** Há versão nova esperando o dono (pede mais poder)? */
export const updateWaiting = (d: Pick<DockData, "versions" | "skills">, install: DockAgentSkill, agentLevel: number) => {
  const skill = d.skills.find((s) => s.id === install.skillId)
  return !!skill && install.pinnedVersion === null && effectiveVersion(d, install, agentLevel) !== skill.currentVersion
}

/** Classe efetiva com o volume: acima de max_items vira D (como office_request_action). */
export const effectiveClass = (a: Pick<DockConnectorAction, "actionClass" | "maxItems">, items: number): ActionClass => (items > a.maxItems ? "D" : a.actionClass)

/** "Sempre permitir" só para C, nunca para envio para fora ou dinheiro. */
export const grantAllowed = (a: Pick<DockConnectorAction, "actionClass" | "sendsOutside" | "money" | "enabled">) =>
  a.actionClass === "C" && !a.sendsOutside && !a.money && a.enabled

/** Por que o bot NÃO pode receber o conector (null = pode). */
export function connectorBlock(c: Pick<DockConnector, "status" | "wave" | "minLevel">, agent: Pick<DockAgent, "accessLevel">): string | null {
  if (c.status !== "aprovado") return c.status === "suspenso" ? "suspenso pelos founders" : "ainda não aprovado"
  if (c.wave === 0) return "a confirmar"
  if (c.minLevel > agent.accessLevel) return `pede nível ${c.minLevel}`
  return null
}

export const CLASS_TEXT: Record<ActionClass, string> = { A: "Ler", B: "Rascunhar", C: "Executar", D: "Sensível" }
export const CLASS_RULE: Record<ActionClass, string> = {
  A: "segue sozinho",
  B: "chega como rascunho",
  C: "pede você (dá para \"sempre permitir\" por bot)",
  D: "sempre pede uma pessoa",
}
export const CATEGORIES: { id: DockConnector["category"]; label: string }[] = [
  { id: "programacao", label: "Programação" },
  { id: "design", label: "Design" },
  { id: "dados", label: "Dados e análises" },
  { id: "produtividade", label: "Produtividade" },
  { id: "pesquisa", label: "Pesquisa" },
  { id: "automacoes", label: "Automações" },
]

/** Qual IA responde este bot nesta conversa (troca feita pela pessoa vale primeiro). */
export function connectionFor(d: Pick<DockData, "threadModels" | "agents">, threadId: string, agentId: string): { connectionId: string | null; model: string | null; override: boolean } {
  const tm = d.threadModels.find((t) => t.threadId === threadId && t.agentId === agentId)
  if (tm) return { connectionId: tm.connectionId, model: tm.model, override: true }
  const a = d.agents.find((x) => x.id === agentId)
  return { connectionId: a?.connectionId ?? null, model: a?.model ?? null, override: false }
}

/** Pendências que pedem a pessoa: aprovações abertas, propostas de skill e pedidos de conector. */
export function pendingCount(d: Pick<DockData, "approvals" | "proposals" | "requests">, opts: { lead: boolean; founder: boolean }) {
  const now = Date.now()
  const apr = d.approvals.filter((a) => a.status === "pendente" && new Date(a.expiresAt).getTime() > now).length
  const props = opts.lead ? d.proposals.filter((p) => p.status === "aberta").length : 0
  const reqs = opts.founder ? d.requests.filter((r) => r.status === "aberto").length : 0
  return { approvals: apr, proposals: props, requests: reqs, total: apr + props + reqs }
}

/** Texto de "sinal" que sobe para a área: recusa o que parece dado pessoal (como office_send_skill_signal). */
export function signalLooksPersonal(text: string) {
  return /[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/.test(text) || /[0-9]{8,}/.test(text) || /https?:\/\//i.test(text)
}

/** Endereço de provedor personalizado aceito pelo banco (https fora do PC; sem usuário:senha nem "?"). */
export function endpointOk(url: string) {
  const u = url.trim().toLowerCase()
  if (u.length > 300) return false
  if (!/^https?:\/\/[a-z0-9.-]{1,200}(:[0-9]{1,5})?(\/[a-z0-9._~/-]{0,200})?$/.test(u)) return false
  return u.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(u)
}

/** Nome legível da área quando ela não está na lista carregada (ex.: modo demonstração). */
const AREA_NAMES: Record<string, string> = { producao: "Produção", comercial: "Comercial", design: "Design", operacao: "Operação", marketing: "Marketing", financeiro: "Financeiro" }
export const areaLabel = (id: string | null, areas: { id: string; name: string }[]) =>
  id ? areas.find((a) => a.id === id)?.name ?? AREA_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1) : "Pessoal"
