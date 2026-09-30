/** Datas são sempre strings ISO. Dinheiro é sempre em centavos (inteiro). */
export type ISODate = string

export interface User {
  id: string
  name: string
  initials: string
  color: string
}

export type Stage = "novo" | "contato" | "proposta" | "negociacao" | "ganho" | "perdido"
export type Temperature = "quente" | "morno" | "frio"

export interface NextAction {
  text: string
  dueDate: ISODate
}

export interface Lead {
  id: string
  name: string
  company?: string
  contact?: string
  stage: Stage
  ownerId: string
  valueCents: number
  temperature?: Temperature
  nextAction: NextAction
  lastActivityAt: ISODate
  createdAt: ISODate
  closedAt?: ISODate
  lostReason?: string
  /** Produto de interesse (rastreio de leads por produto). */
  productId?: string
  /** Site atual do lead (só http/https). */
  website?: string
}

export type ActivityKind = "nota" | "ligacao" | "reuniao" | "mensagem" | "estagio" | "acao_concluida" | "criado"

export interface Activity {
  id: string
  leadId: string
  kind: ActivityKind
  text: string
  authorId: string
  createdAt: ISODate
}

export type Priority = "urgente" | "alta" | "media" | "baixa"
export type Recurrence = "diaria" | "semanal" | "mensal"

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  ownerId: string
  dueDate?: ISODate
  done: boolean
  doneAt?: ISODate
  leadId?: string
  createdAt: ISODate
  /** Campos opcionais: tarefas antigas continuam válidas sem migração. */
  priority?: Priority
  labels?: string[]
  description?: string
  checklist?: ChecklistItem[]
  /** Ao concluir, cria a próxima ocorrência automaticamente. */
  recurrence?: Recurrence
  /** Tarefa colaborativa: outras pessoas também responsáveis (além de ownerId). */
  collaborators?: string[]
  /** Em andamento (sem valor = a fazer; concluída usa `done`). */
  status?: "andamento"
  /** Tarefas recorrentes: id da primeira da série (as próximas nascem com ele). */
  seriesId?: string
}

export interface Note {
  id: string
  title: string
  body: string
  authorId: string
  updatedAt: ISODate
}

export type TransactionType = "entrada" | "saida"

export interface Transaction {
  id: string
  type: TransactionType
  amountCents: number
  category: string
  description: string
  date: ISODate
  leadId?: string
  /** Produto a que a entrada/saída pertence (rastreio financeiro por produto). */
  productId?: string
  createdById: string
}

export interface FinanceSettings {
  openingBalanceCents: number
  /** chave "YYYY-MM" → meta de faturamento (entradas) em centavos */
  monthlyGoals: Record<string, number>
}

export interface MindMapNode {
  id: string
  label: string
  x: number
  y: number
  taskId?: string
  leadId?: string
  /** Etiqueta/fase (mesma cor das etiquetas das tarefas). */
  tag?: string
  /** Matiz escolhido à mão (0–360). Sem ele, a cor vem da etiqueta. */
  hue?: number
  /** Explicação do que é esta fase/ideia. */
  description?: string
  /** Tamanho definido pelo usuário (px). Sem ele, o item se ajusta ao texto. */
  width?: number
  height?: number
  /** Andamento do processo. Sem valor = a fazer. */
  status?: "andamento" | "feito"
  /** Tipo do balão (Ideia, Projeto, Decisão…). Sem valor: deduzido do vínculo. */
  kind?: "ideia" | "projeto" | "tarefa" | "venda" | "cliente" | "produto" | "meta" | "decisao" | "resumo"
}

export interface MindMapEdge {
  id: string
  source: string
  target: string
  /** Sem valor = hierarquia (linha sólida, "filho de"). "relacao" = linha tracejada com seta. */
  kind?: "relacao"
  /** Legenda no meio da linha ("depende de", "gera"…). */
  label?: string
}

export interface MindMap {
  id: string
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  updatedAt: ISODate
  /**
   * "rows": balões em map_nodes/map_edges (1 registro cada). `nodes/edges` acima
   * ficam como backup do formato antigo. Sem valor: formato antigo (tudo aqui).
   */
  storage?: "rows"
}
