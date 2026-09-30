"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ArrowDownLeftIcon, ArrowUpRightIcon, LinkIcon, ReceiptIcon, ScaleIcon, TargetIcon, Trash2Icon, WalletIcon, Link2Icon } from "lucide-react"
import type { Transaction, TransactionType } from "@/lib/domain/types"
import { balance, daysSince, goalProgress, monthDelta, monthKey, monthStats } from "@/lib/domain/rules"
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

  const stats = useMemo(() => {
    const n = new Date()
    return {
      balance: balance(settings, transactions),
      delta: monthDelta(settings, transactions, n),
      month: monthStats(transactions, n),
      goal: goalProgress(settings, transactions, n),
    }
  }, [settings, transactions])

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Saldo em caixa"
            icon={WalletIcon}
            info="Saldo inicial informado + todas as entradas − todas as saídas registradas."
            aside={<OpeningBalanceEditor />}
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <p className={cn("t-value mt-3", stats.balance < 0 && "text-danger")}>
              <CountUp value={stats.balance} format={money} />
            </p>
            <p className={cn("tabular mt-1.5 text-sm font-semibold", stats.delta.net >= 0 ? "text-success" : "text-danger")}>
              {stats.delta.net >= 0 ? "+" : "−"}
              {money(Math.abs(stats.delta.net))} <span className="t-desc font-normal">este mês</span>
            </p>
          </StatCard>

          <StatCard
            label={`Resultado de ${format(now, "MMMM", { locale: ptBR })}`}
            icon={ScaleIcon}
            accent="var(--chart-in)"
            info="Entradas menos saídas lançadas neste mês."
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
            info="Soma das entradas do mês comparada à meta. O traço na barra é onde você deveria estar hoje para bater a meta."
            aside={
              <GoalEditor
                monthKey={monthKey(now)}
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

        <div className="grid gap-4 lg:grid-cols-5">
          <BalanceChart settings={settings} transactions={transactions} className="lg:col-span-3" />
          <ExpensesByCategory transactions={transactions} className="lg:col-span-2" />
        </div>
        <CashflowChart transactions={transactions} />
        <TransactionList transactions={transactions} />
      </div>
    </div>
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

const PAGE_DAYS = 90

function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const leads = useStore((s) => s.leads)
  const [filter, setFilter] = useState<"todos" | TransactionType>("todos")
  const [showAll, setShowAll] = useState(false)
  const now = new Date()

  const filtered = transactions
    .filter((t) => filter === "todos" || t.type === filter)
    .sort((a, b) => b.date.localeCompare(a.date))
  const visible = showAll ? filtered : filtered.filter((t) => daysSince(t.date, now) <= PAGE_DAYS)

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
      title="Lançamentos"
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
          title="Nenhum lançamento ainda"
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
          {!showAll && filtered.length > visible.length && (
            <div className="px-4 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                Mostrar {filtered.length - visible.length} lançamentos mais antigos
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
