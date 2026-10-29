"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { endOfMonth, format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ArrowDownLeftIcon, ArrowUpRightIcon, LinkIcon, ReceiptIcon, ScaleIcon, TargetIcon, Trash2Icon, WalletIcon, Link2Icon } from "lucide-react"
import type { Transaction, TransactionType } from "@/lib/domain/types"
import { balanceAsOf, goalProgress, inPeriod, monthDelta, monthKey, monthStats, isRealizedTransaction, periodEnd, plannedStats, referenceDate, transactionState } from "@/lib/domain/rules"
import { money, moneyCompact, moneyInputValue, parseMoney } from "@/lib/format"
import { deleteTransactionWithUndo } from "@/lib/actions"
import { useStore } from "@/lib/store"
import { openTxForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { Button } from "@/components/ui/button"
import { MoneyInput, Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shared/layout"
import { CountUp } from "@/components/shared/count-up"
import { UserAvatar } from "@/components/shared/user-avatar"
import { GoalBar } from "@/components/dashboard/goal-bar"
import { GoalEditor } from "@/components/finance/goal-editor"
import { CashflowChart } from "@/components/finance/cashflow-chart"
import { BalanceChart, ExpensesByCategory } from "@/components/finance/charts"

export default function FinancePage() {
  const transactions = useStore((s) => s.transactions)
  const settings = useStore((s) => s.financeSettings)
  const now = new Date()
  const [tab, setTab] = useState<"visao" | "movimentacoes" | "pagar" | "receber">("visao")
  const [period, setPeriod] = useState(format(now, "yyyy-MM"))
  const periodDate = parseISO(`${period}-01`)
  const asOf = useMemo(() => periodEnd(periodDate, now), [period]) // eslint-disable-line react-hooks/exhaustive-deps
  const goalDate = period < format(now, "yyyy-MM") ? endOfMonth(periodDate) : now

  const stats = useMemo(() => ({
    balance: balanceAsOf(settings, transactions, asOf),
    planned: plannedStats(transactions, periodDate, now),
    delta: monthDelta(settings, transactions, periodDate),
    month: monthStats(transactions, periodDate),
    goal: goalProgress(settings, transactions, goalDate),
  }), [settings, transactions, period, goalDate, asOf])

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Financeiro"
        description="Caixa, meta do mês e cada lançamento. Tudo que entra e sai passa por aqui."
        actions={
          <>
            <Button variant="outline" onClick={() => openTxForm({ prefill: { type: "saida" } })}>
              <ArrowUpRightIcon className="text-chart-out" /> Saída
            </Button>
            <Button variant="brand" onClick={() => openTxForm({ prefill: { type: "entrada" } })}>
              <ArrowDownLeftIcon /> Entrada
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6">
        <Segmented size="sm" value={tab} onChange={setTab} options={[
          { value: "visao", label: "Visão geral" },
          { value: "movimentacoes", label: "Movimentações" },
          { value: "pagar", label: "Contas a pagar" },
          { value: "receber", label: "Contas a receber" },
        ]} />
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">Período
          <input type="month" aria-label="Período dos indicadores financeiros" value={period} onChange={(e) => setPeriod(e.target.value || format(now, "yyyy-MM"))} className="h-8 rounded-md border bg-card px-2 text-sm text-foreground" />
        </label>
      </div>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
        {tab === "visao" && <>
        <p className="text-xs text-muted-foreground">Todos os indicadores desta página referem-se a {format(periodDate, "MMMM yyyy", { locale: ptBR })}: saldo ao fim do período, resultado, meta, gráficos e contas. Somente movimentações realizadas afetam o caixa; compromissos previstos aparecem separados em “Previsto vs realizado”.</p>
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label={period < format(now, "yyyy-MM") ? "Saldo ao fim do período" : "Saldo em caixa atual"}
            icon={WalletIcon}
            info="Saldo inicial informado + entradas realizadas − saídas realizadas. Contas previstas não alteram o caixa."
            aside={<OpeningBalanceEditor />}
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <p className={cn("t-value mt-3", stats.balance < 0 && "text-danger")}>
              <CountUp value={stats.balance} format={money} />
            </p>
            <p className={cn("tabular mt-1.5 text-sm font-semibold", stats.delta.net >= 0 ? "text-success" : "text-danger")}>
              {stats.delta.net >= 0 ? "+" : "−"}
              {money(Math.abs(stats.delta.net))} <span className="t-desc font-normal">no período</span>
            </p>
          </StatCard>

          <StatCard
            label={`Resultado de ${format(periodDate, "MMMM yyyy", { locale: ptBR })}`}
            icon={ScaleIcon}
            accent="var(--chart-in)"
            info="Entradas realizadas menos saídas realizadas no mês selecionado."
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <p className={cn("t-value mt-3", stats.month.net < 0 && "text-danger")}>
              {stats.month.net >= 0 ? "+" : "−"}
              <CountUp value={Math.abs(stats.month.net)} format={moneyCompact} />
            </p>
            <div className="mt-3 grid grid-cols-2 divide-x rounded-lg border bg-muted/40">
              <Stat color="var(--chart-in)" label="Entrou" value={moneyCompact(stats.month.income)} />
              <Stat color="var(--chart-out)" label="Saiu" value={moneyCompact(stats.month.expense)} />
            </div>
          </StatCard>

          <StatCard
            label="Meta de faturamento"
            icon={TargetIcon}
            accent={stats.goal.pct >= 1 ? "var(--success)" : stats.goal.atRisk ? "var(--warning)" : "var(--brand)"}
            info="Entradas realizadas do período selecionado comparadas à meta daquele mês."
            aside={
              <GoalEditor
                monthKey={monthKey(periodDate)}
                trigger={<button className="text-xs font-medium text-brand hover:underline">{stats.goal.hasGoal ? "Editar" : "Definir"}</button>}
              />
            }
            style={{ "--i": 2 } as React.CSSProperties}
          >
            {stats.goal.hasGoal ? (
              <>
                <p className="t-value mt-3">
                  <CountUp value={Math.round(stats.goal.pct * 100)} format={(n) => `${n}%`} />
                </p>
                <p className="t-desc mt-0.5 tabular">
                  {moneyCompact(stats.goal.achieved)} de {moneyCompact(stats.goal.target)}
                </p>
                <div className="mt-3">
                  <GoalBar pct={stats.goal.pct} expectedPct={stats.goal.expectedPct} atRisk={stats.goal.atRisk} />
                </div>
              </>
            ) : (
              <p className="t-desc mt-3">Sem meta para este mês. Defina para acompanhar o ritmo.</p>
            )}
          </StatCard>
        </div>

        <PlannedVsRealized stats={stats} />
        <div className="grid gap-4 lg:grid-cols-5">
          <BalanceChart settings={settings} transactions={transactions} className="lg:col-span-3" asOf={asOf} />
          <ExpensesByCategory transactions={transactions} className="lg:col-span-2" period={periodDate} />
        </div>
        <CashflowChart transactions={transactions.filter(isRealizedTransaction)} asOf={asOf} />
        </>}
        {tab === "movimentacoes" && <TransactionList transactions={transactions.filter((t) => isRealizedTransaction(t) && inPeriod(t, periodDate))} periodLabel={format(periodDate, "MMMM yyyy", { locale: ptBR })} />}
        {tab === "pagar" && <PlannedAccounts transactions={transactions} type="saida" periodDate={periodDate} />}
        {tab === "receber" && <PlannedAccounts transactions={transactions} type="entrada" periodDate={periodDate} />}
      </div>
    </div>
  )
}

function PlannedVsRealized({ stats }: { stats: { planned: ReturnType<typeof plannedStats>; month: { income: number; expense: number; net: number }; balance: number } }) {
  const { planned, month } = stats
  const projected = stats.balance + planned.netOpen
  return (
    <Panel title="Previsto vs realizado" description="Realizado já passou pelo caixa. Previsto são contas com vencimento no período ainda não baixadas.">
      <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3"><p className="t-label">Entradas</p>
          <p className="tabular mt-1 text-sm">Realizado <span className="font-semibold text-success">{money(month.income)}</span></p>
          <p className="tabular text-sm">A receber <span className="font-semibold">{money(planned.incomeOpen)}</span>{planned.incomeOverdue > 0 && <span className="ml-1 text-xs text-danger">({money(planned.incomeOverdue)} vencido)</span>}</p></div>
        <div className="px-4 py-3"><p className="t-label">Saídas</p>
          <p className="tabular mt-1 text-sm">Realizado <span className="font-semibold">{money(month.expense)}</span></p>
          <p className="tabular text-sm">A pagar <span className="font-semibold">{money(planned.expenseOpen)}</span>{planned.expenseOverdue > 0 && <span className="ml-1 text-xs text-danger">({money(planned.expenseOverdue)} vencido)</span>}</p></div>
        <div className="px-4 py-3"><p className="t-label">Caixa</p>
          <p className="tabular mt-1 text-sm">Efetivo <span className="font-semibold">{money(stats.balance)}</span></p>
          <p className={cn("tabular text-sm", projected < 0 && "text-danger")}>Projetado se tudo for baixado <span className="font-semibold">{money(projected)}</span></p></div>
      </div>
    </Panel>
  )
}

const STATE_LABEL = (payable: boolean) => ({ realizado: payable ? "Pago" : "Recebido", previsto: "Previsto", parcial: "Parcial", vencido: "Vencido" })
const STATE_CLASS = { realizado: "bg-success/10 text-success", previsto: "bg-warning/10 text-warning", parcial: "bg-brand/10 text-brand", vencido: "bg-danger/10 text-danger" }

function PlannedAccounts({ transactions, type, periodDate }: { transactions: Transaction[]; type: TransactionType; periodDate: Date }) {
  const settleTransaction = useStore((s) => s.settleTransaction)
  const updateTransaction = useStore((s) => s.updateTransaction)
  const leads = useStore((s) => s.leads)
  const [view, setView] = useState<"abertas" | "todas">("abertas")
  const now = new Date()
  const ofType = transactions.filter((t) => t.type === type)
  const rows = ofType.filter((t) => inPeriod(t, periodDate) && (view === "todas" || t.status === "previsto"))
    .sort((a, b) => referenceDate(a).localeCompare(referenceDate(b)))
  const outsideOverdue = ofType.filter((t) => t.status === "previsto" && !inPeriod(t, periodDate) && transactionState(t, now) === "vencido").length
  const total = rows.filter((t) => t.status === "previsto").reduce((sum, t) => sum + t.amountCents, 0)
  const isPayable = type === "saida"
  const label = format(periodDate, "MMMM yyyy", { locale: ptBR })
  return <Panel title={isPayable ? "Contas a pagar" : "Contas a receber"} description={`Vencimentos e baixas de ${label}. ${isPayable ? "Pagamentos" : "Recebimentos"} só entram no caixa quando baixados.`} aside={<Segmented size="sm" value={view} onChange={setView} options={[{ value: "abertas", label: "Em aberto" }, { value: "todas", label: "Todas" }]} />}>
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div><p className="t-label">Total previsto em aberto no período</p><p className="t-value mt-1">{money(total)}</p>
        {outsideOverdue > 0 && <p className="mt-1 text-xs text-danger">{outsideOverdue} vencida(s) em outros períodos — mude o período para vê-las.</p>}</div>
      <Button size="sm" onClick={() => openTxForm({ prefill: { type, status: "previsto" } })}>{isPayable ? "Nova conta a pagar" : "Novo recebimento"}</Button>
    </div>
    {rows.length === 0 ? <EmptyState icon={ReceiptIcon} title={view === "abertas" ? "Nenhum compromisso em aberto neste período" : "Nenhum registro neste período"} description={isPayable ? "Cadastre despesas previstas para acompanhar vencimentos sem afetar o caixa antes do pagamento." : "Cadastre recebimentos previstos para acompanhar entradas sem inflar o saldo atual."} action={<Button onClick={() => openTxForm({ prefill: { type, status: "previsto" } })}>{isPayable ? "Adicionar conta a pagar" : "Adicionar conta a receber"}</Button>} /> : <ul className="divide-y">
      {rows.map((t) => { const lead = t.leadId ? leads.find((l) => l.id === t.leadId) : undefined; const st = transactionState(t, now); const realized = st === "realizado"; return <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{t.description}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{t.category}<span>· vencimento {format(parseISO(t.dueDate ?? t.date), "dd/MM/yyyy")}</span>{realized && t.dueDate && t.dueDate !== t.date && <span>· {isPayable ? "pago" : "recebido"} em {format(parseISO(t.date), "dd/MM/yyyy")}</span>}{t.originalCents && t.originalCents > t.amountCents && !realized && <span>· restam {money(t.amountCents)} de {money(t.originalCents)}</span>}{t.projectName && <span>· projeto: {t.projectName}</span>}{lead && <Link href={`/pipeline/${lead.id}`} className="hover:underline">· cliente: {lead.name}</Link>}</p></div>
        <span className={cn("rounded-full px-2 py-1 text-xs font-medium", STATE_CLASS[st])}>{STATE_LABEL(isPayable)[st]}</span>
        <span className="tabular w-28 text-right text-sm font-semibold">{money(t.amountCents)}</span>
        {!realized && <SettleButton payable={isPayable} t={t} onSettle={(date, cents) => { settleTransaction(t.id, { date, amountCents: cents }); toast.success(isPayable ? "Pagamento registrado" : "Recebimento registrado") }} />}
        {realized && view === "todas" && <Button size="sm" variant="ghost" onClick={() => updateTransaction(t.id, { status: "previsto", date: t.dueDate ?? t.date, dueDate: t.dueDate ?? t.date })}>Reabrir</Button>}
      </li> })}
    </ul>}
  </Panel>
}

function SettleButton({ t, payable, onSettle }: { t: Transaction; payable: boolean; onSettle: (date: string, cents: number) => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [text, setText] = useState("")
  const parsed = text.trim() === "" ? t.amountCents : parseMoney(text)
  const valid = parsed !== null && parsed > 0 && parsed <= t.amountCents
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDate(format(new Date(), "yyyy-MM-dd")); setText(moneyInputValue(t.amountCents)) } }}>
      <PopoverTrigger asChild><Button size="sm" variant="outline">{payable ? "Marcar pago" : "Marcar recebido"}</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); if (!valid || parsed === null) return; onSettle(date, parsed); setOpen(false) }}>
          <p className="text-sm font-medium">{payable ? "Data do pagamento" : "Data do recebimento"}</p>
          <input type="date" aria-label="Data efetiva" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-sm" />
          <p className="text-xs text-muted-foreground">Valor {payable ? "pago" : "recebido"} (menor que o total registra parcial e mantém o restante em aberto)</p>
          <MoneyInput value={text} onChange={(v) => setText(v)} />
          <Button type="submit" size="sm" disabled={!valid || !date}>Confirmar baixa</Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-3 py-2">
      <p className="t-label flex items-center gap-1.5">
        <span className="size-2 rounded-[3px]" style={{ background: color }} />
        {label}
      </p>
      <p className="tabular text-sm font-semibold">{value}</p>
    </div>
  )
}

