"use client"

import Link from "next/link"
import { addDays } from "date-fns"
import { toast } from "sonner"
import { CheckIcon, PartyPopperIcon, TimerIcon } from "lucide-react"
import { stageLabel } from "@/lib/domain/constants"
import type { Lead } from "@/lib/domain/types"
import { type LeadUrgency, daysSince, leadsNeedingAction } from "@/lib/domain/rules"
import { dueLabel, money, toDateKey } from "@/lib/format"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { TemperatureDot } from "./lead-card"

const GROUPS: { id: LeadUrgency; label: string; hint: string; tone: string }[] = [
  { id: "vencida", label: "Ação vencida", hint: "O próximo passo já passou da data", tone: "text-red-600" },
  { id: "hoje", label: "Para hoje", hint: "Próximo passo marcado para hoje", tone: "text-foreground" },
  { id: "parado", label: "Parados", hint: "Sem nenhuma atividade há 7 dias ou mais", tone: "text-amber-700" },
]

export function NeedsActionList({ leads }: { leads: Lead[] }) {
  const now = new Date()
  const items = leadsNeedingAction(leads, now)

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PartyPopperIcon}
        title="Nenhum lead precisa de ação agora"
        description="Quando uma próxima ação vencer ou um lead ficar 7 dias sem atividade, ele aparece aqui."
        className="py-20"
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      {GROUPS.map((g) => {
        const groupItems = items.filter((i) => i.urgency === g.id)
        if (groupItems.length === 0) return null
        return (
          <section key={g.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className={cn("text-sm font-semibold", g.tone)}>
                {g.label} · {groupItems.length}
              </h2>
              <span className="text-xs text-muted-foreground">{g.hint}</span>
            </div>
            <ul className="divide-y rounded-xl border bg-card">
              {groupItems.map(({ lead }) => (
                <ActionRow key={lead.id} lead={lead} urgency={g.id} now={now} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function ActionRow({ lead, urgency, now }: { lead: Lead; urgency: LeadUrgency; now: Date }) {
  const updateLead = useStore((s) => s.updateLead)

  function postpone(days: number) {
    const previous = lead.nextAction
    const dueDate = toDateKey(addDays(now, days))
    updateLead(lead.id, { nextAction: { ...lead.nextAction, dueDate } })
    toast(`Adiado para ${dueLabel(dueDate)}`, {
      action: { label: "Desfazer", onClick: () => useStore.getState().updateLead(lead.id, { nextAction: previous }) },
    })
  }

  return (
    <li className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <Link href={`/pipeline/${lead.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar userId={lead.ownerId} size="md" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <TemperatureDot lead={lead} />
            <span className="truncate">{lead.name}</span>
            <span className="truncate font-normal text-muted-foreground">
              · {stageLabel(lead.stage)} · {money(lead.valueCents)}
            </span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            <span className="text-foreground">{lead.nextAction.text}</span> ·{" "}
            <span className={cn(urgency === "vencida" && "font-medium text-red-600")}>{dueLabel(lead.nextAction.dueDate, now)}</span>
            {urgency === "parado" && <span className="text-amber-700"> · sem atividade há {daysSince(lead.lastActivityAt, now)} dias</span>}
          </p>
        </div>
      </Link>
      <div className="flex shrink-0 gap-2 pl-10 sm:pl-0">
        {/* Adiar não resolve lead parado (só atividade resolve), então não é oferecido. */}
        {urgency !== "parado" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <TimerIcon /> Adiar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => postpone(1)}>Amanhã</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => postpone(3)}>Em 3 dias</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => postpone(7)}>Em 1 semana</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
        <Button size="sm" variant="outline" onClick={() => useUI.getState().set({ nextActionFor: lead.id })}>
          <CheckIcon /> Feito → próxima ação
        </Button>
      </div>
    </li>
  )
}
