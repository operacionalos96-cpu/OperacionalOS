"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ArrowDownRightIcon, ArrowUpRightIcon, ClockIcon, KanbanIcon, TargetIcon, WalletIcon } from "lucide-react"
import { stageColor, stageLabel } from "@/lib/domain/constants"
import type { MyDay } from "@/lib/domain/my-day"
import { balance, balanceSeries, goalProgress, meaningfulPct, monthDelta, monthKey, pipelineSummary } from "@/lib/domain/rules"
import { money, moneyCompact } from "@/lib/format"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { useVisiblePages } from "@/lib/use-access-pages"
import { cn } from "@/lib/utils"
import { CountUp } from "@/components/shared/count-up"
import { GoalBar } from "@/components/dashboard/goal-bar"
import { GoalEditor } from "@/components/finance/goal-editor"
import { Sparkline } from "@/components/finance/charts"

/**
 * Faixa de KPIs da Início (Briefing UI/UX, ADR 0013): Saldo, Meta, Pipeline e Atrasados, mesma
 * altura, clicáveis. Cada KPI só aparece para quem vê a aba dele (ADR 0012); Atrasados é de todos.
 * Nenhum número novo: tudo vem das regras que o Financeiro, o Pipeline e o Plano do dia já usam.
 */
export function KpiStrip({ day }: { day: MyDay }) {
  const can = useVisiblePages()
  const { transactions, financeSettings, leads } = useStore()
  const now = useMinute()
  const data = useMemo(
    () => ({
      balance: balance(financeSettings, transactions),
      delta: monthDelta(financeSettings, transactions, now),
      trend: balanceSeries(financeSettings, transactions, 30, now).map((p) => p.saldo),
      goal: goalProgress(financeSettings, transactions, now),
      pipeline: pipelineSummary(leads),
    }),
    [financeSettings, transactions, leads, now],
  )
  const overdue = day.planItems.filter((i) => i.group === "atrasado").length
  const finance = can("/financeiro")
  const cards = [
    finance && <Saldo key="saldo" data={data} />,
    finance && <Meta key="meta" goal={data.goal} month={monthKey(now)} />,
    can("/pipeline") && <Pipeline key="pipeline" summary={data.pipeline} />,
    <Atrasados key="atrasados" count={overdue} />,
  ].filter(Boolean)
  return <div className={cn("grid gap-4 sm:grid-cols-2", cards.length >= 4 ? "xl:grid-cols-4" : cards.length === 3 ? "lg:grid-cols-3" : "")}>{cards}</div>
}

function Kpi({ href, icon: Icon, label, children, i, className }: { href?: string; icon: typeof WalletIcon; label: string; children: React.ReactNode; i: number; className?: string }) {
  const body = (
    <>
      <p className="t-label flex items-center gap-1.5 truncate" title={label}>
        <Icon className="size-3.5 shrink-0" /> {label}
      </p>
      {children}
    </>
  )
  const cls = cn("stagger flex min-h-32 flex-col gap-2 rounded-2xl border bg-card p-4", href && "lift", className)
  const style = { "--i": i } as React.CSSProperties
  return href ? (
    <Link href={href} className={cls} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  )
}

function Saldo({ data }: { data: { balance: number; delta: { net: number; pct: number | null }; trend: number[] } }) {
  const up = data.delta.net >= 0
  const pct = meaningfulPct(data.delta.pct)
  const min = Math.min(...data.trend)
  const max = Math.max(...data.trend)
  return (
    <Kpi href="/financeiro" icon={WalletIcon} label="Saldo em caixa" i={0}>
      <div className="flex items-end justify-between gap-3">
        <p className={cn("t-value tabular", data.balance < 0 && "text-danger")}>
          <CountUp value={data.balance} format={money} />
        </p>
        <span title={`30 dias · mínimo ${money(min)} · máximo ${money(max)}`} className="shrink-0">
          <Sparkline values={data.trend} color="var(--highlight)" className="aspect-auto h-10 w-28" />
        </span>
      </div>
      <p className={cn("tabular mt-auto flex items-center gap-1 text-xs font-medium", up ? "text-success" : "text-danger")}>
        {up ? <ArrowUpRightIcon className="size-3.5" /> : <ArrowDownRightIcon className="size-3.5" />}
        {up ? "+" : "−"}
        {money(Math.abs(data.delta.net))}
        {pct !== null && <span>({Math.round(Math.abs(pct) * 100)}%)</span>}
        <span className="t-desc font-normal">este mês</span>
      </p>
    </Kpi>
  )
}

