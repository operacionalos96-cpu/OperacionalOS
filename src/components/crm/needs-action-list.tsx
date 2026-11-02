"use client"

import { useState } from "react"
import Link from "next/link"
import { MessageCircleIcon, PartyPopperIcon } from "lucide-react"
import { stageLabel } from "@/lib/domain/constants"
import type { Lead } from "@/lib/domain/types"
import { DELAY_BANDS, delayBand, delayHistogram } from "@/lib/domain/rules"
import { followupDays, followupsDue } from "@/lib/domain/funnel"
import { useFunnel } from "@/lib/funnel-store"
import { money } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { FollowUpChip, TemperatureDot } from "./lead-card"

/**
 * "Precisa de ação": só os follow-ups do funil que venceram (hoje ou atrasados), a mesma regra do
 * selo dos cards e da aba Funil da Prospecção. Agrupada por faixa de atraso (30+, 15–29, até 14),
 * com um histograma que filtra ao clicar. O avatar só aparece em "Todos".
 */
export function NeedsActionList({ leads, showOwner = true }: { leads: Lead[]; showOwner?: boolean }) {
  const now = new Date()
  const steps = useFunnel((s) => s.steps)
  const items = followupsDue(leads, steps, now).map((i) => ({ ...i, days: followupDays(i.dueAt, now) }))
  const [bin, setBin] = useState<string | null>(null)
  const hist = delayHistogram(items.map((i) => i.days))
  const max = Math.max(1, ...hist.map((h) => h.count))
  const active = hist.find((h) => h.id === bin)
  const shown = active ? items.filter((i) => i.days >= active.min && i.days <= active.max) : items

  if (items.length === 0) {
    return <EmptyState icon={PartyPopperIcon} title="Nenhum follow-up para hoje" description="Quando um follow-up do funil vencer, o lead aparece aqui." className="py-20" />
  }

  return (
    <div className="page-body flex flex-col gap-6">
      {/* Histograma: quão atrasado está o follow-up? Clique numa barra para filtrar. */}
      <div className="flex items-end gap-3 rounded-2xl border bg-card p-4">
        <p className="t-label mr-2 self-start">Dias de atraso</p>
        {hist.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-pressed={bin === h.id}
            onClick={() => setBin(bin === h.id ? null : h.id)}
            className={cn("group flex w-16 flex-col items-center gap-1 rounded-lg p-1 text-xs transition-colors hover:bg-accent", bin === h.id && "bg-foreground/10")}
          >
            <span className="tabular font-semibold">{h.count}</span>
            <span className="flex h-12 w-6 items-end">
              <span
                className={cn("grow-y w-full rounded-t", h.min >= 30 ? "bg-danger" : h.min >= 15 ? "bg-warning" : "bg-foreground/30")}
                style={{ height: `${Math.max(4, (h.count / max) * 100)}%` }}
              />
            </span>
            <span className="text-muted-foreground">{h.label}</span>
          </button>
        ))}
        {bin && (
          <button type="button" onClick={() => setBin(null)} className="action-link ml-auto self-start text-xs">
            Limpar filtro
          </button>
        )}
      </div>

      {DELAY_BANDS.map((g) => {
        const groupItems = shown.filter((i) => delayBand(i.days) === g.id).sort((a, b) => b.days - a.days)
        if (groupItems.length === 0) return null
        return (
          <section key={g.id}>
            <h2 className={cn("sticky top-0 z-10 mb-2 bg-background/90 py-1 text-sm font-semibold backdrop-blur", g.id === "30+" ? "text-danger" : g.id === "15-29" ? "text-warning" : "text-foreground")}>
              {g.label} · {groupItems.length}
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {groupItems.map(({ lead, index, total, step }) => (
                <li key={lead.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                  <Link href={`/pipeline/${lead.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    {showOwner && <UserAvatar userId={lead.ownerId} size="md" />}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <TemperatureDot lead={lead} />
                        <span className="truncate">{lead.name}</span>
                        <span className="truncate font-normal text-muted-foreground">· {stageLabel(lead.stage)}</span>
                        <FollowUpChip lead={lead} now={now} />
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        Passo {index + 1} de {total}: {step.label}
                      </p>
                    </div>
                    <span className="tabular hidden shrink-0 text-right text-sm font-semibold sm:block">{money(lead.valueCents)}</span>
                  </Link>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link href="/prospeccao?aba=funil">
                      <MessageCircleIcon /> Mandar no Funil
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