function OpeningBalanceEditor() {
  const current = useStore((s) => s.financeSettings.openingBalanceCents)
  const setOpeningBalance = useStore((s) => s.setOpeningBalance)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const cents = parseMoney(text)

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setText(moneyInputValue(current))
      }}
    >
      <PopoverTrigger asChild>
        <button className="text-xs text-muted-foreground hover:text-foreground">Ajustar</button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (cents === null) return
            setOpeningBalance(cents)
            setOpen(false)
            toast.success("Saldo inicial atualizado")
          }}
        >
          <p className="text-sm font-medium">Saldo inicial</p>
          <p className="text-xs text-muted-foreground">
            Quanto havia em caixa antes do primeiro lançamento registrado aqui. Normalmente só se ajusta uma vez.
          </p>
          <MoneyInput value={text} onChange={(t) => setText(t)} autoFocus />
          <Button type="submit" size="sm" disabled={cents === null}>
            Salvar
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function TransactionList({ transactions, periodLabel }: { transactions: Transaction[]; periodLabel: string }) {
  const leads = useStore((s) => s.leads)
  const [filter, setFilter] = useState<"todos" | TransactionType>("todos")

  const filtered = transactions
    .filter((t) => filter === "todos" || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date))
  const visible = filtered

  // Agrupa por mês para leitura rápida.
  const groups: { key: string; items: Transaction[] }[] = []
  for (const t of visible) {
    const key = t.date.slice(0, 7)
    const g = groups.at(-1)
    if (g?.key === key) g.items.push(t)
    else groups.push({ key, items: [t] })
  }

  return (
    <Panel
      title={`Movimentações realizadas · ${periodLabel}`}
      aside={
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todos", label: "Todos" },
            { value: "entrada", label: "Entradas" },
            { value: "saida", label: "Saídas" },
          ]}
        />
      }
    >
      {transactions.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title="Nenhum lançamento realizado neste período"
          description="Registre cada dinheiro que entra ou sai. Leva 10 segundos e mantém o saldo sempre certo."
          action={<Button onClick={() => openTxForm()}>Registrar primeiro lançamento</Button>}
        />
      ) : (
        <div className="pb-2">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="sticky top-0 bg-card px-4 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {format(parseISO(`${g.key}-01`), "MMMM yyyy", { locale: ptBR })}
              </p>
              <ul>
                {g.items.map((t) => {
                  const lead = t.leadId ? leads.find((l) => l.id === t.leadId) : undefined
                  return (
                    <li key={t.id} className="group flex items-center gap-3 px-4 py-2 hover:bg-accent/50">
                      <span className="tabular w-12 shrink-0 text-xs text-muted-foreground">{format(parseISO(t.date), "dd MMM", { locale: ptBR })}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{t.description}</p>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t.category}
                          {t.dueDate && <span>· venc. {format(parseISO(t.dueDate), "dd/MM")}</span>}
                          <span className="rounded bg-success/10 px-1 text-[10px] font-medium text-success">{t.type === "entrada" ? "Recebido" : "Pago"}</span>
                          {t.projectName && <span>· projeto: {t.projectName}</span>}
                          {t.source && <span className="rounded bg-muted px-1 text-[10px] font-medium capitalize">via {t.source}</span>}
                          {lead && (
                            <Link href={`/pipeline/${lead.id}`} className="inline-flex items-center gap-0.5 hover:text-foreground hover:underline">
                              · <LinkIcon className="size-3" /> {lead.name}
                            </Link>
                          )}
                        </p>
                      </div>
                      <UserAvatar userId={t.createdById} size="xs" />
                      <span className={cn("tabular w-28 text-right text-sm font-medium", t.type === "entrada" ? "text-success" : "text-foreground")}>
                        {t.type === "entrada" ? "+" : "−"}
                        {money(t.amountCents)}
                      </span>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground focus:opacity-100 data-[state=open]:opacity-100" aria-label="Conexões do lançamento" title="Conectar a uma meta, tarefa, conteúdo…">
                            <Link2Icon className="size-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80 p-0">
                          <p className="t-label px-4 pt-3">Conexões</p>
                          <ConnectionsPanel entity={{ type: "transaction", id: t.id }} bare />
                        </PopoverContent>
                      </Popover>
                      <button
                        onClick={() => deleteTransactionWithUndo(t.id)}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100"
                        aria-label="Excluir lançamento"
                      >
                        <Trash2Icon className="size-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
