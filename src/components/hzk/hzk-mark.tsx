"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

/**
 * Símbolo HZK oficial (mesma geometria de public/hzk-simbolo.svg: o Z e os três pontos laranja na
 * diagonal não mudam) em vidro FOSCO: grafite em gradiente suave e brasa laranja embaixo, sem grão
 * (vira pixel em 40 px) e sem brilho fixo; só uma luz difusa passa de tempos em tempos. Sem reflexo metálico (pedido do Gabriel, 11/11/2026).
 */
export function HzkMark({ className, title = "HZK Company" }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "")
  const g = (n: string) => `${n}-${id}`
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={title} className={cn("hzk-mark size-10", className)}>
      <defs>
        <radialGradient id={g("body")} cx="40%" cy="30%" r="85%">
          <stop offset="0%" stopColor="#283246" />
          <stop offset="60%" stopColor="#1b2432" />
          <stop offset="100%" stopColor="#141b27" />
        </radialGradient>
        <radialGradient id={g("ember")} cx="50%" cy="105%" r="65%">
          <stop offset="0%" stopColor="#ea5b25" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#ea5b25" stopOpacity="0" />
        </radialGradient>
        {/* Luz difusa que passa de tempos em tempos (não é brilho fixo: o material é todo fosco). */}
        <linearGradient id={g("pass")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g("clip")}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${g("clip")})`}>
        <circle cx="50" cy="50" r="50" fill={`url(#${g("body")})`} />
        <circle cx="50" cy="50" r="50" fill={`url(#${g("ember")})`} />
        <g transform="translate(50 50) scale(0.8) translate(-50 -50)">
          <polygon
            points="18.57,9.05 82.02,9.05 82.02,26.19 42.74,73.21 82.02,73.21 82.02,89.88 15.0,89.88 15.0,75.36 57.26,26.19 18.57,26.19"
            fill="#eef1f5"
          />
          <line x1="21.79" y1="83.45" x2="75.6" y2="15.48" stroke="#EA5B25" strokeWidth="2.62" />
          <circle cx="21.79" cy="83.45" r="6.55" fill="#EA5B25" />
          <circle cx="48.21" cy="51.07" r="6.55" fill="#EA5B25" />
          <circle cx="75.6" cy="15.48" r="6.55" fill="#EA5B25" />
        </g>
        <rect className="hzk-mark-pass" x="-90" y="-20" width="70" height="140" fill={`url(#${g("pass")})`} />
      </g>
    </svg>
  )
}
