"use client"

import { useMemo } from "react"
import Link from "next/link"
import { BarChart3Icon, Building2Icon, CalendarIcon, CoinsIcon, HandshakeIcon, UserIcon, UsersIcon, WalletIcon } from "lucide-react"
import { clients } from "@/lib/domain/insights"
import { money, relative } from "@/lib/format"
import { useProducts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { EmptyState, PageHeader, StatCard } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"

/** Cliente = lead ganho. Mesma entidade do Pipeline, outra visão: quanto cada um já pagou. */
export default function ClientsPage() {
  const leads = useStore((s) => s.leads)
  const transactions = useStore((s) => s.transactions)
  const products = useProducts((s) => s.items)
  const rows = useMemo(() => clients(leads, transactions), [leads, transactions])
  const total = rows.reduce((a, r) => a + r.totalCents, 0)
  const productName = (id?: string) => products.find((p) => p.id === id)?.name

  return (
    <div className="flex flex-col">
      <PageHeader page="/clientes" />
      <div className="page-body grid gap-4">
        {rows.length === 0 ? (
          <EmptyState icon={HandshakeIcon} title="Nenhum cliente ainda" description="Quando um lead for marcado como ganho no Pipeline, ele aparece aqui." className="py-20" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Clientes" icon={UsersIcon} style={{ "--i": 0 } as React.CSSProperties}>
                <p className="t-value mt-1">{rows.length}</p>
              </StatCard>
              <StatCard label="Recebido" icon={CoinsIcon} style={{ "--i": 1 } as React.CSSProperties}>
                <p className="t-value mt-1">{money(total)}</p>
              </StatCard>
              <StatCard label="Ticket médio" icon={BarChart3Icon} led style={{ "--i": 2 } as React.CSSProperties}>
                <p className="t-value mt-1">{money(Math.round(total / rows.length))}</p>
              </StatCard>
            </div>
            <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
              {/* Cabeçalho da tabela com ícone em cada coluna (mock). */}
              <div className="hidden items-center gap-4 border-b px-5 py-3 text-sm font-medium text-muted-foreground sm:flex">
                <span className="flex flex-1 items-center gap-2"><Building2Icon className="size-4" /> Cliente</span>
                <span className="flex w-36 items-center gap-2"><UserIcon className="size-4" /> Responsável</span>
                <span className="flex w-40 items-center gap-2"><CalendarIcon className="size-4" /> Última compra</span>
                <span className="flex w-36 items-center gap-2"><WalletIcon className="size-4" /> Recebido</span>
              </div>
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.lead.id}>
                    <Link href={`/pipeline/${r.lead.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-highlight/20 bg-highlight-soft text-highlight">
                        <HandshakeIcon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold">{r.lead.name}</p>
                        <p className="truncate text-sm text-muted-foreground">{[r.lead.company, productName(r.lead.productId)].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <span className="hidden w-36 sm:block">
                        <UserAvatar userId={r.lead.ownerId} />
                      </span>
                      <span className="hidden w-40 items-center gap-2 text-sm text-muted-foreground sm:flex">
                        {r.lastAt && <><CalendarIcon className="size-4" /> {relative(r.lastAt)}</>}
                      </span>
                      <span className="tabular w-36 text-base font-semibold">
                        {money(r.totalCents)}
                        <span className="block text-xs font-normal text-muted-foreground">
                          {r.purchases} {r.purchases === 1 ? "entrada" : "entradas"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
