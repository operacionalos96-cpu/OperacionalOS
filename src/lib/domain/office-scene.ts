import { describeEvent, type BusinessEvent } from "./ai-office"

/**
 * Sede 3D (ADR 0021): traduz os eventos reais do negócio (tabela `events`) em ações da cena.
 * Regra pura: a cena só desenha o que esta função manda. Assim dá para testar o roteiro sem 3D.
 *
 * Andares (de baixo para cima): 0 funil/prospecção · 1 dados (servidores) · 2 análise · 3 produção (sites).
 * O lead entra e sai pela cobertura; entre andares, o pacote viaja pelo duto de dados.
 */
export const SEDE_FLOORS = { funil: 0, dados: 1, analise: 2, producao: 3 } as const
export type SedeFloor = keyof typeof SEDE_FLOORS

export type SceneAction =
  /** chega de fora (cobertura) até um robô do andar */
  | { kind: "arrive"; floor: SedeFloor; entity: string; text: string; tone: "lead" }
  /** passa de um andar para outro; `await` = o robô de destino fica esperando uma decisão humana ("!") */
  | { kind: "transfer"; from: SedeFloor; to: SedeFloor; entity: string; text: string; tone: "lead"; await?: boolean }
  /** sai do prédio para o cliente (mensagem, proposta, entrega); `celebrate` acende o painel da HZK */
  | { kind: "send"; from: SedeFloor; entity: string; text: string; tone: "entrega"; celebrate?: boolean }
  /** decisão humana sobre algo que esperava: o "!" some; aprovado mostra o ✓ */
  | { kind: "resolve"; entity: string; approved: boolean; text: string }
  /** o pacote apaga no andar (descartado ou perdido) */
  | { kind: "discard"; floor: SedeFloor; entity: string; text: string }
  /** um agente de IA mudou de estado (um robô do andar mostra) */
  | { kind: "agent"; floor: SedeFloor; agent: string; state: "working" | "done" | "failed"; text: string }

/** Andar de cada agente padrão do AI Office (os novos ficam no andar de dados). */
const AGENT_FLOOR: Record<string, SedeFloor> = {
  prospector: "funil",
  "web-analyst": "analise",
  intelligence: "analise",
  "video-studio": "producao",
  "knowledge-manager": "dados",
}

/**
 * Evento real → ação da cena (ou nada, quando o evento não aparece no prédio).
 * `name` é o nome legível (lead ou agente), quando quem chama sabe.
 */
export function sceneActionFor(e: Pick<BusinessEvent, "event_type" | "entity_id" | "metadata">, name?: string): SceneAction | null {
  const entity = e.entity_id
  const text = describeEvent(e, name)
  switch (e.event_type) {
    case "lead.created":
    case "lead.replied":
    case "lead.interested":
      return { kind: "arrive", floor: "funil", entity, text, tone: "lead" }
    case "lead.analyzed":
      // a análise termina com o lead esperando aprovação de alguém da equipe
      return { kind: "transfer", from: "funil", to: "analise", entity, text, tone: "lead", await: true }
    case "lead.approved":
      return { kind: "resolve", entity, approved: true, text }
    case "lead.rejected":
      return { kind: "resolve", entity, approved: false, text }
    case "lead.contacted":
    case "lead.followup_sent":
      return { kind: "send", from: "funil", entity, text, tone: "entrega" }
    case "lead.proposal":
      return { kind: "transfer", from: "funil", to: "producao", entity, text, tone: "lead" }
    case "lead.converted":
      return { kind: "send", from: "producao", entity, text, tone: "entrega", celebrate: true }
    case "lead.lost":
      return { kind: "discard", floor: "funil", entity, text }
    case "agent.started":
    case "agent.completed":
    case "agent.failed": {
      const state = e.event_type === "agent.started" ? "working" : e.event_type === "agent.completed" ? "done" : "failed"
      return { kind: "agent", floor: AGENT_FLOOR[entity] ?? "dados", agent: entity, state, text }
    }
    default:
      return null
  }
}

/**
 * Fila da cena: eventos chegam em rajada (ex.: importar 200 leads), a cena mostra um por vez.
 * Guarda no máximo `max`; o excesso mais antigo sai e é contado em `skipped` (a tela avisa "+N").
 */
export interface SceneQueue {
  items: SceneAction[]
  skipped: number
}

export function enqueueScene(q: SceneQueue, action: SceneAction, max = 12): SceneQueue {
  const items = [...q.items, action]
  const over = Math.max(0, items.length - max)
  return { items: items.slice(over), skipped: q.skipped + over }
}

/**
 * Quais eventos do feed são novos para a cena: só os que chegaram depois que ela abriu
 * (o histórico carregado não é reencenado) e que ela ainda não viu, do mais antigo para o mais novo.
 */
export function freshForScene<E extends Pick<BusinessEvent, "id" | "created_at">>(events: E[], seen: ReadonlySet<string>, openedAt: string): E[] {
  return events.filter((e) => !seen.has(e.id) && e.created_at >= openedAt).sort((a, b) => a.created_at.localeCompare(b.created_at))
}
