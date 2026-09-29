"use client"

import { useState } from "react"
import { toast } from "sonner"
import { money, moneyInputValue, parseMoney } from "@/lib/format"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MoneyInput } from "@/components/shared/fields"

/** Popover para definir a meta de faturamento de um mês. */
export function GoalEditor({ monthKey, trigger }: { monthKey: string; trigger: React.ReactNode }) {
  const current = useStore((s) => s.financeSettings.monthlyGoals[monthKey] ?? 0)
  const setMonthlyGoal = useStore((s) => s.setMonthlyGoal)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")

  const cents = parseMoney(text)

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (cents === null) return
    setMonthlyGoal(monthKey, cents)
    setOpen(false)
    toast.success(`Meta do mês: ${money(cents)}`)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setText(moneyInputValue(current))
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form onSubmit={save} className="grid gap-2">
          <p className="text-sm font-medium">Meta de faturamento do mês</p>
          <p className="text-xs text-muted-foreground">Soma das entradas que vocês querem alcançar.</p>
          <MoneyInput value={text} onChange={(t) => setText(t)} autoFocus />
          <Button type="submit" size="sm" disabled={cents === null}>
            Salvar meta
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
