"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { myDay, type MyDay } from "@/lib/domain/my-day"
import { planId, type DailyPlan } from "@/lib/domain/presence"
import { doingNow, stopTask, syncWithStatus, type WorkSession } from "@/lib/domain/work-sessions"
import { setTaskStatus } from "@/lib/actions"
import type { Task } from "@/lib/domain/types"
import { useCalendarEvents, useDailyPlans } from "@/lib/modules"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"

/** Linha do dia da pessoa (existente ou vazia), pronta para gravar por cima. */
export function dayRow(plans: DailyPlan[], memberId: string, day: Date): DailyPlan {
  const id = planId(memberId, day)
  return plans.find((p) => p.id === id) ?? { id, memberId, date: format(day, "yyyy-MM-dd") }
}

/** Meu Dia (Início e Guia do dia): os mesmos blocos, da mesma função (src/lib/domain/my-day.ts). */
export function useMyDay(): MyDay {
  const meId = useStore((s) => s.meId)
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const events = useCalendarEvents((s) => s.items)
  const plans = useDailyPlans((s) => s.items)
  const now = useMinute()
  return useMemo(() => myDay(meId, now, { tasks, items, events, plans }), [meId, now, tasks, items, events, plans])
}

/**
 * Tempo da tarefa acompanhando a fase (ADR 0010): chamada SÓ pelas ações da própria pessoa
 * (src/lib/actions.ts › setTaskStatus, toggleTaskWithFeedback, excluir), nunca por mudança que chega
 * de outra pessoa — assim o seu tempo não abre nem fecha pelo que o outro fez.
 */
export function syncDoing(taskId: string, next: "afazer" | "andamento" | "feito") {
  const meId = useStore.getState().meId
  const task = useStore.getState().tasks.find((t) => t.id === taskId)
  const plans = useDailyPlans.getState()
  const now = new Date()
  const row = dayRow(plans.items, meId, now)
  const updated = syncWithStatus(row, task ?? { id: taskId, title: "" }, next, now)
  if (updated !== row) plans.save(updated)
}

/**
 * "Fazendo agora": começar e concluir passam pelas MESMAS ações do círculo de status (fase + tempo
 * juntos); pausar só fecha o tempo (a tarefa continua em andamento).
 */
export function useDoing(): { doing?: WorkSession; start(task: Task): void; pause(): void; complete(task: Task): void } {
  const meId = useStore((s) => s.meId)
  const plans = useDailyPlans((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  return {
    doing: doingNow(dayRow(plans, meId, new Date())),
    start: (task) => setTaskStatus(task.id, "andamento"),
    pause() {
      save(stopTask(dayRow(useDailyPlans.getState().items, meId, new Date()), new Date()))
    },
    complete: (task) => setTaskStatus(task.id, "feito"),
  }
}
