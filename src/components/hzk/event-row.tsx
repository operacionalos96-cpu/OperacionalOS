"use client"

import { MapPinIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { EVENT_KINDS, peopleOf, timeRange, type CalendarEvent } from "@/lib/domain/calendar"
import { cn } from "@/lib/utils"
const KIND_STYLE: Record<CalendarEvent["kind"], string> = {
  reuniao: "border-l-warning",
  compromisso: "border-l-chart-out",
  foco: "border-l-brand",
  ausencia: "border-l-muted-foreground",
}
const kindLabel = (k: CalendarEvent["kind"]) => EVENT_KINDS.find((x) => x.id === k)?.label

/** Um evento da agenda numa linha (página da pessoa). */
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
