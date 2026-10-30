"use client"

import { useMemo } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  AlertTriangleIcon,
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ClockIcon,
  KanbanIcon,
  PartyPopperIcon,
  TargetIcon,
  UserIcon,
  WalletIcon,
} from "lucide-react"
import { getUser } from "@/config/team"
import { stageColor, stageLabel } from "@/lib/domain/constants"
import {
  type AgendaItem,
  type AttentionItem,
  attentionItems,
  balance,
  balanceSeries,
  goalProgress,
  monthDelta,
  monthKey,
  monthStats,
  myAgenda,
  pipelineSummary,
} from "@/lib/domain/rules"
import { dueLabel, money, moneyCompact } from "@/lib/format"
import { toggleTaskWithFeedback } from "@/lib/actions"
import { useStore } from "@/lib/store"
import { openLeadForm, useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState, GroupLabel, Panel, StatCard } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { CountUp } from "@/components/shared/count-up"
import { GoalBar } from "@/components/dashboard/goal-bar"
import { GoalEditor } from "@/components/finance/goal-editor"
import { BalanceChart, Sparkline } from "@/components/finance/charts"
import { PriorityFlag } from "@/components/tasks/task-bits"
import { GoalsPanel, TeamFeedPanel } from "@/components/dashboard/team-panels"

export default function DashboardPage() {
  const { leads, tasks, transactions, financeSettings, meId } = useStore()
  const now = new Date()
  const me = getUser(meId)

  const data = useMemo(() => {
    const n = new Date()
    return {
      balance: balance(financeSettings, transactions),
      delta: monthDelta(financeSettings, transactions, n),
      month: monthStats(transactions, n),
      goal: goalProgress(financeSettings, transactions, n),
      attention: attentionItems({ leads, tasks, txs: transactions, settings: financeSettings }, n),
      agenda: myAgenda(meId, leads, tasks, n),
      pipeline: pipelineSummary(leads),
      trend: balanceSeries(financeSettings, transactions, 30, n).map((p) => p.saldo),
    }
  }, [leads, tasks, transactions, financeSettings, meId])

  const hour = now.getHours()
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"
  const urgentCount = data.attention.total

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-8">
      {/* Título (quem/quando) + resumo em uma frase. */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="t-label first-letter:uppercase">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting}, {me.name}
          </h1>
          <p className="t-desc mt-1 text-sm">
            {urgentCount === 0 ? (
              "Tudo em dia. Bom momento para prospectar."
            ) : (
              <>
                <span className="font-medium text-foreground">
                  {urgentCount} {urgentCount === 1 ? "item precisa" : "itens precisam"}
                </span>{" "}
                da sua atenção hoje.
              </>
            )}
          </p>
        </div>
      </header>

      {/* Linha 1: os três números do negócio. */}
      <div className="grid gap-4 md:grid-cols-3">
        <CashCard
          balance={data.balance}
          delta={data.delta}
          month={data.month}
          trend={data.trend}
          empty={transactions.length === 0 && financeSettings.openingBalanceCents === 0}
        />
        <GoalCard goal={data.goal} monthKey={monthKey(now)} />
        <PipelineCard summary={data.pipeline} />
      </div>

      {/* Linha 2: o que fazer agora. */}
      <div className="grid gap-4 lg:grid-cols-5">
        <AttentionPanel items={data.attention.items} total={data.attention.total} className="lg:col-span-3" />
        <AgendaPanel items={data.agenda} className="lg:col-span-2" />
      </div>

      {/* Linha 3: onde queremos chegar e o que a equipe anda fazendo. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GoalsPanel />
        <TeamFeedPanel />
      </div>

      {/* Linha 4: tendência. */}
      <BalanceChart settings={financeSettings} transactions={transactions} />
    </div>
  )
}

