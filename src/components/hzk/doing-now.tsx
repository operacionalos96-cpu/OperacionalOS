"use client"

import { useState } from "react"
import { format } from "date-fns"
import { CalendarHeartIcon, CoffeeIcon, DumbbellIcon, MoreHorizontalIcon, PauseIcon, PlayIcon, StethoscopeIcon, UtensilsIcon } from "lucide-react"
import type { Task } from "@/lib/domain/types"
import { PAUSE_REASONS, PERIOD_LABEL, minutesText, pauseLabel, periodOfDay, type PauseReason, type Routine } from "@/lib/domain/work-sessions"
import { planId } from "@/lib/domain/presence"
import { useDailyPlans } from "@/lib/modules"
import { useMinute } from "@/lib/presence"
import { useDoing } from "@/lib/use-my-day"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const REASON_ICON: Record<PauseReason, React.ComponentType<{ className?: string }>> = {
  almoco: UtensilsIcon,
  intervalo: CoffeeIcon,
  academia: DumbbellIcon,
  saude: StethoscopeIcon,
  pessoal: CalendarHeartIcon,
  outro: MoreHorizontalIcon,
}

/**
 * Pausar com motivo (ADR 0015): o time vê "Em pausa · Almoço desde 12:10" e o registro fica no dia
 * da pessoa. "Só pausar a tarefa" continua existindo para parar sem sair (trocar de assunto, etc.).
 */
export function PauseMenu({ children, side = "bottom", align = "end" }: { children: React.ReactNode; side?: "bottom" | "right" | "top"; align?: "start" | "end" | "center" }) {
  const { doing, pause, pauseFor } = useDoing()
  const [open, setOpen] = useState(false)
  const [other, setOther] = useState<string | null>(null)
  const choose = (reason: PauseReason, note?: string) => {
    pauseFor(reason, note)
    setOpen(false)
    setOther(null)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setOther(null)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} sideOffset={8} className="w-72 p-3">
        <p className="text-sm font-semibold">Pausar por quê?</p>
        <p className="t-desc mb-3 text-xs">O time vê o motivo e desde quando. Fica registrado no seu dia.</p>
        {other === null ? (
          <div className="grid grid-cols-2 gap-2">
            {PAUSE_REASONS.map((r) => {
              const Icon = REASON_ICON[r.id]
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => (r.id === "outro" ? setOther("") : choose(r.id))}
                  className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-background/60 px-2 text-center text-xs font-medium transition-colors hover:border-highlight hover:text-highlight"
                >
                  <Icon className="size-5" />
                  {r.label}
                </button>
              )
            })}
          </div>
        ) : (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (other.trim()) choose("outro", other)
            }}
          >
            <Input autoFocus placeholder="Ex.: banco, buscar filho na escola" value={other} onChange={(e) => setOther(e.target.value)} maxLength={60} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOther(null)}>
                Voltar
              </Button>
              <Button type="submit" size="sm" variant="brand" disabled={!other.trim()}>
                Pausar
              </Button>
            </div>
          </form>
        )}
        {doing && other === null && (
          <button
            type="button"
            onClick={() => {
              pause()
              setOpen(false)
            }}
            className="action-link mt-3 w-full text-center text-xs"
          >
            Só pausar a tarefa (sem sair)
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** ▶ Começar / ⏸ Pausar: marca para o time que você está fazendo esta tarefa agora (ADR 0010). */
export function DoingButton({ task, compact, className }: { task: Task; compact?: boolean; className?: string }) {
  const { doing, start } = useDoing()
  if (task.done) return null
  const active = doing?.taskId === task.id
  const hint = active ? "Pausar: escolha o motivo (almoço, academia…) ou só pause a tarefa" : "Começar: o time vê que você está fazendo esta tarefa agora"
  const trigger = compact ? (
    <button
      type="button"
      onClick={active ? undefined : () => start(task)}
      aria-label={`${active ? "Pausar" : "Começar"}: ${task.title}`}
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
    <Button type="button" size="sm" variant={active ? "default" : "outline"} onClick={active ? undefined : () => start(task)} title={hint} className={className}>
      {active ? <PauseIcon /> : <PlayIcon />} {active ? "Pausar" : "Começar agora"}
    </Button>
  )
  return active ? <PauseMenu>{trigger}</PauseMenu> : trigger
}

/**
 * ▶ Começar / ⏸ Pausar uma rotina (Prospecção…): o time vê "Fazendo: Prospecção" no online, igual a
 * uma tarefa, e a pausa abre os mesmos motivos. Começar também fecha uma pausa em aberto.
 */
export function RoutineButton({ routine }: { routine: Routine }) {
  const { doing, startRoutine } = useDoing()
  if (doing?.taskId !== routine.id) {
    return (
      <Button type="button" size="sm" variant="brand" onClick={() => startRoutine(routine)} title={`Começar: o time vê que você está fazendo ${routine.title} agora`}>
        <PlayIcon /> Começar {routine.title.toLowerCase()}
      </Button>
    )
  }
  return (
    <PauseMenu>
      <Button type="button" size="sm" variant="outline" title="Pausar: escolha o motivo (almoço, academia…) ou só pause">
        <span className="size-2 animate-pulse rounded-full bg-highlight" aria-hidden />
        {routine.title} desde {format(new Date(doing.start), "HH:mm")}
        <PauseIcon className="text-highlight" /> Pausar
      </Button>
    </PauseMenu>
  )
}

/**
 * Na barra lateral: fazendo uma tarefa → ⏸ abre os motivos; em pausa → ▶ "Voltar" (retoma a última
 * tarefa); parado → botão discreto de pausa, para sair para o almoço mesmo sem tarefa aberta.
 */
export function DoingRail() {
  const { doing, paused, resume } = useDoing()
  if (paused) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={resume} aria-label={`Em pausa: ${pauseLabel(paused)}. Voltar ao trabalho`} className="relative flex size-9 items-center justify-center rounded-full bg-warning text-black">
            <PlayIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          Em pausa: {pauseLabel(paused)} (desde {format(new Date(paused.start), "HH:mm")}). Clique para voltar.
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <PauseMenu side="right" align="end">
      {doing ? (
        <button type="button" aria-label={`Fazendo: ${doing.title}. Pausar`} title={`Fazendo: ${doing.title} (desde ${format(new Date(doing.start), "HH:mm")}). Clique para pausar.`} className="relative flex size-9 items-center justify-center rounded-full bg-highlight text-white">
          <PauseIcon className="size-4" />
        </button>
      ) : (
        <button type="button" aria-label="Pausar (almoço, academia…)" title="Pausar (almoço, academia…)" className="flex size-9 items-center justify-center rounded-full text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <CoffeeIcon className="size-[18px]" />
        </button>
      )}
    </PauseMenu>
  )
}

/** Período do dia de uma pessoa: o que fez de manhã, à tarde e à noite, quanto tempo e as pausas (página da pessoa). */
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
            {p.pauses.map((x) => (
              <li key={x.start} className="flex items-baseline justify-between gap-2 text-muted-foreground">
                <span className={cn("min-w-0 truncate", x.running && "font-medium text-warning")}>
                  ⏸ {x.label} · {format(new Date(x.start), "HH:mm")}
                </span>
                <span className="tabular shrink-0 text-xs">{minutesText(x.minutes)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
