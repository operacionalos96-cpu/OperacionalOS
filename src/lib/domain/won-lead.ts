import { addDays, format } from "date-fns"
import type { Lead, Task, Transaction } from "./types"

export const WON_TAG = "contrato-fechado"

/** Prazo estimado da conclusão quando o lead é ganho: a data da 2ª parcela é ajustada no Financeiro quando o trabalho terminar. */
export const CONCLUSION_ESTIMATE_DAYS = 30

/**
 * Fluxo intersetorial do piloto: lead ganho → projeto (nome), tarefa de onboarding e os
 * recebimentos previstos do contrato em DUAS parcelas: 50% na entrada (vence hoje) e 50% na
 * conclusão (data estimada). Centavo ímpar fica na entrada, para a soma bater com o contrato.
 * Pura e idempotente: chamar duas vezes para o mesmo lead não gera nada novo.
 */
export function planWonLead(lead: Lead, tasks: Task[], transactions: Transaction[], now: Date) {
  const project = (lead.company || lead.name).trim()
  const hasTask = tasks.some((t) => t.leadId === lead.id && t.labels?.includes(WON_TAG))
  // Qualquer lançamento de contrato do lead conta, previsto ou já recebido: depois da baixa da
  // entrada, rodar de novo não pode recriar as parcelas.
  const hasTx = transactions.some((t) => t.leadId === lead.id && t.category === "Contrato")
  const upfront = Math.ceil(lead.valueCents / 2)
  const today = format(now, "yyyy-MM-dd")
  const conclusion = format(addDays(now, CONCLUSION_ESTIMATE_DAYS), "yyyy-MM-dd")
  const base = { type: "entrada" as const, category: "Contrato", status: "previsto" as const, leadId: lead.id, projectName: project }
  return {
    project,
    task: hasTask ? null : { title: `Onboarding: ${project}`, ownerId: lead.ownerId, leadId: lead.id, projectName: project, labels: [WON_TAG], priority: "alta" as const, dueDate: format(addDays(now, 3), "yyyy-MM-dd"), description: `Criada automaticamente quando o lead ${lead.name} foi ganho. Confirme escopo, responsável e primeiro prazo.` },
    transactions:
      hasTx || lead.valueCents <= 0
        ? []
        : [
            { ...base, amountCents: upfront, description: `Contrato ${project} · 50% na entrada`, date: today, dueDate: today },
            { ...base, amountCents: lead.valueCents - upfront, description: `Contrato ${project} · 50% na conclusão`, date: conclusion, dueDate: conclusion },
          ].filter((t) => t.amountCents > 0),
  }
}

/** Id estável derivado do lead: a mesma conversão gera sempre o mesmo id (upsert não duplica). */
export function wonLeadId(kind: "task" | "tx" | "tx2", leadId: string) {
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
export function wonLeadRecords(lead: Lead, tasks: Task[], transactions: Transaction[], now: Date): { task: Task | null; transactions: Transaction[] } {
  const plan = planWonLead(lead, tasks, transactions, now)
  const createdAt = now.toISOString()
  return {
    task: plan.task ? { ...plan.task, id: wonLeadId("task", lead.id), done: false, createdAt } : null,
    // A entrada mantém o id de sempre ("tx"); a parcela da conclusão ganha o seu ("tx2").
    transactions: plan.transactions.map((t, i) => ({ ...t, id: wonLeadId(i === 0 ? "tx" : "tx2", lead.id), createdById: lead.ownerId })),
  }
}
