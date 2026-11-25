/**
 * Contratos (ADR 0025): o que a empresa assinou, com quem, quanto vale e até quando.
 * Regras puras (testadas em contracts.test.ts): a situação NÃO é guardada — sai das datas, para nunca
 * existir um contrato "vigente" no banco que já venceu. Datas são dias (yyyy-MM-dd), sem hora.
 */
import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns"

export const CONTRACT_AREA = "contratos"

export type ContractKind = "cliente" | "parceiro" | "fornecedor" | "equipe" | "outro"

export const CONTRACT_KINDS: { id: ContractKind; label: string }[] = [
  { id: "cliente", label: "Cliente" },
  { id: "parceiro", label: "Parceiro / coprodutor" },
  { id: "fornecedor", label: "Fornecedor" },
  { id: "equipe", label: "Equipe" },
  { id: "outro", label: "Outro" },
]

export interface ContractFile {
  id: string
  name: string
  /** Caminho no bucket privado `contratos`. */
  path: string
  sizeBytes: number
  uploadedAt: string
  uploadedBy: string
}

export interface Contract {
  id: string
  title: string
  /** Com quem é o contrato (a outra parte). */
  party: string
  kind: ContractKind
  /** Valor total, em centavos (como o resto do app). */
  valueCents?: number
  /** Dia da assinatura. Sem ele, o contrato ainda é rascunho. */
  signedAt?: string
  /** Último dia de vigência. Sem ele, o contrato não tem prazo para acabar. */
  endsAt?: string
  /** Renova sozinho no fim? Então o prazo que importa é o de avisar que NÃO quer renovar. */
  autoRenews?: boolean
  /** Quantos dias antes do fim o app começa a avisar. */
  noticeDays?: number
  /** Encerrado antes do fim (distrato) ou depois de cumprido. */
  closedAt?: string
  /** O que foi combinado, em palavras simples. */
  summary?: string
  leadId?: string
  productId?: string
  files: ContractFile[]
  /** Tarefa de renovação já criada para este contrato (evita criar duas). */
  renewalTaskId?: string
  createdById: string
  createdAt: string
  updatedAt?: string
}

export const DEFAULT_NOTICE_DAYS = 30

export type ContractStatus = "rascunho" | "vigente" | "vence-em-breve" | "vencido" | "encerrado"

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: "muted" | "success" | "warning" | "danger" }> = {
  rascunho: { label: "Rascunho", tone: "muted" },
  vigente: { label: "Vigente", tone: "success" },
  "vence-em-breve": { label: "Vence em breve", tone: "warning" },
  vencido: { label: "Vencido", tone: "danger" },
  encerrado: { label: "Encerrado", tone: "muted" },
}

const dayKey = (d: Date) => format(d, "yyyy-MM-dd")

/** Dias até o último dia de vigência (0 = vence hoje; negativo = já venceu). Sem fim: undefined. */
export function daysToEnd(c: Pick<Contract, "endsAt">, now: Date): number | undefined {
  return c.endsAt ? differenceInCalendarDays(parseISO(c.endsAt), parseISO(dayKey(now))) : undefined
}

/** Situação de hoje, pelas datas. O último dia de vigência ainda conta como vigente. */
export function contractStatus(c: Contract, now: Date): ContractStatus {
  if (c.closedAt) return "encerrado"
  if (!c.signedAt) return "rascunho"
  const left = daysToEnd(c, now)
  if (left === undefined) return "vigente"
  if (left < 0) return "vencido"
  return left <= (c.noticeDays ?? DEFAULT_NOTICE_DAYS) ? "vence-em-breve" : "vigente"
}

/** Pede atenção agora: perto do fim ou vencido sem ter sido encerrado. */
export const needsAttention = (c: Contract, now: Date) => {
  const s = contractStatus(c, now)
  return s === "vence-em-breve" || s === "vencido"
}

/** Os que pedem atenção, do prazo mais apertado para o mais folgado. */
export function contractsDue(contracts: Contract[], now: Date): Contract[] {
  return contracts.filter((c) => needsAttention(c, now)).sort((a, b) => (a.endsAt ?? "").localeCompare(b.endsAt ?? ""))
}

/** Frase curta do prazo ("vence em 12 dias", "venceu há 3 dias", "sem prazo para acabar"). */
export function endLabel(c: Contract, now: Date): string {
  if (c.closedAt) return "encerrado"
  const left = daysToEnd(c, now)
  if (left === undefined) return "sem prazo para acabar"
  const verb = c.autoRenews ? ["renova", "renovou"] : ["vence", "venceu"]
  if (left === 0) return `${verb[0]} hoje`
  if (left > 0) return `${verb[0]} em ${left} ${left === 1 ? "dia" : "dias"}`
  return `${verb[1]} há ${-left} ${left === -1 ? "dia" : "dias"}`
}

/**
 * Tarefa de renovação: cai na área de Contratos (o dono da área recebe), com prazo no dia em que o
 * aviso começa — ou hoje, se esse dia já passou. Devolve null se não há o que renovar.
 */
export function renewalTask(c: Contract, now: Date): { title: string; description: string; dueDate: string; areaId: string } | null {
  if (!c.endsAt || c.closedAt || c.renewalTaskId) return null
  const start = dayKey(subDays(parseISO(c.endsAt), c.noticeDays ?? DEFAULT_NOTICE_DAYS))
  const today = dayKey(now)
  return {
    title: c.autoRenews ? `Decidir se renova: ${c.title}` : `Renovar ou encerrar: ${c.title}`,
    description: `Contrato com ${c.party}. ${c.autoRenews ? "Renova sozinho" : "Vence"} em ${format(parseISO(c.endsAt), "dd/MM/yyyy")}.`,
    dueDate: start > today ? start : today,
    areaId: CONTRACT_AREA,
  }
}

/** Soma do valor dos contratos em vigor (vigentes e os que vencem em breve). */
export function activeValueCents(contracts: Contract[], now: Date): number {
  return contracts.reduce((sum, c) => {
    const s = contractStatus(c, now)
    return s === "vigente" || s === "vence-em-breve" ? sum + (c.valueCents ?? 0) : sum
  }, 0)
}

/** Tipos de arquivo aceitos como contrato (o bucket recusa o resto) e o limite por arquivo. */
export const CONTRACT_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
export const CONTRACT_FILE_MAX_BYTES = 20 * 1024 * 1024

export function contractFileProblem(file: { size: number; type: string }): string | null {
  if (!CONTRACT_FILE_TYPES.includes(file.type)) return "Tipo de arquivo não aceito: use PDF, Word (.docx) ou uma foto (PNG ou JPG)."
  if (file.size > CONTRACT_FILE_MAX_BYTES) return `Arquivo com ${(file.size / 1024 / 1024).toFixed(0)} MB. O limite é 20 MB.`
  return null
}
