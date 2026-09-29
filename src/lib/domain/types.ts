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
}

export interface MindMapEdge {
  id: string
  source: string
  target: string
}

export interface MindMap {
  id: string
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  updatedAt: ISODate
}
