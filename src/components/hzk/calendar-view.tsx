"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarPlusIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { agendaEntries, lanes, type AgendaEntry } from "@/lib/domain/agenda"
import { EVENT_KINDS, type CalendarEvent } from "@/lib/domain/calendar"
import { useCalendarEvents, useContentItems } from "@/lib/modules"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { useAreaList } from "@/lib/use-hzk"
import { useTeam } from "@/lib/use-team"
import { useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { EventDialog } from "./event-dialog"

type View = "dia" | "semana" | "mes"
const FIRST_HOUR = 7
const LAST_HOUR = 22
const HOUR_PX = 48

const TONE: Record<string, string> = {
  reuniao: "border-l-warning bg-warning-soft",
  compromisso: "border-l-chart-out bg-muted",
  foco: "border-l-brand bg-brand-soft",
  ausencia: "border-l-muted-foreground bg-muted",
  tarefa: "border-l-foreground/40 bg-background",
  conteudo: "border-l-highlight bg-highlight-soft",
}
const toneOf = (e: AgendaEntry) => TONE[e.source === "evento" ? e.kind! : e.source]

/**
 * Calendário do time (página Agenda): Dia, Semana e Mês, com filtro por pessoa. Mostra a agenda
 * (calendar_events) e os prazos de tarefas e conteúdos (src/lib/domain/agenda.ts). Clicar num
 * horário vazio agenda; clicar num item abre o detalhe.
 */
export function CalendarView() {
  const router = useRouter()
  const team = useTeam()
  const events = useCalendarEvents((s) => s.items)
  const tasks = useStore((s) => s.tasks)
  const content = useContentItems((s) => s.items)
  const [view, setView] = useState<View>("semana")
  const [anchor, setAnchor] = useState(() => new Date())
  const [person, setPerson] = useState<string>("")
  const [editing, setEditing] = useState<{ event?: CalendarEvent; start?: Date } | null>(null)

  const range = useMemo(() => {
    if (view === "dia") return [anchor, anchor] as const
    if (view === "semana") return [startOfWeek(anchor, { weekStartsOn: 1 }), endOfWeek(anchor, { weekStartsOn: 1 })] as const
    return [startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })] as const
  }, [view, anchor])
  const entries = useMemo(() => agendaEntries(range[0], range[1], { events, tasks, content }, person || undefined), [range, events, tasks, content, person])
  const days = eachDayOfInterval({ start: range[0], end: range[1] })

  const move = (dir: 1 | -1) => setAnchor((a) => (view === "dia" ? addDays(a, dir) : view === "semana" ? addWeeks(a, dir) : addMonths(a, dir)))
  const title =
    view === "dia"
      ? format(anchor, "EEEE, d 'de' MMMM", { locale: ptBR })
      : view === "semana"
        ? `${format(range[0], "d MMM", { locale: ptBR })} – ${format(range[1], "d MMM yyyy", { locale: ptBR })}`
        : format(anchor, "MMMM 'de' yyyy", { locale: ptBR })

  function open(e: AgendaEntry) {
    if (e.source === "evento") setEditing({ event: events.find((x) => x.id === e.refId) })
    else if (e.source === "tarefa") useUI.getState().set({ taskDetail: e.refId })
    else router.push("/conteudos")
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "dia", label: "Dia" },
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mês" },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="Anterior">
            <ChevronLeftIcon />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>
            Hoje
          </Button>
          <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="Próximo">
            <ChevronRightIcon />
          </Button>
        </div>
        <p className="font-semibold first-letter:uppercase">{title}</p>
        <div className="ml-auto flex items-center gap-2">
          <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Pessoa" className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">Todo o time</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button onClick={() => setEditing({})}>
            <CalendarPlusIcon /> Agendar
          </Button>
        </div>
      </div>

      <Legend />

      {view === "mes" ? (
        <MonthGrid days={days} anchor={anchor} entries={entries} onOpen={open} onDay={(d) => (setAnchor(d), setView("dia"))} />
      ) : (
        <TimeGrid days={days} entries={entries} onOpen={open} onSlot={(start) => setEditing({ start })} />
      )}

      {editing && <EventDialog event={editing.event} defaultStart={editing.start} open onOpenChange={(o) => !o && setEditing(null)} />}
    </div>
  )
}

function Legend() {
  const items = [...EVENT_KINDS.map((k) => ({ id: k.id, label: k.label })), { id: "tarefa", label: "Prazo de tarefa" }, { id: "conteudo", label: "Prazo de conteúdo" }]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-sm border-l-4", TONE[i.id])} /> {i.label}
        </li>
      ))}
    </ul>
  )
}

