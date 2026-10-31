"use client"

import { useMemo, useState } from "react"
import { addDays, format, isSameDay, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarPlusIcon, MapPinIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { EVENT_KINDS, eventsOfDay, peopleOf, timeRange, type CalendarEvent } from "@/lib/domain/calendar"
import { useCalendarEvents } from "@/lib/modules"
import { useTeam } from "@/lib/use-team"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { EmptyState } from "@/components/shared/layout"
import { EventDialog } from "./event-dialog"
import { PresenceBadge } from "./presence-badge"

const KIND_STYLE: Record<CalendarEvent["kind"], string> = {
  reuniao: "border-l-warning",
  compromisso: "border-l-chart-out",
  foco: "border-l-brand",
  ausencia: "border-l-muted-foreground",
}
const kindLabel = (k: CalendarEvent["kind"]) => EVENT_KINDS.find((x) => x.id === k)?.label

/** Agenda do time (Equipe › Agenda): hoje por pessoa, ou a semana inteira, e o botão de agendar. */
export function TeamAgenda() {
  const team = useTeam()
  const events = useCalendarEvents((s) => s.items)
  const [view, setView] = useState<"hoje" | "semana">("hoje")
  const [editing, setEditing] = useState<CalendarEvent | "novo" | null>(null)
  const today = new Date()
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(today, { weekStartsOn: 1 }), i)), [today.toDateString()]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "hoje", label: "Hoje" },
            { value: "semana", label: "Semana" },
          ]}
        />
        <Button onClick={() => setEditing("novo")}>
          <CalendarPlusIcon /> Agendar reunião
        </Button>
      </div>

      {events.length === 0 && (
        <EmptyState
          icon={CalendarPlusIcon}
          title="Agenda vazia"
          description="Agende reuniões do time e marque compromissos, foco e folgas: o status de cada pessoa passa a mudar sozinho."
          action={<Button onClick={() => setEditing("novo")}>Agendar reunião</Button>}
          className="py-12"
        />
      )}

      {events.length > 0 && view === "hoje" && (
        <div className="grid gap-3 lg:grid-cols-2">
          {team.map((u) => {
            const list = eventsOfDay(u.id, events, today)
            return (
              <section key={u.id} className="rounded-2xl border bg-card p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-semibold">{u.name}</p>
                  <PresenceBadge memberId={u.id} />
                </div>
                {list.length ? (
                  <ul className="grid gap-2">{list.map((e) => <EventRow key={e.id} event={e} onOpen={() => setEditing(e)} />)}</ul>
                ) : (
                  <p className="t-desc text-sm">Nada na agenda hoje.</p>
                )}
              </section>
            )
          })}
        </div>
      )}

      {events.length > 0 && view === "semana" && (
        <div className="grid gap-3">
          {week.map((d) => {
            const list = events.filter((e) => isSameDay(new Date(e.start), d)).sort((a, b) => a.start.localeCompare(b.start))
            return (
              <section key={d.toISOString()} className={cn("rounded-2xl border bg-card p-4 shadow-card", isSameDay(d, today) && "border-brand/50")}>
                <p className="mb-2 text-sm font-semibold first-letter:uppercase">{format(d, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
                {list.length ? (
                  <ul className="grid gap-2">{list.map((e) => <EventRow key={e.id} event={e} onOpen={() => setEditing(e)} showPeople />)}</ul>
                ) : (
                  <p className="t-desc text-sm">Livre.</p>
                )}
              </section>
            )
          })}
        </div>
      )}

      {editing && <EventDialog event={editing === "novo" ? undefined : editing} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  )
}

export function EventRow({ event, onOpen, showPeople }: { event: CalendarEvent; onOpen?: () => void; showPeople?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn("grid w-full gap-0.5 rounded-lg border border-l-4 bg-background px-3 py-2 text-left text-sm hover:bg-accent", KIND_STYLE[event.kind])}>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="tabular font-semibold">{event.kind === "ausencia" ? "Dia todo" : timeRange(event)}</span>
          <span className="font-medium">{event.title}</span>
          <span className="text-xs text-muted-foreground">· {kindLabel(event.kind)}</span>
        </span>
        {(showPeople || event.location) && (
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            {showPeople && <span>{peopleOf(event).map((id) => getUser(id).name).join(", ")}</span>}
            {event.location && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="size-3" /> {event.location}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  )
}
