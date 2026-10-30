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

/** Id estável derivado do lead: a mesma conversão gera sempre o mesmo id (upsert não duplica). */
export function wonLeadId(kind: "task" | "tx", leadId: string) {
  const id = `won-${kind}-${leadId}`
  if (id.length <= 64) return id
  let h = 5381
  for (const c of leadId) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0
  return `won-${kind}-${h.toString(36)}-${leadId.slice(-40)}`
}

/**
 * Registros completos (prontos para gravar) do lead ganho. Usado pela automação no servidor
 * (src/lib/server/automations.ts, ADR 0006). Os ids são determinísticos: se a automação rodar
 * duas vezes — retry, dois servidores, evento repetido — o banco recebe o mesmo id e não duplica.
 */
export function wonLeadRecords(lead: Lead, tasks: Task[], transactions: Transaction[], now: Date): { task: Task | null; transaction: Transaction | null } {
  const plan = planWonLead(lead, tasks, transactions, now)
  const createdAt = now.toISOString()
  return {
    task: plan.task ? { ...plan.task, id: wonLeadId("task", lead.id), done: false, createdAt } : null,
    transaction: plan.transaction ? { ...plan.transaction, id: wonLeadId("tx", lead.id), createdById: lead.ownerId } : null,
  }
}