function Meta({ goal, month }: { goal: ReturnType<typeof goalProgress>; month: string }) {
  if (!goal.hasGoal) {
    return (
      <Kpi icon={TargetIcon} label="Meta do mês" i={1} className="border-dashed">
        <p className="t-desc text-sm">Defina quanto quer faturar este mês para acompanhar o ritmo.</p>
        <div className="mt-auto">
          <GoalEditor monthKey={month} trigger={<button className="action-link text-sm">Definir meta</button>} />
        </div>
      </Kpi>
    )
  }
  const status = goal.pct >= 1 ? "batida" : goal.atRisk ? "risco" : "ritmo"
  return (
    <Kpi href="/financeiro" icon={TargetIcon} label="Meta do mês" i={1}>
      <div className="flex items-baseline gap-2">
        <p className="t-value tabular">
          <CountUp value={Math.round(goal.pct * 100)} format={(n) => `${n}%`} />
        </p>
        <p className="t-desc tabular text-sm">de {moneyCompact(goal.target)}</p>
      </div>
      {/* Bullet bar: realizado (cheio) + marca do ritmo esperado para hoje. */}
      <GoalBar pct={goal.pct} expectedPct={goal.expectedPct} atRisk={goal.atRisk} />
      <p className={cn("mt-auto text-xs", status === "risco" ? "font-medium text-warning" : status === "batida" ? "font-medium text-success" : "t-desc")}>
        {status === "batida" ? "Meta batida" : status === "risco" ? `Atrás do ritmo (esperado ${Math.round(goal.expectedPct * 100)}%)` : "No ritmo"}
      </p>
    </Kpi>
  )
}

function Pipeline({ summary }: { summary: ReturnType<typeof pipelineSummary> }) {
  const max = Math.max(...summary.stages.map((s) => s.count), 1)
  return (
    <Kpi icon={KanbanIcon} label="Pipeline aberto" i={2}>
      <div className="flex items-baseline gap-2">
        <Link href="/pipeline" className="t-value tabular hover:text-highlight">
          <CountUp value={summary.valueCents} format={moneyCompact} />
        </Link>
        <p className="t-desc tabular text-sm">{summary.count} leads</p>
      </div>
      {/* Funil: onde os leads estão parando. Cada barra leva ao estágio no quadro. */}
      <div className="grid gap-1">
        {summary.stages.map((s, i) => (
          <Link key={s.stage} href={`/pipeline?etapa=${s.stage}`} className="group/st grid grid-cols-[72px_1fr_auto] items-center gap-2 rounded text-xs hover:bg-accent">
            <span className="truncate text-muted-foreground group-hover/st:text-foreground">{stageLabel(s.stage)}</span>
            <span className="h-1.5 rounded-full bg-muted">
              <span className="grow-x block h-full rounded-full" style={{ width: `${(s.count / max) * 100}%`, background: stageColor(s.stage), animationDelay: `${i * 20}ms` }} />
            </span>
            <span className="tabular text-right font-medium">{s.count}</span>
          </Link>
        ))}
      </div>
    </Kpi>
  )
}

function Atrasados({ count }: { count: number }) {
  return (
    <Kpi href="/tarefas" icon={ClockIcon} label="Atrasados" i={3}>
      <p className={cn("t-value tabular", count > 0 && "text-danger")}>
        <CountUp value={count} />
      </p>
      <p className="t-desc mt-auto text-xs">{count ? "No seu plano do dia, no topo." : "Nada atrasado. Mandou bem."}</p>
    </Kpi>
  )
}