function CashCard({
  balance,
  delta,
  month,
  trend,
  empty,
}: {
  balance: number
  empty: boolean
  delta: { net: number; pct: number | null }
  month: { income: number; expense: number }
  trend: number[]
}) {
  const up = delta.net >= 0
  return (
    <StatCard
      href="/financeiro"
      label="Saldo em caixa"
      icon={WalletIcon}
      info="Saldo inicial + todas as entradas − todas as saídas. A linha mostra os últimos 30 dias."
      style={{ "--i": 0 } as React.CSSProperties}
    >
      {/* flex-wrap: sem espaço ao lado do valor, a linha desce em vez de vazar do card. */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className={cn("t-value min-w-0", balance < 0 && "text-danger")}>
          <CountUp value={balance} format={money} />
        </p>
        <Sparkline values={trend} color={up ? "var(--success)" : "var(--muted-foreground)"} className="aspect-auto h-9 w-24 shrink-0" />
      </div>
      <p className={cn("tabular mt-2 flex items-center gap-1 text-sm font-medium", up ? "text-success" : "text-danger")}>
        {up ? <ArrowUpRightIcon className="size-4" /> : <ArrowDownRightIcon className="size-4" />}
        {up ? "+" : "−"}
        {money(Math.abs(delta.net))}
        {delta.pct !== null && <span>({Math.round(Math.abs(delta.pct) * 100)}%)</span>}
        <span className="t-desc font-normal">este mês</span>
      </p>
      <div className="mt-auto border-t pt-3">
        <p className="t-desc tabular text-xs">
          {empty ? "Comece informando o saldo atual em Financeiro → Ajustar." : `Entrou ${moneyCompact(month.income)} · Saiu ${moneyCompact(month.expense)}`}
        </p>
      </div>
    </StatCard>
  )
}

function GoalCard({ goal, monthKey }: { goal: ReturnType<typeof goalProgress>; monthKey: string }) {
  if (!goal.hasGoal) {
    return (
      <StatCard label="Meta do mês" icon={TargetIcon} style={{ "--i": 1 } as React.CSSProperties} className="border-dashed">
        <p className="t-desc mt-3">Defina quanto quer faturar este mês para acompanhar o ritmo.</p>
        <div className="mt-auto pt-4">
          <GoalEditor monthKey={monthKey} trigger={<Button size="sm" variant="outline"><TargetIcon /> Definir meta</Button>} />
        </div>
      </StatCard>
    )
  }
  const remaining = Math.max(goal.target - goal.achieved, 0)
  const status = goal.pct >= 1 ? "batida" : goal.atRisk ? "risco" : "ritmo"
  return (
    <StatCard
      label="Meta de faturamento"
      icon={TargetIcon}
      accent={status === "batida" ? "var(--success)" : status === "risco" ? "var(--warning)" : undefined}
      info="Entradas do mês comparadas à meta. O traço na barra é onde você deveria estar hoje."
      aside={<GoalEditor monthKey={monthKey} trigger={<button className="text-xs text-muted-foreground hover:text-foreground">Editar</button>} />}
      style={{ "--i": 1 } as React.CSSProperties}
    >
      <div className="mt-3 flex items-baseline gap-2">
        <p className="t-value">
          <CountUp value={Math.round(goal.pct * 100)} format={(n) => `${n}%`} />
        </p>
        <p className="t-desc tabular">de {moneyCompact(goal.target)}</p>
      </div>
      <div className="mt-3">
        <GoalBar pct={goal.pct} expectedPct={goal.expectedPct} atRisk={goal.atRisk} />
      </div>
      <div className="mt-auto border-t pt-3">
        <p className={cn("text-xs", status === "risco" ? "font-medium text-warning" : status === "batida" ? "font-medium text-success" : "t-desc")}>
          {status === "batida"
            ? "Meta batida 🎉"
            : status === "risco"
              ? `Abaixo do ritmo (esperado ${Math.round(goal.expectedPct * 100)}%) · faltam ${moneyCompact(remaining)}`
              : `No ritmo · faltam ${moneyCompact(remaining)}`}
        </p>
      </div>
    </StatCard>
  )
}

function PipelineCard({ summary }: { summary: ReturnType<typeof pipelineSummary> }) {
  const max = Math.max(...summary.stages.map((s) => s.valueCents), 1)
  return (
    <StatCard
      href="/pipeline"
      label="Pipeline aberto"
      icon={KanbanIcon}
      info="Soma do valor dos leads que ainda não foram ganhos nem perdidos, por estágio."
      aside={<ArrowRightIcon className="size-3.5 text-muted-foreground" />}
      style={{ "--i": 2 } as React.CSSProperties}
    >
      <div className="mt-3 flex items-baseline gap-2">
        <p className="t-value">
          <CountUp value={summary.valueCents} format={moneyCompact} />
        </p>
        <p className="t-desc tabular">
          {summary.count} {summary.count === 1 ? "lead" : "leads"}
        </p>
      </div>
      {summary.count === 0 ? (
        <p className="t-desc mt-3 text-xs">Nenhum lead aberto. Crie o primeiro pelo botão &quot;Novo&quot;.</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {summary.stages.map((s, i) => (
            <div key={s.stage} className="grid grid-cols-[92px_1fr_auto] items-center gap-2.5 text-xs">
              <span className="truncate text-muted-foreground">{stageLabel(s.stage)}</span>
              <div className="h-1.5 rounded-full bg-muted">
                <div
                  className="grow-x h-full rounded-full"
                  style={{ width: `${(s.valueCents / max) * 100}%`, background: stageColor(s.stage), animationDelay: `${i * 80}ms` }}
                />
              </div>
              <span className="tabular text-right whitespace-nowrap">
                <span className="font-medium">{s.count}</span>
                <span className="text-muted-foreground"> · {moneyCompact(s.valueCents)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </StatCard>
  )
}

const ATTENTION: Record<AttentionItem["kind"], { icon: React.ComponentType<{ className?: string }>; tag: string }> = {
  acao_vencida: { icon: ClockIcon, tag: "Ação vencida" },
  tarefa_atrasada: { icon: ClockIcon, tag: "Tarefa atrasada" },
  meta: { icon: TargetIcon, tag: "Meta" },
  lead_parado: { icon: AlertTriangleIcon, tag: "Lead parado" },
}

function AttentionPanel({ items, total, className }: { items: AttentionItem[]; total: number; className?: string }) {
  return (
    <Panel
      className={cn("stagger", className)}
      style={{ "--i": 3 } as React.CSSProperties}
      title={
        <span className="flex items-center gap-2">
          Precisa de atenção
          {total > 0 && <span className="tabular rounded-md bg-danger-soft px-1.5 text-[11px] font-semibold text-danger">{total}</span>}
        </span>
      }
      description="Do mais urgente ao menos urgente. Resolva aqui mesmo."
      aside={
        total > items.length && (
          <Link href="/pipeline?view=acao" className="text-xs text-muted-foreground hover:text-foreground">
            Ver todos
          </Link>
        )
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={PartyPopperIcon}
          title="Tudo em dia"
          description="Nenhuma ação vencida, tarefa atrasada ou lead parado."
          action={<Button size="sm" variant="outline" onClick={() => openLeadForm()}>Adicionar lead</Button>}
        />
      ) : (
        <ul className="divide-y">
          {items.map((item, i) => {
            const meta = ATTENTION[item.kind]
            const critical = item.severity === 3
            const content = (
              <>
                <meta.icon className={cn("size-4 shrink-0", critical ? "text-danger" : "text-warning")} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-px text-[10px] font-medium", critical ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
                      {meta.tag}
                    </span>
                  </span>
                  <span className="t-desc mt-0.5 block truncate text-xs">{item.detail}</span>
                </span>
                {item.ownerId && <UserAvatar userId={item.ownerId} />}
              </>
            )
            const rowCls = "flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
            return (
              <li key={item.id} className="flex stagger items-center gap-2 pr-3 transition-colors hover:bg-accent/60" style={{ "--i": i } as React.CSSProperties}>
                {item.leadId ? (
                  <Link href={`/pipeline/${item.leadId}`} className={rowCls}>
                    {content}
                  </Link>
                ) : item.kind === "meta" ? (
                  <Link href="/financeiro" className={rowCls}>
                    {content}
                  </Link>
                ) : (
                  <div className={rowCls}>{content}</div>
                )}
                {/* Coluna de ação com largura fixa: avatares e botões ficam alinhados em todas as linhas. */}
                <div className="flex w-24 shrink-0 justify-end">
                  {item.kind === "acao_vencida" && item.leadId && (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => useUI.getState().set({ nextActionFor: item.leadId! })}>
                      <CheckIcon /> Feito
                    </Button>
                  )}
                  {item.kind === "tarefa_atrasada" && item.taskId && (
                    <Button size="sm" variant="outline" className="w-full" onClick={() => toggleTaskWithFeedback(item.taskId!)}>
                      <CheckIcon /> Concluir
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

const BUCKET_LABEL: Record<AgendaItem["bucket"], string> = { atrasadas: "Atrasado", hoje: "Hoje", semana: "Esta semana" }

function AgendaPanel({ items, className }: { items: AgendaItem[]; className?: string }) {
  const buckets = (["atrasadas", "hoje", "semana"] as const).map((b) => ({ id: b, items: items.filter((i) => i.bucket === b) }))

  return (
    <Panel
      className={cn("stagger", className)}
      style={{ "--i": 4 } as React.CSSProperties}
      title="Minhas responsabilidades"
      description="Suas tarefas até domingo."
    >
      {items.length === 0 ? (
        <EmptyState icon={UserIcon} title="Nada com você esta semana" description="Tarefas suas (ou em que você colabora) aparecem aqui." />
      ) : (
        <div className="flex flex-col divide-y">
          {buckets
            .filter((b) => b.items.length > 0)
            .map((b) => (
              <div key={b.id} className="px-4 py-3">
                <GroupLabel tone={b.id === "atrasadas" ? "danger" : undefined} className="mb-2">
                  {BUCKET_LABEL[b.id]}
                  <span className="tabular rounded bg-muted px-1.5 text-[10px] text-muted-foreground">{b.items.length}</span>
                </GroupLabel>
                <ul className="grid gap-2.5">
                  {b.items.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="flex items-start gap-2.5">
                      <Checkbox
                        className="mt-0.5 rounded-full"
                        checked={false}
                        onCheckedChange={() =>
                          item.kind === "task" ? toggleTaskWithFeedback(item.id) : useUI.getState().set({ nextActionFor: item.id })
                        }
                        aria-label="Concluir"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm leading-tight">
                          <PriorityFlag priority={item.priority} />
                          {item.title}
                        </p>
                        <p className="t-desc mt-0.5 truncate text-xs">
                          {item.kind === "lead" ? (
                            <Link href={`/pipeline/${item.id}`} className="hover:text-foreground hover:underline">
                              Lead · {item.context}
                            </Link>
                          ) : item.context ? (
                            <>Tarefa · {item.context}</>
                          ) : (
                            "Tarefa"
                          )}
                          {b.id !== "hoje" && <> · {dueLabel(item.dueDate)}</>}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </Panel>
  )
}
