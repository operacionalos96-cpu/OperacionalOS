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
  PartyPopperIcon,
  TargetIcon,
  UserIcon,
} from "lucide-react"
import { getUser } from "@/config/team"
import { stageLabel } from "@/lib/domain/constants"
import {
  type AgendaItem,
  type AttentionItem,
  attentionItems,
  balance,
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
import { EmptyState, Panel } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { GoalBar } from "@/components/dashboard/goal-bar"
import { GoalEditor } from "@/components/finance/goal-editor"

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
    }
  }, [leads, tasks, transactions, financeSettings, meId])

  const hour = now.getHours()
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"
  const urgentCount = data.attention.total

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{format(now, "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
          <h1 className="text-xl font-semibold tracking-tight">
            {greeting}, {me.name}.{" "}
            <span className="text-muted-foreground">
              {urgentCount === 0
                ? "Tudo em dia."
                : `${urgentCount} ${urgentCount === 1 ? "item precisa" : "itens precisam"} de atenção.`}
            </span>
          </h1>
        </div>
      </header>

      {/* Linha 1: caixa, meta, pipeline */}
      <div className="grid gap-4 md:grid-cols-3">
        <CashCard
          balance={data.balance}
          delta={data.delta}
          month={data.month}
          empty={transactions.length === 0 && financeSettings.openingBalanceCents === 0}
        />
        <GoalCard goal={data.goal} monthKey={monthKey(now)} />
        <PipelineCard summary={data.pipeline} />
      </div>

      {/* Linha 2: o que fazer */}
      <div className="grid gap-4 lg:grid-cols-5">
        <AttentionPanel items={data.attention.items} total={data.attention.total} className="lg:col-span-3" />
        <AgendaPanel items={data.agenda} className="lg:col-span-2" />
      </div>
    </div>
  )
}

function CashCard({
  balance,
  delta,
  month,
  empty,
}: {
  balance: number
  empty: boolean
  delta: { net: number; pct: number | null }
  month: { income: number; expense: number }
}) {
  const up = delta.net >= 0
  return (
    <Link href="/financeiro" className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <p className="text-xs font-medium text-muted-foreground">Saldo em caixa</p>
      <p className={cn("tabular mt-1 text-3xl font-semibold tracking-tight", balance < 0 && "text-red-600")}>{money(balance)}</p>
      <p className={cn("tabular mt-1 flex items-center gap-1 text-sm font-medium", up ? "text-emerald-600" : "text-red-600")}>
        {up ? <ArrowUpRightIcon className="size-4" /> : <ArrowDownRightIcon className="size-4" />}
        {up ? "+" : "−"}
        {money(Math.abs(delta.net))}
        {delta.pct !== null && <span className="font-normal">({Math.round(Math.abs(delta.pct) * 100)}%)</span>}
        <span className="font-normal text-muted-foreground">este mês</span>
      </p>
      <p className="tabular mt-3 text-xs text-muted-foreground">
        {empty
          ? "Comece informando o saldo atual em Financeiro → Ajustar."
          : `Entrou ${moneyCompact(month.income)} · Saiu ${moneyCompact(month.expense)}`}
      </p>
    </Link>
  )
}

function GoalCard({ goal, monthKey }: { goal: ReturnType<typeof goalProgress>; monthKey: string }) {
  if (!goal.hasGoal) {
    return (
      <div className="flex flex-col rounded-xl border border-dashed bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground">Meta do mês</p>
        <p className="mt-1 text-sm text-muted-foreground">Defina quanto quer faturar este mês para acompanhar o ritmo.</p>
        <div className="mt-auto pt-3">
          <GoalEditor monthKey={monthKey} trigger={<Button size="sm" variant="outline"><TargetIcon /> Definir meta</Button>} />
        </div>
      </div>
    )
  }
  const remaining = Math.max(goal.target - goal.achieved, 0)
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Meta de faturamento do mês</p>
        <GoalEditor monthKey={monthKey} trigger={<button className="text-xs text-muted-foreground hover:text-foreground">Editar</button>} />
      </div>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
        {Math.round(goal.pct * 100)}%
        <span className="ml-2 text-sm font-normal text-muted-foreground">de {moneyCompact(goal.target)}</span>
      </p>
      <div className="mt-3">
        <GoalBar pct={goal.pct} expectedPct={goal.expectedPct} atRisk={goal.atRisk} />
      </div>
      <p className={cn("mt-2.5 text-xs", goal.atRisk ? "font-medium text-amber-700" : "text-muted-foreground")}>
        {goal.pct >= 1
          ? "Meta batida! 🎉"
          : goal.atRisk
            ? `Abaixo do ritmo (esperado ${Math.round(goal.expectedPct * 100)}%). Faltam ${moneyCompact(remaining)}.`
            : `No ritmo. Faltam ${moneyCompact(remaining)}.`}
      </p>
    </div>
  )
}

