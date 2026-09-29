import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, nextMonday, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})

export function money(cents: number) {
  return brl.format(cents / 100)
}

export function moneyCompact(cents: number) {
  return Math.abs(cents) < 1_000_000 ? money(cents).replace(/,00$/, "") : brlCompact.format(cents / 100)
}

const plain = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Centavos → texto para um campo de valor ("27.000,00"). */
export function moneyInputValue(cents: number | undefined) {
  return cents ? plain.format(cents / 100) : ""
}

/** "1.234,56" | "1234.56" | "1234" → centavos. Retorna null se inválido. */
export function parseMoney(input: string): number | null {
  const clean = input.replace(/[^\d,.-]/g, "").trim()
  if (!clean) return null
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

/** Data de calendário local "yyyy-MM-dd". */
export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd")
}

export function today() {
  return toDateKey(new Date())
}

/** "Hoje", "Amanhã", "Ontem", "Seg, 06/10", "há 3 dias"... pensado para prazos. */
export function dueLabel(dateKey: string, now = new Date()) {
  const d = differenceInCalendarDays(parseISO(dateKey), now)
  if (d === 0) return "Hoje"
  if (d === 1) return "Amanhã"
  if (d === -1) return "Ontem"
  if (d < -1) return `${-d} dias atrás`
  if (d < 7) return format(parseISO(dateKey), "EEEE", { locale: ptBR }).replace("-feira", "")
  return format(parseISO(dateKey), "dd MMM", { locale: ptBR })
}

export function shortDate(iso: string) {
  return format(parseISO(iso), "dd MMM", { locale: ptBR })
}

export function dateTime(iso: string) {
  return format(parseISO(iso), "dd MMM · HH:mm", { locale: ptBR })
}

export function relative(iso: string) {
  return formatDistanceToNowStrict(parseISO(iso), { locale: ptBR, addSuffix: true })
}

/** Atalhos de prazo usados em todos os formulários. */
export function dueShortcuts(now = new Date()) {
  return [
    { label: "Hoje", value: toDateKey(now) },
    { label: "Amanhã", value: toDateKey(addDays(now, 1)) },
    { label: "+3 dias", value: toDateKey(addDays(now, 3)) },
    { label: "Próx. semana", value: toDateKey(nextMonday(now)) },
  ]
}

export function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
}
