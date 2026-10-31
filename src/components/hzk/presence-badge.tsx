"use client"

import { PRESENCE, presenceText } from "@/lib/domain/presence"
import { usePresence } from "@/lib/presence"
import { cn } from "@/lib/utils"

const DOT: Record<(typeof PRESENCE)[keyof typeof PRESENCE]["tone"], string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  brand: "bg-brand",
  success: "bg-success",
  info: "bg-chart-in",
  muted: "bg-muted-foreground/50",
}

/** Status de uma pessoa: bolinha + texto ("Em reunião até 15:00"). Nunca só a cor. */
export function PresenceBadge({ memberId, className, showDetail }: { memberId: string; className?: string; showDetail?: boolean }) {
  const p = usePresence(memberId)
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)} title={p.detail}>
      <span className={cn("size-2 shrink-0 rounded-full", DOT[PRESENCE[p.status].tone])} aria-hidden />
      <span>{presenceText(p)}</span>
      {showDetail && p.detail && <span className="truncate font-normal text-muted-foreground">· {p.detail}</span>}
    </span>
  )
}

/** Só a bolinha, sobre um avatar (o texto vai no rótulo de acessibilidade). */
export function PresenceDot({ memberId, className }: { memberId: string; className?: string }) {
  const p = usePresence(memberId)
  return (
    <span
      role="img"
      aria-label={presenceText(p)}
      title={presenceText(p)}
      className={cn("absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-sidebar", DOT[PRESENCE[p.status].tone], className)}
    />
  )
}
