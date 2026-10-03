/**
 * Prospecção (revisão humana de leads) — regras puras, testadas em prospecting.test.ts.
 * A análise (o que a IA/planilha pensou) e a revisão (o que o humano decidiu) ficam
 * em campos separados do lead e nunca se sobrescrevem: é o dado de aprendizado.
 */
import { isOpenStage } from "./constants"
import type { Lead, ReviewStatus } from "./types"

export const REJECTION_REASONS = [
  { id: "site_bom", label: "Site já é bom" },
  { id: "simples_funcional", label: "Site simples, mas funcional" },
  { id: "sem_potencial", label: "Empresa sem potencial comercial" },
  { id: "fora_publico", label: "Não é nosso público" },
  { id: "inativa", label: "Empresa parece inativa" },
  { id: "sem_contato", label: "Contato inadequado/inexistente" },
  { id: "ia_errou", label: "Análise da IA estava errada" },
  { id: "outro", label: "Outro" },
] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]["id"]
export const rejectionLabel = (id?: string) => REJECTION_REASONS.find((r) => r.id === id)?.label ?? id ?? ""

export const reviewStatus = (l: Pick<Lead, "review">): ReviewStatus => l.review?.status ?? "pending"

/** Descartado na revisão: sai do Pipeline, mas continua guardado (aprendizado). */
export const isDiscarded = (l: Pick<Lead, "review">) => reviewStatus(l) === "rejected"

/**
 * Fila do Modo Prospecção: leads abertos, ainda NÃO revisados, do responsável
 * (cada sócio na sua fila, ninguém pega o mesmo lead). Melhor oportunidade primeiro:
 * qualificação maior → site pior (nota menor) → mais antigo.
 */
export function prospectQueue<L extends Lead>(leads: L[], ownerId?: string): L[] {
  const q = (l: Lead) => l.analysis?.qualificationScore ?? -1
  const site = (l: Lead) => l.analysis?.siteScore ?? 11
  return leads
    .filter((l) => reviewStatus(l) === "pending" && isOpenStage(l.stage) && l.contactStatus !== "contacted" && (!ownerId || l.ownerId === ownerId))
    .sort((a, b) => q(b) - q(a) || site(a) - site(b) || a.createdAt.localeCompare(b.createdAt))
}

/** "Bom dia, tudo bem?" antes do meio-dia (horário de quem está usando); senão "Boa tarde, tudo bem?". */
export const greeting = (now: Date) => (now.getHours() < 12 ? "Bom dia, tudo bem?" : "Boa tarde, tudo bem?")

export function approvePatch(l: Pick<Lead, "review">, by: string, at: string): Pick<Lead, "review"> {
  return { review: { ...l.review, status: "approved", approvedAt: at, approvedBy: by } }
}

export function rejectPatch(l: Pick<Lead, "review">, by: string, at: string, reason: RejectionReason, notes?: string): Pick<Lead, "review"> {
  return { review: { ...l.review, status: "rejected", rejectedAt: at, rejectedBy: by, rejectionReason: reason, rejectionNotes: notes?.trim() || undefined } }
}

/** Primeiro contato confirmado pelo humano ("ENVIEI"). Lead novo passa para "Contato feito". */
export function contactedPatch(l: Pick<Lead, "stage">, message: string, at: string, channel: Lead["firstContactChannel"] = "whatsapp") {
  return {
    contactStatus: "contacted" as const,
    firstContactAt: at,
    firstContactMessage: message,
    firstContactChannel: channel,
    stage: l.stage === "novo" ? ("contato" as const) : l.stage,
  }
}

const sameDay = (iso: string | undefined, now: Date) => {
  if (!iso) return false
  const d = new Date(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

/** Contadores do dia (da pessoa, se informada). */
export function dayStats(leads: Lead[], now: Date, userId?: string) {
  const mine = (by?: string) => !userId || by === userId
  return {
    contacted: leads.filter((l) => sameDay(l.firstContactAt, now) && mine(l.review?.approvedBy)).length,
    rejected: leads.filter((l) => sameDay(l.review?.rejectedAt, now) && mine(l.review?.rejectedBy)).length,
    approved: leads.filter((l) => sameDay(l.review?.approvedAt, now) && mine(l.review?.approvedBy)).length,
  }
}

/** "3 min 05 s" / "42 s". */
export function duration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`
}
