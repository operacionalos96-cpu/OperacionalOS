import type { GuideMood } from "@/lib/domain/day-guide"
import { cn } from "@/lib/utils"
import { MARK_ACCENT, MARK_BASE, MARK_VIEWBOX } from "./logo-mark"

/** Marca viva do guia do dia: orbe escuro com a marca HZK e um anel de luz (estilos em globals.css › .orb). */
export function GuideOrb({ mood = "rest", className }: { mood?: GuideMood; className?: string }) {
  return (
    <span className={cn("orb", className)} data-mood={mood} aria-hidden="true">
      <span className="orb__ring" />
      <span className="orb__core">
        <svg className="orb__logo" viewBox={MARK_VIEWBOX}>
          <path d={MARK_BASE} />
          <path className="orb__accent" d={MARK_ACCENT} />
        </svg>
        <svg className="orb__check" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    </span>
  )
}
