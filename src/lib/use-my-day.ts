"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { myDay, type MyDay } from "@/lib/domain/my-day"
import { planId, type DailyPlan } from "@/lib/domain/presence"
import { doingNow, startTask, stopTask, type WorkSession } from "@/lib/domain/work-sessions"
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
 * "Fazendo agora" (ADR 0010): começar abre a sessão na linha do dia e marca a tarefa "em
 * andamento"; pausar fecha a sessão; concluir fecha a sessão e conclui a tarefa.
 */
export function useDoing(): { doing?: WorkSession; start(task: Task): void; pause(): void; complete(task: Task): void } {
  const meId = useStore((s) => s.meId)
  const updateTask = useStore((s) => s.updateTask)
  const toggleTask = useStore((s) => s.toggleTask)
  const plans = useDailyPlans((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  const today = dayRow(plans, meId, new Date())
  return {
    doing: doingNow(today),
    start(task) {
      save(startTask(dayRow(useDailyPlans.getState().items, meId, new Date()), task, new Date()))
      if (task.status !== "andamento") updateTask(task.id, { status: "andamento" })
    },
    pause() {
      save(stopTask(dayRow(useDailyPlans.getState().items, meId, new Date()), new Date()))
    },
    complete(task) {
      const row = dayRow(useDailyPlans.getState().items, meId, new Date())
      if (doingNow(row)?.taskId === task.id) save(stopTask(row, new Date()))
      if (!task.done) toggleTask(task.id)
    },
  }
}
