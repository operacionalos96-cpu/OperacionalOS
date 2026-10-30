/** Produtos da operação. Regras puras (sem React/banco), testadas em products.test.ts. */
import { isSameMonth, parseISO } from "date-fns"
import { isDiscarded } from "./prospecting"
import { isRealizedTransaction } from "./rules"
import type { ISODate, Lead, Transaction } from "./types"

export type ProductStatus = "ativo" | "desenvolvimento" | "pausado" | "arquivado"
export type ProductKind = "infoproduto" | "servico" | "assinatura" | "mentoria" | "evento" | "fisico" | "outro"

export interface ProductLink {
  id: string
  label: string
  url: string
}

export interface Product {
  id: string
  name: string
  kind: ProductKind
  status: ProductStatus
  /** Preço de venda em centavos (opcional: serviços sob orçamento). */
  priceCents?: number
  description?: string
  /** Links de venda, checkout, área de membros, drive, anúncios… */
  links: ProductLink[]
  ownerId?: string
  createdAt: ISODate
  updatedAt?: ISODate
}

export const PRODUCT_STATUSES: { id: ProductStatus; label: string; tone: "success" | "warning" | "muted" }[] = [
  { id: "ativo", label: "Ativo", tone: "success" },
  { id: "desenvolvimento", label: "Em desenvolvimento", tone: "warning" },
  { id: "pausado", label: "Pausado", tone: "muted" },
  { id: "arquivado", label: "Arquivado", tone: "muted" },
]

export const PRODUCT_KINDS: { id: ProductKind; label: string }[] = [
  { id: "infoproduto", label: "Infoproduto" },
  { id: "servico", label: "Serviço" },
  { id: "assinatura", label: "Assinatura" },
  { id: "mentoria", label: "Mentoria" },
  { id: "evento", label: "Evento" },
  { id: "fisico", label: "Produto físico" },
  { id: "outro", label: "Outro" },
]

/**
 * Segurança: só aceita links http(s). Bloqueia "javascript:", "data:" etc.
 * (um link desses, clicado, executaria código na sessão de quem clicou).
 */
export function safeUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withProtocol)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}

export function productStats(productId: string, leads: Lead[], txs: Transaction[], now: Date) {
  const pLeads = leads.filter((l) => l.productId === productId)
  // Mesmas regras do resto do app (metrics.ts): descartado não é pipeline; previsto não é entrada.
  const open = pLeads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido" && !isDiscarded(l))
  const won = pLeads.filter((l) => l.stage === "ganho")
  const lost = pLeads.filter((l) => l.stage === "perdido")
  const pTx = txs.filter((t) => t.productId === productId && isRealizedTransaction(t))
  const sumOf = (list: Transaction[]) => list.reduce((acc, t) => acc + t.amountCents, 0)
  const income = pTx.filter((t) => t.type === "entrada")
  const expense = pTx.filter((t) => t.type === "saida")
  const inMonth = (t: Transaction) => isSameMonth(parseISO(t.date), now)
  const decided = won.length + lost.length
  return {
    leads: pLeads.length,
    openLeads: open.length,
    wonLeads: won.length,
    lostLeads: lost.length,
    /** Ganhos ÷ (ganhos + perdidos). null enquanto nada foi decidido. */
    conversion: decided ? won.length / decided : null,
    pipelineCents: open.reduce((acc, l) => acc + l.valueCents, 0),
    incomeCents: sumOf(income),
    expenseCents: sumOf(expense),
    netCents: sumOf(income) - sumOf(expense),
    incomeMonthCents: sumOf(income.filter(inMonth)),
    expenseMonthCents: sumOf(expense.filter(inMonth)),
    transactions: pTx.length,
  }
}
