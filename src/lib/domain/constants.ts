import type { ActivityKind, Stage, Temperature, TransactionType } from "./types"

export const STAGES: { id: Stage; label: string; open: boolean }[] = [
  { id: "novo", label: "Novo", open: true },
  { id: "contato", label: "Contato feito", open: true },
  { id: "proposta", label: "Proposta", open: true },
  { id: "negociacao", label: "Negociação", open: true },
  { id: "ganho", label: "Ganho", open: false },
  { id: "perdido", label: "Perdido", open: false },
]

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
