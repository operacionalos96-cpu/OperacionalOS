"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { MoonIcon, StickyNoteIcon, SunriseIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { PAGES } from "@/config/pages"
import { dayPlan, guideMood, helloFor } from "@/lib/domain/day-guide"
import { dayProgress } from "@/lib/domain/rules"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { useMyDay } from "@/lib/use-my-day"
import { Button } from "@/components/ui/button"
import { PageHelp } from "@/components/shared/page-help"
import { CountUp } from "@/components/shared/count-up"
import { GuideOrb } from "@/components/hzk/guide-orb"
import { cn } from "@/lib/utils"
import { AgendaToday, DailyCard, DayPlanPanel, InboxCounter, SectorStepsPanel, TeamNow, WaitingForYou, WeeklyNudge } from "@/components/hzk/my-day"

/**
 * Início · Meu Dia (blueprint, ADR 0010): o dia de quem está usando, na ordem em que se pensa —
 * cabeçalho, nota de ontem, daily, agenda, time agora, plano do dia, esperando por você, próximo
 * passo de cada setor e caixa de entrada. Todos os blocos vêm de myDay() (um item, um bloco).
 * Os números da empresa (caixa, metas, pipeline) ficam nas próprias telas.
 */
export default function HomePage() {
  const meId = useStore((s) => s.meId)
  const now = useMinute()
  const day = useMyDay()
  const openGuide = (mode: "dia" | "fechar") => useUI.getState().set({ guide: { mode, at: Date.now() } })
  const checkedIn = !!day.plan?.checkedInAt
  const closed = !!day.plan?.closedAt
  const tasks = useStore((s) => s.tasks)
  const progress = useMemo(() => dayProgress(tasks, meId, now), [meId, now, tasks])
  const mood = guideMood(dayPlan(day, now), progress)
  const allDone = progress.total > 0 && progress.done === progress.total
  // Ordem de chegada dos blocos (entrada guiada, como no guia do Workspace).
  const at = (i: number) => ({ "--i": i }) as React.CSSProperties

  return (
    <div className="page-body flex flex-col gap-5 pt-6">
      <header className="guided flex flex-wrap items-end justify-between gap-3" style={at(0)}>
        <div className="flex min-w-0 items-center gap-4">
          {/* O orbe do guia: o humor mostra o dia (atraso = foco; tudo entregue = festa). Toque abre o guia. */}
          <button type="button" onClick={() => openGuide("dia")} aria-label="Abrir o guia do dia" className="relative size-14 shrink-0 rounded-full transition-transform hover:scale-105">
            <GuideOrb mood={mood} className="size-full" />
          </button>
          <div className="min-w-0">
          <p className="t-label first-letter:uppercase">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {helloFor(now)}, {getUser(meId).name}
          </h1>
          <p className="t-desc mt-1 text-sm">
            {day.focus ? (
              <>
                Foco de hoje: <span className="font-medium text-foreground">{day.focus}</span>
              </>
            ) : checkedIn ? (
              "Sem foco definido para hoje."
            ) : (
              "Faça o check-in para o time saber que você começou."
            )}
          </p>
          {progress.total > 0 && (
            <div className="mt-2 flex max-w-xs items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Entregas de hoje" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
                <div className={cn("h-full rounded-full transition-[width] duration-700", allDone ? "bg-success" : "bg-highlight")} style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
              <span className="tabular text-xs text-muted-foreground">
                <CountUp value={progress.done} /> de {progress.total} {allDone ? "· tudo entregue!" : "hoje"}
              </span>
            </div>
          )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!checkedIn ? (
            <Button onClick={() => openGuide("dia")}>
              <SunriseIcon /> Planejar meu dia
            </Button>
          ) : (
            !closed && (
              <Button variant="outline" onClick={() => openGuide("fechar")}>
                <MoonIcon /> Fechar o dia
              </Button>
            )
          )}
          <PageHelp page={PAGES[0]} />
        </div>
      </header>

      {day.noteFromYesterday && (
        <aside style={at(1)} className="guided flex gap-3 rounded-2xl border border-highlight/30 bg-highlight-soft px-4 py-3">
          <StickyNoteIcon className="mt-0.5 size-5 shrink-0 text-highlight" />
          <div>
            <p className="text-sm font-semibold">Sua nota de ontem</p>
            <p className="text-sm whitespace-pre-line">{day.noteFromYesterday}</p>
          </div>
        </aside>
      )}

      <div className="guided" style={at(2)}>
        <DailyCard />
      </div>
      <div className="guided empty:hidden" style={at(2)}>
        <WeeklyNudge />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <div className="guided" style={at(3)}>
            <DayPlanPanel day={day} />
          </div>
          <div className="guided" style={at(5)}>
            <WaitingForYou day={day} />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <div className="guided" style={at(4)}>
            <AgendaToday day={day} />
          </div>
          <div className="guided" style={at(6)}>
            <TeamNow />
          </div>
          <div className="guided" style={at(7)}>
            <InboxCounter count={day.inboxCount} />
          </div>
        </div>
      </div>

      <div className="guided" style={at(8)}>
        <SectorStepsPanel />
      </div>
    </div>
  )
}