/** Dia e Semana: grade de horas; eventos com hora posicionados, sobrepostos lado a lado. */
function TimeGrid({ days, entries, onOpen, onSlot }: { days: Date[]; entries: AgendaEntry[]; onOpen: (e: AgendaEntry) => void; onSlot: (start: Date) => void }) {
  const now = useMinute()
  const areas = useAreaList()
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)
  const top = (d: Date) => ((d.getHours() + d.getMinutes() / 60 - FIRST_HOUR) * HOUR_PX)
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <div className="min-w-[640px]" style={{ display: "grid", gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div className="border-b" />
        {days.map((d) => (
          <div key={+d} className={cn("border-b border-l px-2 py-2 text-center", isSameDay(d, now) && "bg-highlight-soft")}>
            <p className="text-xs text-muted-foreground first-letter:uppercase">{format(d, "EEE", { locale: ptBR })}</p>
            <p className={cn("text-lg font-semibold", isSameDay(d, now) && "text-highlight")}>{format(d, "d")}</p>
          </div>
        ))}
        {/* Dia todo: ausências e prazos */}
        <div className="border-b px-1 py-1 text-right text-[11px] text-muted-foreground">dia todo</div>
        {days.map((d) => (
          <div key={+d} className="grid content-start gap-1 border-b border-l p-1">
            {entries
              .filter((e) => e.allDay && e.day === format(d, "yyyy-MM-dd"))
              .map((e) => (
                <Chip key={e.key} entry={e} onOpen={onOpen} />
              ))}
          </div>
        ))}
        <div className="relative">
          {hours.map((h) => (
            <div key={h} className="pr-1 text-right text-[11px] text-muted-foreground" style={{ height: HOUR_PX }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayKey = format(d, "yyyy-MM-dd")
          const placed = lanes(entries.filter((e) => e.day === dayKey))
          return (
            <div key={+d} className="relative border-l" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`Agendar ${format(d, "dd/MM")} às ${h}:00`}
                  onClick={() => onSlot(new Date(`${dayKey}T${String(h).padStart(2, "0")}:00:00`))}
                  className="block w-full border-b border-dashed border-border/60 hover:bg-accent/40"
                  style={{ height: HOUR_PX }}
                />
              ))}
              {placed.map(({ entry: e, lane, lanes: n }) => {
                const area = e.areaId && areas.find((a) => a.id === e.areaId)
                const y = Math.max(0, top(e.start!))
                const h = Math.max(20, top(e.end!) - y)
                return (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => onOpen(e)}
                    className={cn("absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs shadow-sm hover:brightness-95", toneOf(e))}
                    style={{ top: y, height: h, left: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
                  >
                    <span className="tabular block font-semibold">{format(e.start!, "HH:mm")}</span>
                    <span className="block truncate">{e.title}</span>
                    {area && <span className="block truncate text-muted-foreground">Sessão {area.name}</span>}
                  </button>
                )
              })}
              {isSameDay(d, now) && now.getHours() >= FIRST_HOUR && now.getHours() < LAST_HOUR && (
                <div className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: top(now) }} aria-hidden>
                  <span className="-ml-1 size-2 rounded-full bg-highlight" />
                  <span className="h-px flex-1 bg-highlight" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Mês: grade de dias com até 3 itens por dia; clicar no número abre o dia. */
function MonthGrid({ days, anchor, entries, onOpen, onDay }: { days: Date[]; anchor: Date; entries: AgendaEntry[]; onOpen: (e: AgendaEntry) => void; onDay: (d: Date) => void }) {
  const now = useMinute()
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <div className="grid min-w-[640px] grid-cols-7">
        {days.slice(0, 7).map((d) => (
          <p key={+d} className="border-b px-2 py-1.5 text-xs font-medium text-muted-foreground first-letter:uppercase">
            {format(d, "EEE", { locale: ptBR })}
          </p>
        ))}
        {days.map((d) => {
          const list = entries.filter((e) => e.day === format(d, "yyyy-MM-dd"))
          return (
            <div key={+d} className={cn("min-h-24 border-b border-l p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0", !isSameMonth(d, anchor) && "bg-muted/40")}>
              <button type="button" onClick={() => onDay(d)} className={cn("mb-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold hover:bg-accent", isSameDay(d, now) && "bg-highlight text-white hover:bg-highlight")}>
                {format(d, "d")}
              </button>
              <div className="grid gap-0.5">
                {list.slice(0, 3).map((e) => (
                  <Chip key={e.key} entry={e} onOpen={onOpen} />
                ))}
                {list.length > 3 && (
                  <button type="button" onClick={() => onDay(d)} className="px-1 text-left text-[11px] font-medium text-brand">
                    + {list.length - 3}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ entry: e, onOpen }: { entry: AgendaEntry; onOpen: (e: AgendaEntry) => void }) {
  return (
    <button type="button" onClick={() => onOpen(e)} className={cn("block w-full truncate rounded border-l-4 px-1 py-px text-left text-[11px]", toneOf(e), e.done && "line-through opacity-60")}>
      {e.start && !e.allDay && <span className="tabular font-semibold">{format(e.start, "HH:mm")} </span>}
      {e.title}
    </button>
  )
}
