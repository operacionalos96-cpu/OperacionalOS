"use client"

import { toast } from "sonner"
import { goalValue, linkedTaskIds } from "@/lib/domain/insights"
import { planWonLead } from "@/lib/domain/won-lead"
import { on } from "@/lib/events"
import { useGoals, useRelations } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { SANDBOX } from "@/lib/supabase/env"

/**
 * Automações: reações aos eventos do negócio (src/lib/events.ts). Nova automação =
 * uma entrada em AUTOMATIONS + um `on(...)` em startAutomations. Nada aqui apaga
 * ou muda dados sem o usuário ver.
 */
export const AUTOMATIONS = [
  { id: "meta-batida", label: "Meta batida", description: "Comemora quando uma meta chega a 100% (por qualquer um da equipe)." },
  { id: "virou-cliente", label: "Virou cliente", description: "Lead ganho vira cliente e gera tarefa de onboarding e recebimento previsto (uma vez por lead); o evento lead.converted também segue para os webhooks." },
] as const

let started = false

export function startAutomations(navigate: (href: string) => void) {
  if (started) return
  started = true

  // Virou cliente. A tarefa de onboarding e o recebimento previsto são criados NO SERVIDOR
  // (evento lead.converted → fila → src/lib/server/automations.ts, ADR 0006) e chegam aqui pelo
  // tempo real. O navegador só avisa e pede para a fila andar agora (sem esperar o agendador).
  on("lead.ganho", ({ leadId }) => {
    const lead = useStore.getState().leads.find((l) => l.id === leadId)
    if (!lead) return
    if (SANDBOX) {
      // Demonstração local não tem servidor nem fila: aplica a mesma regra aqui.
      const st = useStore.getState()
      const plan = planWonLead(lead, st.tasks, st.transactions, new Date())
      if (plan.task) st.createTask(plan.task)
      if (plan.transaction) st.createTransaction(plan.transaction)
    } else {
      // Pequena espera: o evento lead.converted precisa estar gravado antes de a fila ser processada.
      setTimeout(() => void fetch("/api/automacoes/processar", { method: "POST" }).catch(() => {}), 1500)
    }
    toast.success(`${lead.name} virou cliente`, {
      description: "Tarefa de onboarding e recebimento previsto a caminho.",
      action: { label: "Ver clientes", onClick: () => navigate("/clientes") },
    })
  })

  // Meta batida: olha os dados (vale também para o que o sócio fez em tempo real).
  const celebrated = new Set<string>()
  const check = (announce: boolean) => {
    const { transactions, leads, tasks } = useStore.getState()
    const relations = useRelations.getState().items
    const today = new Date().toISOString().slice(0, 10)
    for (const g of useGoals.getState().items) {
      if (g.end < today || celebrated.has(g.id)) continue
      const ids = linkedTaskIds(g.id, relations)
      const v = goalValue(g, { transactions, leads, linkedTasks: tasks.filter((t) => ids.has(t.id)) })
      if (v.target > 0 && v.pct >= 1) {
        celebrated.add(g.id)
        if (announce) toast.success(`Meta batida: ${g.title} 🎉`, { action: { label: "Ver", onClick: () => navigate(`/metas/${g.id}`) } })
      }
    }
  }
  check(false) // o que já estava batido não comemora de novo
  let timer: ReturnType<typeof setTimeout> | undefined
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(() => check(true), 600)
  }
  useStore.subscribe((s, prev) => {
    if (s.transactions !== prev.transactions || s.leads !== prev.leads || s.tasks !== prev.tasks) later()
  })
  useGoals.subscribe(later)
  useRelations.subscribe(later)
}
