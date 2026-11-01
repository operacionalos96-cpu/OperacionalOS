"use client"

import { TEMPERATURES, isOpenStage } from "@/lib/domain/constants"
import type { Lead } from "@/lib/domain/types"
import { delayTone, leadDelayDays, leadUrgency } from "@/lib/domain/rules"
import { dueLabel, moneyCompact } from "@/lib/format"
import { cn } from "@/lib/utils"
import { UserAvatar } from "@/components/shared/user-avatar"

export function TemperatureDot({ lead, className }: { lead: Lead; className?: string }) {
  const t = TEMPERATURES.find((t) => t.id === lead.temperature)
  if (!t) return null
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", t.dot, className)} title={`Temperatura: ${t.label}`} />
}

/** Atraso como chip pequeno (âmbar 7–29 dias, vermelho 30+), nunca a borda do card inteira. */
export function DelayChip({ lead, now }: { lead: Lead; now: Date }) {
  const days = leadDelayDays(lead, now)
  if (!days) return null
  const tone = delayTone(days)
  return (
    <span
      className={cn(
        "tabular shrink-0 rounded px-1 py-px text-[11px] font-medium",
        tone === "danger" ? "bg-danger-soft text-danger" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
      )}
      title={leadUrgency(lead, now) === "parado" ? "Dias sem atividade" : "Dias com a próxima ação vencida"}
    >
      {days}d
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
        "group rounded-lg border bg-card p-2.5 text-left shadow-xs transition-[box-shadow,border-color] duration-(--dur-1) hover:border-foreground/20 hover:shadow-sm",
        dragging && "rotate-[1.5deg] shadow-lift ring-1 ring-foreground/10",
        !open && "opacity-80",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TemperatureDot lead={lead} />
            <span className="truncate">{lead.name}</span>
          </p>
          {(lead.company || lead.segment) && <p className="truncate text-xs text-muted-foreground">{[lead.company, lead.segment].filter(Boolean).join(" · ")}</p>}
        </div>
        <span className="tabular shrink-0 text-sm font-semibold">{moneyCompact(lead.valueCents)}</span>
      </div>

      {open ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            {lead.nextAction.text} · {dueLabel(lead.nextAction.dueDate, now)}
          </span>
          <DelayChip lead={lead} now={now} />
          {showOwner && <UserAvatar userId={lead.ownerId} />}
        </p>
      ) : (
        lead.lostReason && <p className="mt-1 truncate text-xs text-muted-foreground">{lead.lostReason}</p>
      )}
    </div>
  )
}
