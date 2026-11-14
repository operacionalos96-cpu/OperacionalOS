"use client"

import { useMemo } from "react"
import { Card } from "@/components/dock/ui"
import { useDock } from "@/lib/dock/store"

const COLORS = ["var(--chart-1)", "var(--foreground)", "var(--chart-3)", "var(--warning)", "var(--chart-2)", "var(--chart-4)"]

/** Uso: quanto cada IA trabalhou nos últimos 7 dias. Só a pessoa vê. */
export default function DockUsagePage() {
  const d = useDock((s) => s.data)!
  const { days, series, total, freePct, cost, swaps } = useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, i) => {
      const t = new Date(Date.now() - (6 - i) * 86_400_000)
      return { key: t.toISOString().slice(0, 10), label: t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }
    })
    const recent = d.usage.filter((u) => days.some((x) => u.createdAt.startsWith(x.key)))
    const providers = [...new Set(recent.map((u) => u.provider))]
    const series = providers.map((p, i) => ({ p, color: COLORS[i % COLORS.length], v: days.map((x) => recent.filter((u) => u.provider === p && u.createdAt.startsWith(x.key)).length) }))
    return {
      days, series, total: recent.length,
      freePct: recent.length ? Math.round((recent.filter((u) => u.free).length / recent.length) * 100) : 0,
      cost: recent.reduce((s, u) => s + (u.costUsd ?? 0), 0), swaps: recent.filter((u) => u.fallbackFrom).length,
    }
  }, [d.usage])
  const W = 640, H = 200, pl = 34, pb = 24, pt = 8
  const tot = days.map((_, i) => series.reduce((s, x) => s + x.v[i], 0))
  const top = Math.max(10, Math.ceil(Math.max(0, ...tot) / 10) * 10)
  const y = (v: number) => H - pb - (v / top) * (H - pb - pt)
  const slot = (W - pl - 8) / 7, bw = slot * 0.56

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Pedidos · 7 dias", String(total)], ["Grátis", `${freePct}%`], ["Gasto estimado", `US$ ${cost.toFixed(2).replace(".", ",")}`], ["Reservas usadas", String(swaps)]].map(([l, v]) => (
          <Card key={l} className="grid gap-1"><div className="t-label">{l}</div><div className="t-value">{v}</div></Card>
        ))}
      </div>
      <Card>
        <h3 className="t-title">Por dia</h3>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-auto w-full" role="img" aria-label="Pedidos por dia, empilhados por IA">
          {[0, top / 2, top].map((v) => <g key={v}><line x1={pl} x2={W - 4} y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted-foreground)">{v}</text></g>)}
          {days.map((x, i) => {
            let acc = 0
            const left = pl + i * slot + (slot - bw) / 2
            return (
              <g key={x.key}>
                {series.map((s) => {
                  const v = s.v[i]
                  if (!v) return null
                  const r = <rect key={s.p} x={left} y={y(acc + v)} width={bw} height={Math.max(0, y(acc) - y(acc + v) - 1)} fill={s.color} rx={2}><title>{`${x.label} · ${s.p}: ${v}`}</title></rect>
                  acc += v
                  return r
                })}
                <text x={left + bw / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">{x.label}</text>
              </g>
            )
          })}
        </svg>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">{series.map((s) => <span key={s.p}><i className="mr-1 inline-block size-2.5 rounded-[3px] align-[-1px]" style={{ background: s.color }} />{s.p}</span>)}</div>
      </Card>
    </div>
  )
}
