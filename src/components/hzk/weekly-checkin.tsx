"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CalendarCheckIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { FOCUS_MAX, checkinId, weekOf, type CheckinKind, type WeeklyCheckin } from "@/lib/domain/weekly"
import { useCheckins } from "@/lib/modules"
import { notify } from "@/lib/notifications"
import { useStore } from "@/lib/store"
import { useTeam } from "@/lib/use-team"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

/**
 * Check-in semanal (ADR 0011). Segunda: "qual o seu foco da semana?" (até 3 itens). Sexta: "o que
 * saiu, o que travou, o que precisa de alguém?" — quem for marcado recebe um aviso. As respostas
 * aparecem juntas na Semana do time.
 */
export function WeeklyCheckinCard({ kind, onDone, className }: { kind: CheckinKind; onDone?: () => void; className?: string }) {
  const meId = useStore((s) => s.meId)
  const team = useTeam()
  const save = useCheckins((s) => s.save)
  const week = weekOf(new Date())
  const existing = useCheckins((s) => s.items.find((c) => c.id === checkinId(meId, week, kind)))
  const [focus, setFocus] = useState<string[]>(existing?.focus?.length ? [...existing.focus, "", ""].slice(0, FOCUS_MAX) : ["", "", ""])
  const [shipped, setShipped] = useState(existing?.shipped ?? "")
  const [blocked, setBlocked] = useState(existing?.blocked ?? "")
  const [needs, setNeeds] = useState(existing?.needs ?? "")
  const [needsFrom, setNeedsFrom] = useState<string[]>(existing?.needsFrom ?? [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const base: WeeklyCheckin = { id: checkinId(meId, week, kind), memberId: meId, week, kind, answeredAt: new Date().toISOString() }
    if (kind === "segunda") {
      const list = focus.map((f) => f.trim()).filter(Boolean)
      if (!list.length) return void toast.error("Escreva pelo menos um foco para a semana")
      save({ ...base, focus: list })
    } else {
      if (!shipped.trim() && !blocked.trim() && !needs.trim()) return void toast.error("Responda pelo menos uma das três")
      const from = needs.trim() ? needsFrom : []
      save({ ...base, shipped: shipped.trim() || undefined, blocked: blocked.trim() || undefined, needs: needs.trim() || undefined, needsFrom: from })
      if (from.length) notify(from, { kind: "mencao", title: `${getUser(meId).name} precisa de você: ${needs.trim().slice(0, 80)}`, href: "/semana", fromId: meId })
    }
    toast.success("Check-in da semana enviado", { description: "Aparece na Semana do time." })
    onDone?.()
  }

  return (
    <form onSubmit={submit} className={cn("grid gap-2 rounded-2xl border border-highlight/30 bg-highlight-soft/60 p-3", className)}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarCheckIcon className="size-4 text-highlight" />
        {kind === "segunda" ? "Qual o seu foco da semana?" : "Como foi a semana?"}
      </p>
      {kind === "segunda" ? (
        <>
          <p className="t-desc text-xs">Até 3 coisas. O time vê na Semana do time.</p>
          {focus.map((f, i) => (
            <Input
              key={i}
              value={f}
              onChange={(e) => setFocus(focus.map((x, k) => (k === i ? e.target.value : x)))}
              placeholder={i === 0 ? "Ex.: fechar 2 coprodutores novos" : `Foco ${i + 1} (opcional)`}
              maxLength={120}
              aria-label={`Foco ${i + 1}`}
              autoFocus={i === 0}
            />
          ))}
        </>
      ) : (
        <>
          <label className="grid gap-1 text-xs font-medium">
            O que saiu
            <Textarea value={shipped} onChange={(e) => setShipped(e.target.value)} rows={2} maxLength={500} placeholder="Entregas da semana" />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            O que travou
            <Textarea value={blocked} onChange={(e) => setBlocked(e.target.value)} rows={2} maxLength={500} placeholder="O que não andou, e por quê" />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            O que precisa de alguém
            <Textarea value={needs} onChange={(e) => setNeeds(e.target.value)} rows={2} maxLength={500} placeholder="Ex.: aprovação do contrato da Escola Crescer" />
          </label>
          {needs.trim() && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Avisar:</span>
              {team
                .filter((u) => u.id !== meId)
                .map((u) => {
                  const on = needsFrom.includes(u.id)
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setNeedsFrom(on ? needsFrom.filter((x) => x !== u.id) : [...needsFrom, u.id])}
                      className={cn("h-8 rounded-full border px-3", on ? "border-brand bg-brand-soft font-medium text-brand" : "bg-card text-muted-foreground")}
                    >
                      {u.name}
                    </button>
                  )
                })}
            </div>
          )}
        </>
      )}
      <Button type="submit" className="w-full">
        {existing ? "Atualizar" : "Enviar"}
      </Button>
    </form>
  )
}
