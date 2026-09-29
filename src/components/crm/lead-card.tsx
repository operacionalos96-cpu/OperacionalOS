"use client"

import { AlertTriangleIcon, ClockIcon } from "lucide-react"
import { TEMPERATURES, isOpenStage } from "@/lib/domain/constants"
import type { Lead } from "@/lib/domain/types"
import { daysSince, leadUrgency } from "@/lib/domain/rules"
import { dueLabel, money } from "@/lib/format"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/shared/user-avatar"

export function TemperatureDot({ lead, className }: { lead: Lead; className?: string }) {
  const t = TEMPERATURES.find((t) => t.id === lead.temperature)
  if (!t) return null
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", t.dot, className)} title={t.label} />
}

/** Card compacto do kanban. Urgência sempre visível; nada de campos extras. */
export function LeadCard({ lead, dragging = false }: { lead: Lead; dragging?: boolean }) {
  const now = new Date()
  const urgency = leadUrgency(lead, now)
  const open = isOpenStage(lead.stage)

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-3 text-left shadow-xs transition-shadow hover:border-foreground/20 hover:shadow-sm",
        urgency === "vencida" && "border-l-[3px] border-l-red-500",
        urgency === "parado" && "border-l-[3px] border-l-amber-400",
        dragging && "rotate-1 shadow-lg ring-1 ring-foreground/10",
        !open && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <TemperatureDot lead={lead} />
            <span className="truncate">{lead.name}</span>
          </p>
          {lead.company && <p className="truncate text-xs text-muted-foreground">{lead.company}</p>}
        </div>
        <UserAvatar userId={lead.ownerId} />
      </div>

      <p className="tabular mt-2 text-sm font-semibold">{money(lead.valueCents)}</p>

      {open ? (
        <div className="mt-2 border-t pt-2">
          <p className="line-clamp-2 text-xs leading-snug">{lead.nextAction.text}</p>
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-[11px] font-medium",
              urgency === "vencida" ? "text-red-600" : urgency === "hoje" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <ClockIcon className="size-3" />
            {dueLabel(lead.nextAction.dueDate, now)}
            {urgency === "parado" && (
              <span className="ml-auto flex items-center gap-1 rounded bg-amber-500/10 px-1 py-px text-amber-700">
                <AlertTriangleIcon className="size-3" /> parado há {daysSince(lead.lastActivityAt, now)}d
              </span>
            )}
          </p>
        </div>
      ) : (
        lead.lostReason && <p className="mt-1 truncate text-xs text-muted-foreground">{lead.lostReason}</p>
      )}
    </div>
  )
}
