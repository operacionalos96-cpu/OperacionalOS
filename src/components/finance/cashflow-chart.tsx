"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { Transaction } from "@/lib/domain/types"
import { cashflowSeries, sum } from "@/lib/domain/rules"
import { moneyCompact } from "@/lib/format"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Segmented } from "@/components/shared/fields"
import { Panel } from "@/components/shared/layout"

const axisFormat = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

const config = {
  entradas: { label: "Entradas", color: "#10b981" },
  saidas: { label: "Saídas", color: "#f87171" },
} satisfies ChartConfig

export function CashflowChart({ transactions }: { transactions: Transaction[] }) {
  const [range, setRange] = useState<"30" | "90">("30")
  const data = useMemo(() => cashflowSeries(transactions, Number(range) as 30 | 90, new Date()), [transactions, range])
  const totalIn = sum(data.map((d) => d.entradas)) * 100
  const totalOut = sum(data.map((d) => d.saidas)) * 100

  return (
    <Panel
      title="Entradas vs saídas"
      aside={
        <Segmented
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: "30", label: "30 dias" },
            { value: "90", label: "90 dias" },
          ]}
        />
      }
    >
      <div className="flex gap-5 px-4 text-sm">
        <Legend color={config.entradas.color} label="Entradas" value={moneyCompact(totalIn)} />
        <Legend color={config.saidas.color} label="Saídas" value={moneyCompact(totalOut)} />
        <Legend label="Resultado" value={moneyCompact(totalIn - totalOut)} tone={totalIn - totalOut >= 0 ? "text-emerald-600" : "text-red-600"} />
      </div>
      <ChartContainer config={config} className="aspect-auto h-56 w-full px-2 pb-2">
        <BarChart data={data} barGap={2} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => axisFormat.format(v)}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full justify-between gap-4">
                    <span className="text-muted-foreground">{config[name as keyof typeof config]?.label}</span>
                    <span className="tabular font-medium">{moneyCompact(Number(value) * 100)}</span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="entradas" fill="var(--color-entradas)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="saidas" fill="var(--color-saidas)" radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </Panel>
  )
}

function Legend({ color, label, value, tone }: { color?: string; label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {color && <span className="size-2 rounded-sm" style={{ backgroundColor: color }} />}
        {label}
      </p>
      <p className={`tabular font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  )
}
