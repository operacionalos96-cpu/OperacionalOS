"use client"

import { useEffect, useState } from "react"
import { Building2Icon, ChevronDownIcon } from "lucide-react"
import { SedeView } from "@/components/ai-office/sede/sede-view"
import { cn } from "@/lib/utils"

const KEY = "hzk-os-sede-inicio"

/**
 * A Sede 3D na Início (ADR 0024): um bloco que cada pessoa abre ou recolhe; a escolha fica guardada
 * neste navegador. Recolhida, a cena não é montada — o three.js nem é baixado — e a Início abre leve.
 * Na primeira vez ela vem aberta: é a Sede que mostra a empresa viva.
 */
export function HomeSede() {
  // null = ainda não li a escolha guardada (evita montar o 3D para quem deixou recolhido).
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    let saved: string | null = null
    try {
      saved = localStorage.getItem(KEY)
    } catch {}
    setOpen(saved !== "0")
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    try {
      localStorage.setItem(KEY, next ? "1" : "0")
    } catch {}
  }

  return (
    <section aria-label="Sede HZK em 3D" className="grid gap-3">
      <button
        type="button"
        onClick={toggle}
        disabled={open === null}
        aria-expanded={!!open}
        aria-controls="sede-inicio"
        className="flex w-full items-center gap-3 rounded-2xl border bg-card px-5 py-3 text-left shadow-card transition-colors hover:border-brand/50"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-highlight/20 bg-highlight-soft text-highlight">
          <Building2Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Sede HZK</span>
          <span className="block truncate text-xs text-muted-foreground">O prédio da empresa em 3D: cada andar é uma área e os eventos do dia sobem pela fachada.</span>
        </span>
        <span className="hidden text-xs font-medium text-muted-foreground sm:inline">{open ? "Recolher" : "Mostrar"}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-(--dur-2)", open && "rotate-180")} />
      </button>
      <div id="sede-inicio">{open && <SedeView stageClassName="h-[min(56vh,520px)] min-h-[360px]" />}</div>
    </section>
  )
}
