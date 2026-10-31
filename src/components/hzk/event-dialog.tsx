"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { AlertTriangleIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { EVENT_KINDS, conflictsFor, timeRange, type CalendarEvent, type EventKind } from "@/lib/domain/calendar"
import { uid } from "@/lib/format"
import { useCalendarEvents } from "@/lib/modules"
import { notify } from "@/lib/notifications"
import { useStore } from "@/lib/store"
import { useTeam } from "@/lib/use-team"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, SubmitRow, submitOnModEnter } from "@/components/shared/fields"

const DURATIONS = [15, 30, 45, 60, 90, 120]

/**
 * Agendar reunião (ou compromisso, foco, ausência). Antes de salvar, mostra quem já está ocupado
 * no horário (src/lib/domain/calendar.ts › conflictsFor). Participantes recebem um aviso.
 */
export function EventDialog({ event, defaultKind = "reuniao", open, onOpenChange }: { event?: CalendarEvent; defaultKind?: EventKind; open: boolean; onOpenChange: (o: boolean) => void }) {
  const meId = useStore((s) => s.meId)
  const team = useTeam()
  const events = useCalendarEvents((s) => s.items)
  const save = useCalendarEvents((s) => s.save)
  const remove = useCalendarEvents((s) => s.remove)

  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<EventKind>(defaultKind)
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"))
  const [time, setTime] = useState("10:00")
  const [minutes, setMinutes] = useState(60)
  const [endTime, setEndTime] = useState("18:00")
  const [people, setPeople] = useState<string[]>([])
  const [location, setLocation] = useState("")

  useEffect(() => {
    if (!open) return
    const start = event ? new Date(event.start) : null
    setTitle(event?.title ?? "")
    setKind(event?.kind ?? defaultKind)
    setDay(start ? format(start, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"))
    setTime(start ? format(start, "HH:mm") : "10:00")
    setMinutes(event ? Math.max(15, Math.round((+new Date(event.end) - +new Date(event.start)) / 60000)) : 60)
    setEndTime(event ? format(new Date(event.end), "HH:mm") : "18:00")
    setPeople(event?.participantIds ?? [])
    setLocation(event?.location ?? "")
  }, [open, event, defaultKind])

  const allDay = kind === "ausencia"
  const draft = useMemo(() => {
    const start = new Date(`${day}T${allDay ? "00:00" : time}:00`)
    const end = allDay ? new Date(`${day}T23:59:00`) : kind === "foco" || kind === "compromisso" ? new Date(`${day}T${endTime}:00`) : new Date(+start + minutes * 60000)
    return { id: event?.id ?? "novo", ownerId: event?.ownerId ?? meId, participantIds: kind === "reuniao" ? people : [], start: start.toISOString(), end: end.toISOString() }
  }, [day, time, minutes, endTime, kind, allDay, people, event, meId])
  const conflicts = useMemo(() => conflictsFor(draft, events), [draft, events])
  const invalid = +new Date(draft.end) <= +new Date(draft.start)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || invalid) return
    const saved: CalendarEvent = {
      id: event?.id ?? uid(),
      title: title.trim(),
      kind,
      start: draft.start,
      end: draft.end,
      ownerId: draft.ownerId,
      participantIds: draft.participantIds,
      location: location.trim() || undefined,
      createdBy: event?.createdBy ?? meId,
      createdAt: event?.createdAt ?? new Date().toISOString(),
    }
    save(saved)
    if (kind === "reuniao") notify(saved.participantIds, { kind: "mencao", title: `Reunião: ${saved.title} · ${format(new Date(saved.start), "dd/MM")} ${timeRange(saved)}`, href: "/equipe", fromId: meId })
    toast.success(event ? "Agenda atualizada" : kind === "reuniao" ? "Reunião agendada" : "Adicionado à agenda")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Editar agenda" : "Agendar"}</DialogTitle>
          <DialogDescription>Reuniões e compromissos mudam o status da pessoa sozinhos (ex.: “Em reunião até 15:00”).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo">
            {EVENT_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                title={k.hint}
                onClick={() => setKind(k.id)}
                className={cn("h-11 rounded-xl border text-sm font-medium", kind === k.id ? "border-brand bg-brand-soft text-brand" : "bg-card text-muted-foreground")}
              >
                {k.label}
              </button>
            ))}
          </div>
          <Field label="Título" htmlFor="ev-title">
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "reuniao" ? "Ex.: Alinhamento do lançamento" : kind === "ausencia" ? "Ex.: Folga" : "Ex.: Reunião com cliente"} autoFocus maxLength={120} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Dia" htmlFor="ev-day">
              <Input id="ev-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </Field>
            {!allDay && (
              <Field label="Começa" htmlFor="ev-time">
                <Input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            )}
            {kind === "reuniao" ? (
              <Field label="Duração" htmlFor="ev-dur">
                <select id="ev-dur" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} h`}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              !allDay && (
                <Field label="Termina" htmlFor="ev-end">
                  <Input id="ev-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </Field>
              )
            )}
          </div>

          {kind === "reuniao" && (
            <Field label="Quem participa">
              <div className="flex flex-wrap gap-2">
                {team
                  .filter((u) => u.id !== draft.ownerId)
                  .map((u) => {
                    const on = people.includes(u.id)
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setPeople(on ? people.filter((x) => x !== u.id) : [...people, u.id])}
                        className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm", on ? "border-brand bg-brand-soft font-medium text-brand" : "bg-card text-muted-foreground")}
                      >
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: u.color }} />
                        {u.name}
                      </button>
                    )
                  })}
              </div>
            </Field>
          )}
          {(kind === "reuniao" || kind === "compromisso") && (
            <Field label="Local ou link" htmlFor="ev-loc">
              <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sala, endereço ou link do Meet/Zoom" />
            </Field>
          )}

          {invalid && <p className="text-sm text-danger">O fim precisa ser depois do começo.</p>}
          {conflicts.length > 0 && !invalid && (
            <div className="grid gap-1 rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-warning">
                <AlertTriangleIcon className="size-4" /> Conflito de horário
              </p>
              {conflicts.map((c) => (
                <p key={`${c.memberId}:${c.event.id}`}>
                  {getUser(c.memberId).name} já está em “{c.event.title}” ({timeRange(c.event)}).
                </p>
              ))}
              <p className="t-desc text-xs">Dá para salvar assim mesmo, se for de propósito.</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            {event && (
              <Button
                type="button"
                variant="ghost"
                className="text-danger"
                onClick={() => {
                  const removed = remove(event.id)
                  toast.success("Removido da agenda", { action: removed ? { label: "Desfazer", onClick: () => save(removed) } : undefined })
                  onOpenChange(false)
                }}
              >
                Remover
              </Button>
            )}
            <div className="flex-1">
              <SubmitRow onCancel={() => onOpenChange(false)} submitLabel={kind === "reuniao" ? "Agendar reunião" : "Salvar"} disabled={!title.trim() || invalid} />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
