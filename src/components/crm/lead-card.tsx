"use client"

import { MessageCircleIcon } from "lucide-react"
import { TEMPERATURES, isOpenStage } from "@/lib/domain/constants"
import type { Lead } from "@/lib/domain/types"
import { delayTone } from "@/lib/domain/rules"
import { followupDays, followupDue } from "@/lib/domain/funnel"
import { useFunnel } from "@/lib/funnel-store"
import { dueLabel, moneyCompact } from "@/lib/format"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/shared/user-avatar"

export function TemperatureDot({ lead, className }: { lead: Lead; className?: string }) {
  const t = TEMPERATURES.find((t) => t.id === lead.temperature)
  if (!t) return null
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", t.dot, className)} title={`Temperatura: ${t.label}`} />
}

/**
 * No quadro, o único alerta é o follow-up do funil que venceu (hoje ou atrasado). Próxima ação
 * vencida e lead parado não marcam o card, e a aba "Precisa de ação" também é só de follow-ups.
 */
export function FollowUpChip({ lead, now }: { lead: Lead; now: Date }) {
  const steps = useFunnel((s) => s.steps)
  const due = followupDue(lead, steps, now)
  if (!due) return null
  const days = followupDays(due.dueAt, now)
  const tone = delayTone(days)
  return (
    <span
      className={cn(
        "tabular shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold",
        tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-highlight-soft text-highlight",
      )}
      title={`Follow-up ${due.index + 1}/${due.total} (${due.step.label}) ${days ? `atrasado há ${days} dia${days > 1 ? "s" : ""}` : "para hoje"}`}
    >
      Follow-up {days ? `· ${days}d` : "hoje"}
    </span>
  )
}

/**
 * Card compacto do quadro (Briefing UI/UX): nome, segmento, valor à direita e avatar; a próxima ação
 * numa linha cinza com o atraso em chip. O avatar some quando o filtro já é "Meus".
 */
export function LeadCard({ lead, dragging = false, showOwner = true }: { lead: Lead; dragging?: boolean; showOwner?: boolean }) {
  const now = new Date()
  const open = isOpenStage(lead.stage)

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card p-3.5 text-left shadow-card transition-[box-shadow,border-color,translate] duration-(--dur-1) hover:-translate-y-px hover:border-foreground/20",
        dragging && "rotate-[1.5deg] shadow-lift ring-1 ring-foreground/10",
        !open && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <TemperatureDot lead={lead} />
            <span className="truncate">{lead.name}</span>
          </p>
          {(lead.company || lead.segment) && <p className="truncate text-xs text-muted-foreground">{[lead.company, lead.segment].filter(Boolean).join(" · ")}</p>}
        </div>
        <span className="tabular shrink-0 text-sm font-semibold">{moneyCompact(lead.valueCents)}</span>
      </div>

      {open ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircleIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {lead.nextAction.text} · {dueLabel(lead.nextAction.dueDate, now)}
          </span>
          <FollowUpChip lead={lead} now={now} />
          {showOwner && <UserAvatar userId={lead.ownerId} />}
        </p>
      ) : (
        lead.lostReason && <p className="mt-1 truncate text-xs text-muted-foreground">{lead.lostReason}</p>
      )}
    </div>
  )
}
