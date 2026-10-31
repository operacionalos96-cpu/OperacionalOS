"use client"

import { format } from "date-fns"
import { PauseIcon, PlayIcon } from "lucide-react"
import type { Task } from "@/lib/domain/types"
import { PERIOD_LABEL, minutesText, periodOfDay } from "@/lib/domain/work-sessions"
import { planId } from "@/lib/domain/presence"
import { useDailyPlans } from "@/lib/modules"
import { useMinute } from "@/lib/presence"
import { useDoing } from "@/lib/use-my-day"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** ▶ Começar / ⏸ Pausar: marca para o time que você está fazendo esta tarefa agora (ADR 0010). */
export function DoingButton({ task, compact, className }: { task: Task; compact?: boolean; className?: string }) {
  const { doing, start, pause } = useDoing()
  if (task.done) return null
  const active = doing?.taskId === task.id
  const label = active ? "Pausar" : "Começar"
  const hint = active ? "Pausar: o time deixa de ver esta tarefa como \"fazendo agora\"" : "Começar: o time vê que você está fazendo esta tarefa agora"
  return compact ? (
    <button
      type="button"
      onClick={() => (active ? pause() : start(task))}
      aria-label={`${label}: ${task.title}`}
      title={hint}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
        active ? "border-highlight bg-highlight text-white" : "text-muted-foreground hover:border-highlight hover:text-highlight",
        className,
      )}
    >
      {active ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
    </button>
  ) : (
    <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={() => (active ? pause() : start(task))} title={hint} className={className}>
      {active ? <PauseIcon /> : <PlayIcon />} {active ? "Pausar" : "Começar agora"}
    </Button>
  )
}

/** Na barra lateral: o que você está fazendo agora, com um clique para pausar. */
export function DoingRail() {
  const { doing, pause } = useDoing()
  if (!doing) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={pause} aria-label={`Fazendo: ${doing.title}. Pausar`} className="relative flex size-9 items-center justify-center rounded-full bg-highlight text-white">
          <span className="absolute inset-0 animate-ping rounded-full bg-highlight/40 motion-reduce:hidden" aria-hidden />
          <PauseIcon className="relative size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        Fazendo: {doing.title} (desde {format(new Date(doing.start), "HH:mm")}). Clique para pausar.
      </TooltipContent>
    </Tooltip>
  )
}

/** Período do dia de uma pessoa: o que fez de manhã, à tarde e à noite, e quanto tempo (página da pessoa). */
export function PeriodOfDay({ memberId }: { memberId: string }) {
  const now = useMinute()
  const plan = useDailyPlans((s) => s.items.find((p) => p.id === planId(memberId, now)))
  const periods = periodOfDay(plan, now)
  if (!periods.length) return <p className="t-desc text-sm">Nenhuma tarefa marcada como &quot;fazendo&quot; hoje.</p>
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {periods.map((p) => (
        <section key={p.period} className="rounded-xl border bg-background p-3">
          <p className="mb-1.5 flex items-baseline justify-between text-sm font-semibold">
            {PERIOD_LABEL[p.period]} <span className="tabular text-xs font-normal text-muted-foreground">{minutesText(p.minutes)}</span>
          </p>
          <ul className="grid gap-1 text-sm">
            {p.tasks.map((t) => (
              <li key={t.taskId} className="flex items-baseline justify-between gap-2">
                <span className={cn("min-w-0 truncate", t.running && "font-medium text-highlight")}>
                  {t.running && "▶ "}
                  {t.title}
                </span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{minutesText(t.minutes)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
