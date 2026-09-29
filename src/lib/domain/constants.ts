import type { ActivityKind, Priority, Recurrence, Stage, Temperature, TransactionType } from "./types"

/** `color` é uma variável CSS de globals.css — muda junto com o tema claro/escuro. */
export const STAGES: { id: Stage; label: string; open: boolean; color: string }[] = [
  { id: "novo", label: "Novo", open: true, color: "var(--stage-novo)" },
  { id: "contato", label: "Contato feito", open: true, color: "var(--stage-contato)" },
  { id: "proposta", label: "Proposta", open: true, color: "var(--stage-proposta)" },
  { id: "negociacao", label: "Negociação", open: true, color: "var(--stage-negociacao)" },
  { id: "ganho", label: "Ganho", open: false, color: "var(--success)" },
  { id: "perdido", label: "Perdido", open: false, color: "var(--muted-foreground)" },
]

export function stageColor(stage: Stage) {
  return STAGES.find((s) => s.id === stage)?.color ?? "var(--muted-foreground)"
}

/** Ordem = peso na ordenação (0 = mais importante). */
export const PRIORITIES: { id: Priority; label: string; short: string; color: string; weight: number }[] = [
  { id: "urgente", label: "Urgente", short: "!!!", color: "var(--danger)", weight: 0 },
  { id: "alta", label: "Alta", short: "!!", color: "var(--warning)", weight: 1 },
  { id: "media", label: "Média", short: "!", color: "var(--info)", weight: 2 },
  { id: "baixa", label: "Baixa", short: "·", color: "var(--muted-foreground)", weight: 3 },
]

export function priorityMeta(p: Priority | undefined) {
  return PRIORITIES.find((x) => x.id === p)
}

export const RECURRENCES: { id: Recurrence; label: string }[] = [
  { id: "diaria", label: "Todo dia" },
  { id: "semanal", label: "Toda semana" },
  { id: "mensal", label: "Todo mês" },
]

/** Paleta das etiquetas: a cor vem do nome, então a mesma etiqueta tem sempre a mesma cor. */
export const LABEL_HUES = [264, 200, 160, 130, 85, 45, 20, 340, 300]

export const OPEN_STAGES = STAGES.filter((s) => s.open).map((s) => s.id)

export function stageLabel(stage: Stage) {
  return STAGES.find((s) => s.id === stage)?.label ?? stage
}

export function isOpenStage(stage: Stage) {
  return stage !== "ganho" && stage !== "perdido"
}

export const TEMPERATURES: { id: Temperature; label: string; dot: string }[] = [
  { id: "quente", label: "Quente", dot: "bg-red-500" },
  { id: "morno", label: "Morno", dot: "bg-amber-400" },
  { id: "frio", label: "Frio", dot: "bg-sky-400" },
]

/** Dias sem atividade para um lead aberto ser considerado parado. */
export const STALE_AFTER_DAYS = 7

export const CATEGORIES: Record<TransactionType, string[]> = {
  entrada: ["Serviços", "Produtos", "Outros"],
  saida: ["Ferramentas", "Marketing", "Pessoal", "Impostos", "Operacional", "Outros"],
}

export const INTERACTION_KINDS: { id: ActivityKind; label: string }[] = [
  { id: "nota", label: "Nota" },
  { id: "ligacao", label: "Ligação" },
  { id: "mensagem", label: "Mensagem" },
  { id: "reuniao", label: "Reunião" },
]

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  nota: "Nota",
  ligacao: "Ligação",
  mensagem: "Mensagem",
  reuniao: "Reunião",
  estagio: "Estágio",
  acao_concluida: "Ação concluída",
  criado: "Criado",
}
