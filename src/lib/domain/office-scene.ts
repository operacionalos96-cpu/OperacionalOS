import { describeEvent, type BusinessEvent } from "./ai-office"
import type { Area } from "./areas"
import { describeJobEvent } from "./jobs"

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

// ---------- Sede v2 (torre de 14 andares, plano 38) ----------

/**
 * Andares fixos da torre v2: cada um tem interior próprio modelado no Blender (public/sede/interior_F0N.glb)
 * e corresponde a um módulo do app. As outras áreas da empresa ocupam os andares de cima, em ordem.
 */
export const SEDE_BASE = [
  { andar: 1, key: "equipe", nome: "Equipe", desc: "Recepção, mural da equipe e lounge de chegada. Quando alguém é convidado, a pessoa nova sobe pelo elevador." },
  { andar: 2, key: "tarefas", nome: "Tarefas", desc: "Quadro a fazer, fazendo e feito no núcleo. Cada tarefa concluída chega como um pacote a uma mesa." },
  { andar: 3, key: "comercial", nome: "Comercial", desc: "A sala do funil: as 10 estações dos passos 0 a 9. Cada movimentação de lead corre pelo anel laranja até a estação do passo." },
  { andar: 4, key: "conteudos", nome: "Conteúdos", desc: "Estúdio e máquina de etapas: roteiro, gravação, edição e publicação. Cada avanço move o pacote na esteira." },
  { andar: 5, key: "financeiro", nome: "Financeiro", desc: "Pele jateada: de fora só se vê o movimento. Cada entrada lançada é um pulso no anel, sem valor." },
] as const

export const SEDE_ANDARES = 14

export type SedeAreaKey = string

export interface SedeOcupado {
  andar: number
  key: SedeAreaKey
  nome: string
  desc?: string
  /** andar montado com as peças do kit (sem interior próprio) */
  nova?: boolean
}

/** Área do app (tabela areas) que já tem andar fixo na torre. */
const AREA_ALIAS: Record<string, SedeAreaKey> = { pessoas: "equipe", comercial: "comercial", conteudo: "conteudos", financeiro: "financeiro" }

/** id de área do app → chave do andar (ex.: "conteudo" → "conteudos"). */
export const sedeKeyOf = (areaId: string): SedeAreaKey => AREA_ALIAS[areaId] ?? areaId

/**
 * Quem ocupa cada andar: os 5 fixos e, do 6º para cima, as áreas da empresa sem andar fixo (na ordem
 * de Configurações). O que não cabe nos 14 andares fica de fora; os andares que sobram ficam livres.
 */
export function sedeOcupados(areas: Pick<Area, "id" | "name" | "description" | "order">[]): SedeOcupado[] {
  const fixas = new Set<string>(SEDE_BASE.map((b) => b.key))
  const list: SedeOcupado[] = SEDE_BASE.map((b) => ({ ...b }))
  const resto = [...areas].sort((a, b) => a.order - b.order).filter((a) => !fixas.has(sedeKeyOf(a.id)))
  for (const a of resto) {
    const andar = list.length + 1
    if (andar > SEDE_ANDARES) break
    list.push({ andar, key: a.id, nome: a.name, desc: a.description ? `${a.description}.` : undefined, nova: true })
  }
  return list
}

/** O que a cena v2 recebe (`applyEvent`). `label` é a frase do registro "Ao vivo no prédio". */
export interface SedeEvento {
  type: string
  area: SedeAreaKey | null
  label: string
  /** pede atenção (decisão esperando, falha) */
  alerta?: boolean
}

/** Agente → andar onde ele trabalha (os novos não têm andar: só entram no registro). */
const AGENT_AREA: Record<string, SedeAreaKey> = { prospector: "comercial", "web-analyst": "comercial", intelligence: "comercial", "video-studio": "comercial" }

/** Frases dos eventos que ainda não existem em EVENT_TYPES, mas a cena já sabe mostrar. */
const SEDE_LABEL: Record<string, string> = {
  "tarefa.concluida": "Tarefa concluída",
  "conteudo.etapa": "Conteúdo avançou uma etapa",
  "entrada.lancada": "Entrada lançada",
  "aprovacao.pedida": "Decisão esperando você",
  "aprovacao.decidida": "Decisão tomada",
}
const SEDE_DEFAULT_AREA: Record<string, SedeAreaKey> = { tarefa: "tarefas", conteudo: "conteudos", entrada: "financeiro", aprovacao: "comercial" }

/**
 * Evento real (tabela `events`) → o que a torre v2 encena, na ordem. Lista vazia = não aparece no prédio.
 * Tabela do LEIA-ME do protótipo (docs/prototipos/sede-blender/web): lead.* corre pelo anel do Comercial
 * até a estação do passo; análise pede decisão (farol aceso) e aprovar/descartar decide.
 */
export function sedeEventsFor(e: Pick<BusinessEvent, "event_type" | "entity_id" | "metadata">, name?: string): SedeEvento[] {
  const type = String(e.event_type)
  const meta = e.metadata ?? {}
  const areaMeta = typeof meta.area === "string" && meta.area ? sedeKeyOf(meta.area) : null
  const text = () => describeEvent(e, name)
  const one = (t: string, area: SedeAreaKey | null, label = text(), alerta?: boolean): SedeEvento => ({ type: t, area, label, ...(alerta ? { alerta } : {}) })
  switch (type) {
    case "lead.created":
    case "lead.contacted":
    case "lead.replied":
    case "lead.followup_sent":
    case "lead.proposal":
    case "hypothesis.created":
      return [one(type, "comercial")]
    case "lead.interested":
      return [one("lead.replied", "comercial")]
    case "lead.analyzed":
      // a análise termina com o lead esperando a aprovação de alguém: o farol do Comercial acende
      return [one(type, "comercial"), one("aprovacao.pedida", "comercial", `Decisão esperando você: ${text()}`, true)]
    case "lead.approved":
    case "lead.rejected":
      return [one(type, "comercial"), one("aprovacao.decidida", "comercial", "Decisão tomada")]
    case "lead.converted":
      return [one("lead.ganho", "comercial")]
    case "lead.lost":
      return [one("lead.perdido", "comercial")]
    case "member.invited":
      return [one(type, "equipe")]
    case "agent.started":
    case "agent.completed":
    case "agent.failed": {
      const area = AGENT_AREA[e.entity_id] ?? null
      const t = e.entity_id === "video-studio" && type === "agent.started" ? "job.video" : type
      return [one(t, area, text(), type === "agent.failed")]
    }
    case "job.started":
    case "job.completed":
    case "job.failed":
    case "job.dead_lettered": {
      const video = meta.job_type === "render_prospect_video"
      const t = video && type === "job.started" ? "job.video" : type
      return [one(t, "comercial", describeJobEvent(type, meta), type === "job.failed" || type === "job.dead_lettered")]
    }
    case "tarefa.concluida":
    case "conteudo.etapa":
    case "entrada.lancada":
    case "aprovacao.pedida":
    case "aprovacao.decidida": {
      const area = areaMeta ?? SEDE_DEFAULT_AREA[type.split(".")[0]]
      // valor de dinheiro nunca entra na cena nem no registro
      const label = typeof meta.title === "string" && type !== "entrada.lancada" ? `${SEDE_LABEL[type]}: ${meta.title}` : SEDE_LABEL[type]
      return [one(type, area, label, type === "aprovacao.pedida")]
    }
    default:
      return []
  }
}
