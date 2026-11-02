"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { myDay, type MyDay } from "@/lib/domain/my-day"
import { planId, type DailyPlan } from "@/lib/domain/presence"
import { doingNow, endPause, lastSession, pausedNow, pauseWork, routineOf, startTask, stopTask, syncWithStatus, type Pause, type PauseReason, type Routine, type WorkSession } from "@/lib/domain/work-sessions"
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

/** Marca uma rotina (Prospecção…) como o "fazendo agora", se ainda não é. Fora de hook: lê o dia na hora. */
export function startRoutine(routine: Routine) {
  const plans = useDailyPlans.getState()
  const row = dayRow(plans.items, useStore.getState().meId, new Date())
  const updated = startTask(row, routine, new Date())
  if (updated !== row) plans.save(updated)
}

/**
 * "Fazendo agora": começar e concluir passam pelas MESMAS ações do círculo de status (fase + tempo
 * juntos); pausar só fecha o tempo (a tarefa continua em andamento). Pausa com motivo (ADR 0015):
 * fecha o tempo e mostra ao time por que a pessoa parou; voltar retoma a última tarefa.
 */
export function useDoing(): {
  doing?: WorkSession
  paused?: Pause
  start(task: Task): void
  /** Começa uma rotina (Prospecção…): vira o "fazendo agora", sem tocar na fase de nenhuma tarefa. */
  startRoutine(routine: Routine): void
  pause(): void
  pauseFor(reason: PauseReason, note?: string): void
  resume(): void
  complete(task: Task): void
} {
  const meId = useStore((s) => s.meId)
  const plans = useDailyPlans((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  const today = () => dayRow(useDailyPlans.getState().items, meId, new Date())
  const row = dayRow(plans, meId, new Date())
  return {
    doing: doingNow(row),
    paused: pausedNow(row),
    start: (task) => setTaskStatus(task.id, "andamento"),
    startRoutine,
    pause() {
      save(stopTask(today(), new Date()))
    },
    pauseFor(reason, note) {
      save(pauseWork(today(), reason, note, new Date()))
    },
    resume() {
      const last = lastSession(today())
      const routine = routineOf(last?.taskId)
      if (routine) return save(startTask(today(), routine, new Date()))
      const task = last && useStore.getState().tasks.find((t) => t.id === last.taskId && !t.done)
      // Voltar = retomar a última tarefa (a mesma ação do status fecha a pausa); sem tarefa, só fecha a pausa.
      if (task) setTaskStatus(task.id, "andamento")
      else save(endPause(today(), new Date()))
    },
    complete: (task) => setTaskStatus(task.id, "feito"),
  }
}
