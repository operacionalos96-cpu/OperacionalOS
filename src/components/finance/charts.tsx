"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { useId, useMemo, useState } from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"
import type { FinanceSettings, Transaction } from "@/lib/domain/types"
import { balanceSeries, expensesByCategory } from "@/lib/domain/rules"
import { money, moneyCompact } from "@/lib/format"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, Panel } from "@/components/shared/layout"
import { PieChartIcon } from "lucide-react"

/*
 * Regras de marca (skill dataviz): linha 2px, área = lavagem suave, ponto final
 * ≥8px com anel da cor da superfície, grade hairline sólida, 1 eixo só,
 * texto sempre em cor de texto (nunca na cor da série), tooltip em tudo.
 * Profundidade "4D": brilho suave sob a linha, área em degradê e um pulso no valor de hoje —
 * tudo em SVG estático + 1 animação CSS leve (desligada com "reduzir movimento").
 */

/** Degradê da área + brilho da linha. Ids únicos por gráfico (vários na mesma página). */
function ChartDefs({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={0.26} />
        <stop offset="55%" stopColor={color} stopOpacity={0.08} />
        <stop offset="100%" stopColor={color} stopOpacity={0} />
      </linearGradient>
      <filter id={`${id}-glow`} x="-10%" y="-40%" width="120%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={color} floodOpacity="0.35" />
      </filter>
    </defs>
  )
}

/** Ponto do valor de hoje: anel da superfície + pulso discreto ("ao vivo"). */
function LiveDot({ cx, cy, color, r = 4.5 }: { cx?: number; cy?: number; color: string; r?: number }) {
  if (cx === undefined || cy === undefined) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={color} className="beacon" />
      <circle cx={cx} cy={cy} r={r} fill={color} stroke="var(--card)" strokeWidth={2} />
    </g>
  )
}

const LINE_ANIMATION = { animationDuration: 1100, animationEasing: "ease-out" as const }

const axisFormat = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

const balanceConfig = { saldo: { label: "Saldo", color: "var(--brand)" } } satisfies ChartConfig

/** Evolução do saldo em caixa. Uma série só: o título nomeia, sem caixa de legenda. */
export function BalanceChart({ settings, transactions, className, asOf }: { settings: FinanceSettings; transactions: Transaction[]; className?: string; asOf?: Date }) {
  const [range, setRange] = useState<"30" | "90">("90")
  const data = useMemo(() => balanceSeries(settings, transactions, Number(range), asOf ?? new Date()), [settings, transactions, range, asOf])
  const gradId = useId().replace(/:/g, "")
  const last = data[data.length - 1]
  const first = data[0]
  const diff = last.saldo - first.saldo

  return (
    <Panel
      className={className}
      title="Evolução do caixa"
      description={`Saldo no fim de cada dia · ${diff >= 0 ? "subiu" : "caiu"} ${moneyCompact(Math.abs(diff))} no período`}
      aside={
        <Segmented
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
          ]}
        />
      }
    >
      <ChartContainer config={balanceConfig} className="aspect-auto h-60 w-full px-2 pt-3 pb-2">
        <ComposedChart data={data} margin={{ top: 16, right: 84, left: 4, bottom: 0 }}>
          <ChartDefs id={gradId} color="var(--color-saldo)" />
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} />
          <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => axisFormat.format(v / 100)} domain={["auto", "auto"]} />
          <ChartTooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 4" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TooltipCard title={String(payload[0].payload.label)}>
                  <TooltipRow color="var(--brand)" label="Saldo" value={money(Number(payload[0].value))} />
                </TooltipCard>
              ) : null
            }
          />
          {/* Área (só preenchimento) + linha com brilho por cima. Linha reta: o saldo muda por dia, sem curva inventada. */}
          <Area type="linear" dataKey="saldo" stroke="none" fill={`url(#${gradId}-fill)`} isAnimationActive {...LINE_ANIMATION} activeDot={false} tooltipType="none" />
          <Line
            type="linear"
            dataKey="saldo"
            stroke="var(--color-saldo)"
            strokeWidth={2}
            dot={false}
            style={{ filter: `url(#${gradId}-glow)` }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: "var(--color-saldo)" }}
            {...LINE_ANIMATION}
          />
          {/* Rótulo direto só no ponto final (o valor que importa: hoje). */}
          <ReferenceDot
            x={last.label}
            y={last.saldo}
            r={4.5}
            shape={(p: { cx?: number; cy?: number }) => <LiveDot cx={p.cx} cy={p.cy} color="var(--color-saldo)" />}
            label={{ value: moneyCompact(last.saldo), position: "right", fill: "var(--foreground)", fontSize: 12, fontWeight: 600, offset: 10 }}
          />
        </ComposedChart>
      </ChartContainer>
    </Panel>
  )
}

