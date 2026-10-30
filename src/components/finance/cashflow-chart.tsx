"use client"

import { useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import type { Transaction } from "@/lib/domain/types"
import { cashflowSeries, sum } from "@/lib/domain/rules"
import { money, moneyCompact } from "@/lib/format"
import { cn } from "@/lib/utils"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Segmented } from "@/components/shared/fields"
import { Panel } from "@/components/shared/layout"
import { TooltipCard, TooltipRow } from "./charts"

const axisFormat = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

// Azul × laranja (HZK): par validado com o validate_palette.js do dataviz nos dois temas
// (daltonismo ΔE 23+, contraste ≥ 3:1). Verde × cinza reprovou: o cinza "lê como cinza".
const config = {
  entradas: { label: "Entradas", color: "var(--chart-in)" },
  saidas: { label: "Saídas", color: "var(--chart-out)" },
} satisfies ChartConfig

export function CashflowChart({ transactions, asOf }: { transactions: Transaction[]; asOf?: Date }) {
  const [range, setRange] = useState<"30" | "90">("30")
  const data = useMemo(() => cashflowSeries(transactions, Number(range) as 30 | 90, asOf ?? new Date()), [transactions, range, asOf])
  const totalIn = sum(data.map((d) => d.entradas)) * 100
  const totalOut = sum(data.map((d) => d.saidas)) * 100
  const net = totalIn - totalOut

  return (
    <Panel
      title="Entradas vs saídas"
      description={range === "30" ? "Por dia, últimos 30 dias" : "Por semana, últimos 90 dias"}
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
      {/* Legenda sempre presente (2 séries) e já com os totais: identidade nunca só pela cor. */}
      <div className="grid grid-cols-3 divide-x border-b">
        <Total color={config.entradas.color} label="Entradas" value={moneyCompact(totalIn)} />
        <Total color={config.saidas.color} label="Saídas" value={moneyCompact(totalOut)} />
        <Total label="Resultado" value={`${net >= 0 ? "+" : "−"}${moneyCompact(Math.abs(net))}`} tone={net >= 0 ? "text-success" : "text-danger"} />
      </div>
      <ChartContainer config={config} className="aspect-auto h-60 w-full px-2 pt-3 pb-2">
        <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          {/* Degradê vertical: topo mais vivo, base mais suave — dá volume sem mudar a cor da série. */}
          <defs>
            {(["entradas", "saidas"] as const).map((k) => (
              <linearGradient key={k} id={`bar-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={`var(--color-${k})`} stopOpacity={1} />
                <stop offset="100%" stopColor={`var(--color-${k})`} stopOpacity={0.55} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => axisFormat.format(v)} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6, radius: 6 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipCard title={String(label)}>
                  <TooltipRow color="var(--chart-in)" label="Entradas" value={money(Number(payload[0]?.payload.entradas) * 100)} />
                  <TooltipRow color="var(--chart-out)" label="Saídas" value={money(Number(payload[0]?.payload.saidas) * 100)} />
                </TooltipCard>
              ) : null
            }
          />
          <Bar dataKey="entradas" fill="url(#bar-entradas)" radius={[5, 5, 0, 0]} maxBarSize={20} activeBar={{ fill: "var(--color-entradas)" }} animationDuration={800} animationEasing="ease-out" />
          <Bar dataKey="saidas" fill="url(#bar-saidas)" radius={[5, 5, 0, 0]} maxBarSize={20} activeBar={{ fill: "var(--color-saidas)" }} animationDuration={800} animationEasing="ease-out" />
        </BarChart>
      </ChartContainer>
    </Panel>
  )
}

function Total({ color, label, value, tone }: { color?: string; label: string; value: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="t-label flex items-center gap-1.5">
        {color && <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: color }} />}
        {label}
      </p>
      <p className={cn("tabular mt-0.5 text-lg font-bold tracking-tight", tone)}>{value}</p>
    </div>
  )
}