function PipelineCard({ summary }: { summary: ReturnType<typeof pipelineSummary> }) {
  const max = Math.max(...summary.stages.map((s) => s.valueCents), 1)
  return (
    <Link href="/pipeline" className="group rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Pipeline aberto</p>
        <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
        {moneyCompact(summary.valueCents)}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {summary.count} {summary.count === 1 ? "lead" : "leads"}
        </span>
      </p>
      {summary.count === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">Nenhum lead aberto. Crie o primeiro pelo botão &quot;Novo&quot;.</p>
      ) : (
        <div className="mt-3 grid gap-1.5">
          {summary.stages.map((s) => (
            <div key={s.stage} className="grid grid-cols-[88px_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate text-muted-foreground">{stageLabel(s.stage)}</span>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(s.valueCents / max) * 100}%` }} />
              </div>
              <span className="tabular text-right whitespace-nowrap">
                <span className="font-medium">{s.count}</span>
                <span className="text-muted-foreground"> · {moneyCompact(s.valueCents)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}

const ATTENTION_ICON: Record<AttentionItem["kind"], React.ComponentType<{ className?: string }>> = {
  acao_vencida: ClockIcon,
  tarefa_atrasada: ClockIcon,
  meta: TargetIcon,
  lead_parado: AlertTriangleIcon,
}

function AttentionPanel({ items, total, className }: { items: AttentionItem[]; total: number; className?: string }) {
  return (
    <Panel
      className={className}
      title={
        <span className="flex items-center gap-2">
          Precisa de atenção
          {total > 0 && <span className="tabular rounded-full bg-red-500/10 px-1.5 text-[11px] font-semibold text-red-600">{total}</span>}
        </span>
      }
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
          description="Nenhuma ação vencida, tarefa atrasada ou lead parado. Bom momento para prospectar."
          action={<Button size="sm" variant="outline" onClick={() => openLeadForm()}>Adicionar lead</Button>}
        />
      ) : (
        <ul className="divide-y px-2 pb-2">
          {items.map((item) => {
            const Icon = ATTENTION_ICON[item.kind]
            const tone = item.severity === 3 ? "text-red-600 bg-red-500/10" : item.severity === 2 ? "text-amber-700 bg-amber-500/10" : "text-amber-700 bg-amber-500/10"
            const content = (
              <>
                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md", tone)}>
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                </span>
                {item.ownerId && <UserAvatar userId={item.ownerId} />}
              </>
            )
            return (
              <li key={item.id} className="flex items-center gap-1">
                {item.leadId ? (
                  <Link href={`/pipeline/${item.leadId}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent">
                    {content}
                  </Link>
                ) : item.kind === "meta" ? (
                  <Link href="/financeiro" className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent">
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2.5">{content}</div>
                )}
                {item.kind === "acao_vencida" && item.leadId && (
                  <Button size="sm" variant="outline" onClick={() => useUI.getState().set({ nextActionFor: item.leadId! })}>
                    <CheckIcon /> Feito
                  </Button>
                )}
                {item.kind === "tarefa_atrasada" && item.taskId && (
                  <Button size="sm" variant="outline" onClick={() => toggleTaskWithFeedback(item.taskId!)}>
                    <CheckIcon /> Concluir
                  </Button>
                )}
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
      className={className}
      title="Minhas responsabilidades"
      aside={<span className="text-xs text-muted-foreground">até domingo</span>}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={UserIcon}
          title="Nada com você esta semana"
          description="Tarefas e próximas ações de leads em que você é o responsável aparecem aqui."
        />
      ) : (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {buckets
            .filter((b) => b.items.length > 0)
            .map((b) => (
              <div key={b.id}>
                <p className={cn("mb-1 text-[11px] font-semibold tracking-wide uppercase", b.id === "atrasadas" ? "text-red-600" : "text-muted-foreground")}>
                  {BUCKET_LABEL[b.id]} · {b.items.length}
                </p>
                <ul className="grid gap-0.5">
                  {b.items.map((item) => (
                    <li key={`${item.kind}-${item.id}`} className="flex items-start gap-2.5 rounded-md py-1.5">
                      <Checkbox
                        className="mt-0.5"
                        checked={false}
                        onCheckedChange={() =>
                          item.kind === "task" ? toggleTaskWithFeedback(item.id) : useUI.getState().set({ nextActionFor: item.id })
                        }
                        aria-label="Concluir"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-tight">{item.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.kind === "lead" ? (
                            <Link href={`/pipeline/${item.id}`} className="hover:text-foreground hover:underline">
                              Lead: {item.context}
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
