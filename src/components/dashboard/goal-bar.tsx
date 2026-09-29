import { cn } from "@/lib/utils"

/** Barra de progresso com marcador do ritmo esperado para hoje. */
export function GoalBar({ pct, expectedPct, atRisk }: { pct: number; expectedPct: number; atRisk: boolean }) {
  const done = pct >= 1
  return (
    <div className="relative h-2.5 w-full rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          done ? "bg-emerald-500" : atRisk ? "bg-amber-500" : "bg-foreground",
        )}
        style={{ width: `${Math.min(pct, 1) * 100}%` }}
      />
      {!done && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-foreground/40"
          style={{ left: `${expectedPct * 100}%` }}
          title="Ritmo esperado para hoje"
        />
      )}
    </div>
  )
}