/** Mini linha de tendência (sem eixos) para cards de indicador. */
export function Sparkline({ values, color = "var(--brand)", className }: { values: number[]; color?: string; className?: string }) {
  const data = values.map((v, i) => ({ i, v }))
  const config = { v: { label: "Valor", color } } satisfies ChartConfig
  const id = useId().replace(/:/g, "")
  return (
    <ChartContainer config={config} className={className ?? "aspect-auto h-10 w-full"}>
      <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 4, left: 4 }}>
        <ChartDefs id={id} color="var(--color-v)" />
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <XAxis hide dataKey="i" />
        <Area type="linear" dataKey="v" stroke="none" fill={`url(#${id}-fill)`} isAnimationActive {...LINE_ANIMATION} />
        <Line type="linear" dataKey="v" stroke="var(--color-v)" strokeWidth={2} dot={false} style={{ filter: `url(#${id}-glow)` }} isAnimationActive {...LINE_ANIMATION} />
        <ReferenceDot x={data.length - 1} y={values[values.length - 1]} r={3.5} shape={(p: { cx?: number; cy?: number }) => <LiveDot cx={p.cx} cy={p.cy} color="var(--color-v)" r={3.5} />} />
      </ComposedChart>
    </ChartContainer>
  )
}

/**
 * Para onde vai o dinheiro: barras horizontais, UMA cor (magnitude, não identidade).
 * Nome da categoria e valor em cor de texto; a barra só carrega o tamanho.
 */
export function ExpensesByCategory({ transactions, className, period }: { transactions: Transaction[]; className?: string; period?: Date }) {
  const rows = useMemo(() => expensesByCategory(transactions, period ?? new Date()), [transactions, period])
  const max = Math.max(...rows.map((r) => r.cents), 1)
  const total = rows.reduce((a, r) => a + r.cents, 0)

  return (
    <Panel className={className} title="Para onde vai o dinheiro" description={`Saídas realizadas de ${format(period ?? new Date(), "MMMM yyyy", { locale: ptBR })} por categoria · total ${moneyCompact(total)}`}>
      {rows.length === 0 ? (
        <EmptyState icon={PieChartIcon} title="Nenhuma saída realizada neste período" description="Quando lançar despesas, elas aparecem aqui agrupadas por categoria." />
      ) : (
        <ul className="grid gap-3 px-4 py-4">
          {rows.map((r, i) => (
            <li key={r.category} className="group grid stagger gap-1.5" style={{ "--i": i } as React.CSSProperties} title={`${r.category}: ${money(r.cents)}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{r.category}</span>
                <span className="tabular text-muted-foreground">
                  <span className="font-semibold text-foreground">{moneyCompact(r.cents)}</span> · {Math.round(r.pct * 100)}%
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className="h-full grow-x rounded-full bg-gradient-to-r from-chart-out/70 to-chart-out shadow-[0_2px_6px_-3px_var(--chart-out)] transition-[filter] group-hover:brightness-110"
                  style={{ width: `${(r.cents / max) * 100}%`, animationDelay: `${i * 70}ms` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function TooltipCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border bg-popover/95 px-3 py-2 text-xs shadow-lift backdrop-blur">
      <p className="font-semibold text-foreground">{title}</p>
      {children}
    </div>
  )
}

export function TooltipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="size-2.5 rounded-[3px]" style={{ background: color }} />}
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular ml-auto font-semibold text-foreground">{value}</span>
    </div>
  )
}
