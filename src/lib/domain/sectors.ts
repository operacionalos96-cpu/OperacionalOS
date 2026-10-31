/**
 * Próximo passo de cada setor (Início › Meu Dia): um cartão por setor com o que está esperando a
 * pessoa e o link da aba exata onde a ação acontece. Reaproveita as regras de cada tela
 * (fila de prospecção, funil, urgência do lead, estado da conta, etapa do conteúdo) — os números
 * são os mesmos que a tela mostra. Testado em sectors.test.ts.
 */
import { format, parseISO } from "date-fns"
import type { ContentItem } from "./content"
import { followupsDue, type FunnelStep } from "./funnel"
import { prospectQueue } from "./prospecting"
import { leadUrgency, transactionState } from "./rules"
import type { Lead, Transaction } from "./types"

export type SectorId = "prospeccao" | "pipeline" | "conteudo" | "financeiro"

export interface SectorStep {
  id: SectorId
  title: string
  /** Quantas coisas esperando (0 = em dia). */
  count: number
  /** "12 leads na fila para revisar" */
  text: string
  /** Texto do botão: "Abrir a fila". */
  action: string
  href: string
}

/** Setores ligados às áreas da pessoa sobem na lista. */
const SECTOR_AREAS: Record<SectorId, string[]> = {
  prospeccao: ["comercial"],
  pipeline: ["comercial", "lancamentos"],
  conteudo: ["conteudo", "roteiros"],
  financeiro: ["financeiro"],
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function sectorSteps(
  me: string,
  now: Date,
  src: { leads: Lead[]; funnel: FunnelStep[]; content: ContentItem[]; transactions: Transaction[]; myAreaIds?: string[] },
): SectorStep[] {
  const today = format(now, "yyyy-MM-dd")

  const queue = prospectQueue(src.leads, me).length
  const followups = src.funnel.length ? followupsDue(src.leads, src.funnel, now, me).length : 0
  const prospeccao: SectorStep = followups
    ? { id: "prospeccao", title: "Prospecção", count: followups + queue, text: `${plural(followups, "follow-up vencendo", "follow-ups vencendo")}${queue ? ` · ${queue} na fila` : ""}`, action: "Abrir o funil", href: "/prospeccao?aba=funil" }
    : { id: "prospeccao", title: "Prospecção", count: queue, text: queue ? `${plural(queue, "lead", "leads")} na fila para revisar` : "Fila em dia", action: "Abrir a fila", href: "/prospeccao?aba=fila" }

  const mine = src.leads.filter((l) => l.ownerId === me)
  const action = mine.filter((l) => {
    const u = leadUrgency(l, now)
    return u === "vencida" || u === "hoje"
  }).length
  const stale = mine.filter((l) => leadUrgency(l, now) === "parado").length
  const pipeline: SectorStep = {
    id: "pipeline",
    title: "Pipeline",
    count: action + stale,
    text: action ? `${plural(action, "lead precisa", "leads precisam")} de ação hoje${stale ? ` · ${stale} parados` : ""}` : stale ? `${plural(stale, "lead parado", "leads parados")}` : "Nenhuma ação pendente",
    action: "Ver o que precisa de ação",
    href: "/pipeline?view=acao&dono=meus",
  }

  const open = src.content.filter((c) => c.ownerId === me && c.stage !== "publicado")
  const late = open.filter((c) => c.dueDate && c.dueDate.slice(0, 10) <= today)
  const ready = open.filter((c) => c.stage === "pronto" || c.stage === "revisao")
  const conteudo: SectorStep = {
    id: "conteudo",
    title: "Conteúdos",
    count: late.length + ready.length,
    text: late.length
      ? `${plural(late.length, "conteúdo com prazo", "conteúdos com prazo")} até hoje${late[0].dueDate ? ` (${format(parseISO(late[0].dueDate), "dd/MM")})` : ""}`
      : ready.length
        ? `${plural(ready.length, "conteúdo", "conteúdos")} para revisar ou postar`
        : open.length
          ? `${plural(open.length, "conteúdo", "conteúdos")} em produção`
          : "Nada em produção",
    action: "Abrir as etapas",
    href: "/conteudos?aba=producao",
  }

  const overdue = src.transactions.filter((t) => transactionState(t, now) === "vencido")
  const pay = overdue.filter((t) => t.type === "saida").length
  const receive = overdue.filter((t) => t.type === "entrada").length
  const financeiro: SectorStep = {
    id: "financeiro",
    title: "Financeiro",
    count: pay + receive,
    text: pay || receive ? [pay && plural(pay, "conta a pagar vencida", "contas a pagar vencidas"), receive && plural(receive, "a receber vencida", "a receber vencidas")].filter(Boolean).join(" · ") : "Contas em dia",
    action: pay || !receive ? "Abrir contas a pagar" : "Abrir contas a receber",
    href: pay || !receive ? "/financeiro?aba=pagar" : "/financeiro?aba=receber",
  }

  const mineFirst = (s: SectorStep) => (SECTOR_AREAS[s.id].some((a) => src.myAreaIds?.includes(a)) ? 0 : 1)
  return [prospeccao, pipeline, conteudo, financeiro].sort((a, b) => mineFirst(a) - mineFirst(b) || (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0))
}
