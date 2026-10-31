"use client"

import { useEffect, useMemo, useState } from "react"
import { addDays } from "date-fns"
import { toast } from "sonner"
import { SunriseIcon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { needsCheckIn, planId, type DailyPlan } from "@/lib/domain/presence"
import { useDailyPlans } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Check-in do dia (ADR 0009): na primeira vez que a pessoa abre o app no dia, um cartão discreto
 * pergunta o horário de hoje e o foco. Feito ou pulado, não volta até amanhã. O horário vem
 * preenchido com o de ontem (ou 9h–18h).
 */
export function CheckInCard() {
  const meId = useStore((s) => s.meId)
  const hydrated = useStore((s) => s.hydrated)
  const loaded = useDailyPlans((s) => s.loaded)
  const plans = useDailyPlans((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  const today = useMemo(() => new Date(), [])
  const mine = plans.find((p) => p.id === planId(meId, today))
  const last = useMemo(
    () => plans.filter((p) => p.memberId === meId && p.checkedInAt && p.id !== planId(meId, today)).sort((a, b) => b.date.localeCompare(a.date))[0],
    [plans, meId, today],
  )
  const [start, setStart] = useState("09:00")
  const [end, setEnd] = useState("18:00")
  const [focus, setFocus] = useState("")
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (last?.startTime) setStart(last.startTime)
    if (last?.endTime) setEnd(last.endTime)
  }, [last])

  if (!hydrated || !loaded || dismissed || !needsCheckIn(mine)) return null

  const base: DailyPlan = { ...(mine ?? {}), id: planId(meId, today), memberId: meId, date: planId(meId, today).split(":")[1] }

  function checkIn(e: React.FormEvent) {
    e.preventDefault()
    if (end <= start) {
      toast.error("O fim do expediente precisa ser depois do começo")
      return
    }
    save({ ...base, startTime: start, endTime: end, focus: focus.trim() || undefined, checkedInAt: new Date().toISOString() })
    toast.success("Check-in feito", { description: `O time vê você no expediente até ${end}.` })
    setDismissed(true)
  }

  function skip() {
    save({ ...base, skippedAt: new Date().toISOString() })
    setDismissed(true)
  }

  const hour = today.getHours()
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"
  return (
    <form
      onSubmit={checkIn}
      className="fixed right-4 bottom-20 z-50 grid w-[min(22rem,calc(100vw-2rem))] animate-enter gap-3 rounded-2xl border bg-card p-4 shadow-lift md:bottom-6"
      aria-label="Check-in do dia"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-highlight-soft text-highlight">
          <SunriseIcon className="size-5" />
        </span>
        <div className="flex-1">
          <p className="font-semibold">
            {hello}, {getUser(meId).name}! Check-in do dia
          </p>
          <p className="t-desc text-sm">Leva 10 segundos e o time sabe que você está trabalhando.</p>
        </div>
        <button type="button" onClick={skip} aria-label="Agora não" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
          <XIcon className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Começo hoje
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Termino hoje
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Foco de hoje (opcional)
        <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ex.: fechar o roteiro do lançamento" maxLength={140} />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={skip}>
          Agora não
        </Button>
        <Button type="submit">Fazer check-in</Button>
      </div>
      {/* Amanhã o cartão volta; o horário vem com o de hoje. */}
      <span className="sr-only">Próximo check-in: {addDays(today, 1).toLocaleDateString("pt-BR")}</span>
    </form>
  )
}
