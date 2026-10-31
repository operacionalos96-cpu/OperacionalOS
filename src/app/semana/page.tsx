"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { addDays, addWeeks, format, getDay, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, HandHelpingIcon, OctagonAlertIcon, ScaleIcon, TargetIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { minutesText } from "@/lib/domain/work-sessions"
import { missingCheckins, weekOf, weekSummary, type PersonWeek } from "@/lib/domain/weekly"
import { useCheckins, useDailyPlans } from "@/lib/modules"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { useAreaList } from "@/lib/use-hzk"
import { useTeam } from "@/lib/use-team"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { PresenceBadge } from "@/components/hzk/presence-badge"
import { WeeklyCheckinCard } from "@/components/hzk/weekly-checkin"

/**
 * Semana do time (ADR 0011): o foco de segunda, a retrospectiva de sexta e o que cada um fez,
 * lado a lado. É a reunião de status, sem reunião.
 */
export default function WeekPage() {
  const meId = useStore((s) => s.meId)
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const plans = useDailyPlans((s) => s.items)
  const checkins = useCheckins((s) => s.items)
  const team = useTeam()
  const now = useMinute()
  const [week, setWeek] = useState(() => weekOf(new Date()))
  const current = week === weekOf(now)
  const summary = useMemo(() => weekSummary(team.map((u) => u.id), week, { tasks, items, plans, checkins }, now), [team, week, tasks, items, plans, checkins, now])
  const missingMonday = missingCheckins(summary, "segunda")
  const fridayOpen = !current || getDay(now) === 5 || getDay(now) === 6 || getDay(now) === 0
  const missingFriday = fridayOpen ? missingCheckins(summary, "sexta") : []
  const mine = summary.find((p) => p.memberId === meId)
  const names = (ids: string[]) => ids.map((id) => getUser(id).name).join(", ")

  return (
    <div className="flex flex-col">
      <PageHeader page="/semana" />
      <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="ghost" aria-label="Semana anterior" onClick={() => setWeek(format(addWeeks(parseISO(week), -1), "yyyy-MM-dd"))}>
            <ChevronLeftIcon />
          </Button>
          <p className="font-semibold">
            {format(parseISO(week), "d 'de' MMM", { locale: ptBR })} – {format(addDays(parseISO(week), 6), "d 'de' MMM", { locale: ptBR })}
            {current && <span className="ml-2 text-xs font-normal text-muted-foreground">esta semana</span>}
          </p>
          <Button size="icon" variant="ghost" aria-label="Próxima semana" onClick={() => setWeek(format(addWeeks(parseISO(week), 1), "yyyy-MM-dd"))} disabled={current}>
            <ChevronRightIcon />
          </Button>
          {!current && (
            <Button size="sm" variant="outline" onClick={() => setWeek(weekOf(new Date()))}>
              Esta semana
            </Button>
          )}
        </div>

        {(missingMonday.length > 0 || missingFriday.length > 0) && (
          <p className="rounded-xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
            {missingMonday.length > 0 && <>Sem foco da semana: {names(missingMonday)}. </>}
            {missingFriday.length > 0 && <>Sem retrospectiva de sexta: {names(missingFriday)}.</>}
          </p>
        )}

        {current && mine && (!mine.monday || (fridayOpen && !mine.friday)) && (
          <WeeklyCheckinCard kind={!mine.monday ? "segunda" : "sexta"} className="max-w-xl" />
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {summary.map((p, i) => (
            <PersonColumn key={p.memberId} p={p} index={i} fridayOpen={fridayOpen} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PersonColumn({ p, index, fridayOpen }: { p: PersonWeek; index: number; fridayOpen: boolean }) {
  const areas = useAreaList()
  const user = getUser(p.memberId)
  const byArea = Object.entries(p.minutesByArea).sort((a, b) => b[1] - a[1])
  return (
    <section className="guided flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card" style={{ "--i": index } as React.CSSProperties}>
      <header className="flex items-center gap-3">
        <UserAvatar userId={p.memberId} />
        <div className="min-w-0">
          <Link href={`/equipe/${p.memberId}`} className="font-semibold hover:underline">
            {user.name}
          </Link>
          <PresenceBadge memberId={p.memberId} className="block" />
        </div>
      </header>

      <Block icon={TargetIcon} title="Foco da semana">
        {p.monday?.focus?.length ? (
          <ol className="grid list-decimal gap-0.5 pl-5 text-sm">
            {p.monday.focus.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        ) : (
          <Empty>Ainda não respondeu.</Empty>
        )}
      </Block>

      {p.friday ? (
        <>
          {p.friday.shipped && (
            <Block icon={CircleCheckIcon} title="O que saiu" tone="text-success">
              <p className="text-sm whitespace-pre-line">{p.friday.shipped}</p>
            </Block>
          )}
          {p.friday.blocked && (
            <Block icon={OctagonAlertIcon} title="O que travou" tone="text-warning">
              <p className="text-sm whitespace-pre-line">{p.friday.blocked}</p>
            </Block>
          )}
          {p.friday.needs && (
            <Block icon={HandHelpingIcon} title="Precisa de alguém" tone="text-highlight">
              <p className="text-sm whitespace-pre-line">{p.friday.needs}</p>
              {!!p.friday.needsFrom?.length && <p className="text-xs text-muted-foreground">De: {p.friday.needsFrom.map((id) => getUser(id).name).join(", ")}</p>}
            </Block>
          )}
        </>
      ) : (
        <Block icon={CircleCheckIcon} title="Sexta">
          <Empty>{fridayOpen ? "Ainda não respondeu." : "A retrospectiva aparece aqui na sexta."}</Empty>
        </Block>
      )}

      <Block icon={CircleCheckIcon} title={`Feito na semana · ${p.done.length}`}>
        {p.done.length ? (
          <ul className="grid gap-0.5 text-sm">
            {p.done.slice(0, 6).map((t) => (
              <li key={t.id} className="truncate">
                {t.title}
              </li>
            ))}
            {p.done.length > 6 && <li className="text-xs text-muted-foreground">+ {p.done.length - 6}</li>}
          </ul>
        ) : (
          <Empty>Nenhuma tarefa concluída ainda.</Empty>
        )}
        {p.decided.length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <ScaleIcon className="size-3.5" /> {p.decided.length} {p.decided.length === 1 ? "decisão tomada" : "decisões tomadas"}
          </p>
        )}
      </Block>

      {p.minutes > 0 && (
        <Block icon={TargetIcon} title={`Tempo marcado · ${minutesText(p.minutes)}`}>
          <ul className="grid gap-1.5">
            {byArea.map(([areaId, min]) => (
              <li key={areaId} className="grid gap-0.5 text-xs">
                <span className="flex justify-between">
                  <span>{areas.find((a) => a.id === areaId)?.name ?? "Sem área"}</span>
                  <span className="tabular text-muted-foreground">{minutesText(min)}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="grow-x block h-full rounded-full bg-highlight" style={{ width: `${(min / p.minutes) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </section>
  )
}

function Block({ icon: Icon, title, tone, children }: { icon: typeof TargetIcon; title: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className={`size-3.5 ${tone ?? ""}`} /> {title}
      </p>
      {children}
    </div>
  )
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="t-desc text-sm">{children}</p>
