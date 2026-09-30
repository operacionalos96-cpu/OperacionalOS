"use client"

import { useMemo } from "react"
import Link from "next/link"
import { HandshakeIcon } from "lucide-react"
import { clients } from "@/lib/domain/insights"
import { money, relative } from "@/lib/format"
import { useProducts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { EmptyState, PageHeader } from "@/components/shared/layout"
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
      <PageHeader title="Clientes" description="Leads ganhos: quanto cada um já pagou e quando foi a última compra." />
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 sm:p-6">
        {rows.length === 0 ? (
          <EmptyState icon={HandshakeIcon} title="Nenhum cliente ainda" description="Quando um lead for marcado como ganho no Pipeline, ele aparece aqui." className="py-20" />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Clientes" value={String(rows.length)} />
              <Stat label="Recebido" value={money(total)} />
              <Stat label="Ticket médio" value={money(Math.round(total / rows.length))} />
            </div>
            <div className="overflow-hidden rounded-xl border bg-card">
              <ul className="divide-y">
                {rows.map((r) => (
                  <li key={r.lead.id}>
                    <Link href={`/pipeline/${r.lead.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.lead.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{[r.lead.company, productName(r.lead.productId)].filter(Boolean).join(" · ") || "—"}</p>
                      </div>
                      <UserAvatar userId={r.lead.ownerId} size="xs" />
                      <span className="hidden w-28 text-right text-xs text-muted-foreground sm:block">{r.lastAt ? relative(r.lastAt) : ""}</span>
                      <span className="tabular w-28 text-right text-sm font-semibold">
                        {money(r.totalCents)}
                        <span className="block text-[11px] font-normal text-muted-foreground">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="t-label">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}
