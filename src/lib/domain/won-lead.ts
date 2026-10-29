import { addDays, format } from "date-fns"
import type { Lead, Task, Transaction } from "./types"

export const WON_TAG = "contrato-fechado"

/**
 * Fluxo intersetorial do piloto: lead ganho → projeto (nome), tarefa de onboarding e
 * recebimento previsto. Pura e idempotente: chamar duas vezes para o mesmo lead
 * não gera nada novo (uma conversão = uma tarefa e um recebimento).
 */
export function planWonLead(lead: Lead, tasks: Task[], transactions: Transaction[], now: Date) {
  const project = (lead.company || lead.name).trim()
  const hasTask = tasks.some((t) => t.leadId === lead.id && t.labels?.includes(WON_TAG))
  const hasTx = transactions.some((t) => t.leadId === lead.id && t.status === "previsto" && t.category === "Contrato")
  return {
    project,
    task: hasTask ? null : { title: `Onboarding: ${project}`, ownerId: lead.ownerId, leadId: lead.id, projectName: project, labels: [WON_TAG], priority: "alta" as const, dueDate: format(addDays(now, 3), "yyyy-MM-dd"), description: `Criada automaticamente quando o lead ${lead.name} foi ganho. Confirme escopo, responsável e primeiro prazo.` },
    transaction:
      hasTx || lead.valueCents <= 0
        ? null
        : { type: "entrada" as const, amountCents: lead.valueCents, category: "Contrato", description: `Contrato ${project}`, date: format(addDays(now, 30), "yyyy-MM-dd"), dueDate: format(addDays(now, 30), "yyyy-MM-dd"), status: "previsto" as const, leadId: lead.id, projectName: project },
  }
}
