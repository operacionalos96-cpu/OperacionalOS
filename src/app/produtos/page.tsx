"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRightIcon, PackageIcon, PlusIcon } from "lucide-react"
import { PRODUCT_STATUSES, productStats, type ProductStatus } from "@/lib/domain/products"
import { moneyCompact } from "@/lib/format"
import { useProducts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader } from "@/components/shared/layout"
import { ProductFormDialog } from "@/components/products/product-form-dialog"
import { ProductStatusBadge, productKindLabel } from "@/components/products/product-bits"

export default function ProductsPage() {
  const products = useProducts((s) => s.items)
  const leads = useStore((s) => s.leads)
  const transactions = useStore((s) => s.transactions)
  const [filter, setFilter] = useState<"todos" | ProductStatus>("todos")
  const [formOpen, setFormOpen] = useState(false)

  const rows = useMemo(() => {
    const now = new Date()
    return products
      .filter((p) => (filter === "todos" ? p.status !== "arquivado" : p.status === filter))
      .map((p) => ({ product: p, stats: productStats(p.id, leads, transactions, now) }))
      .sort((a, b) => b.stats.incomeCents - a.stats.incomeCents || a.product.name.localeCompare(b.product.name))
  }, [products, leads, transactions, filter])

  return (
    <div className="flex flex-col">
      <PageHeader page="/produtos"
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <PlusIcon /> Novo produto
          </Button>
        }
      >
        <Segmented
          size="sm"
          className="w-fit"
          value={filter}
          onChange={setFilter}
          options={[{ value: "todos" as const, label: "Todos" }, ...PRODUCT_STATUSES.map((s) => ({ value: s.id, label: s.label }))]}
        />
      </PageHeader>

      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title={products.length === 0 ? "Nenhum produto cadastrado" : "Nenhum produto neste filtro"}
            description="Cadastre cada produto da operação. Depois, ao criar leads e lançamentos, escolha o produto para acompanhar o resultado de cada um."
            action={
              <Button variant="outline" onClick={() => setFormOpen(true)}>
                <PlusIcon /> Cadastrar produto
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ product, stats }, i) => (
              <Link
                key={product.id}
                href={`/produtos/${product.id}`}
                className="group lift stagger flex flex-col rounded-xl border bg-card"
                style={{ "--i": i } as React.CSSProperties}
              >
                <div className="flex items-start gap-3 border-b p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                    <PackageIcon className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="t-title truncate">{product.name}</p>
                    <p className="t-desc text-xs">
                      {productKindLabel(product.kind)}
                      {product.priceCents ? ` · ${moneyCompact(product.priceCents)}` : ""}
                    </p>
                  </div>
                  <ProductStatusBadge status={product.status} />
                </div>
                <div className="grid grid-cols-3 divide-x">
                  <Metric label="Leads abertos" value={String(stats.openLeads)} />
                  <Metric label="Entrou no mês" value={moneyCompact(stats.incomeMonthCents)} tone={stats.incomeMonthCents > 0 ? "text-success" : undefined} />
                  <Metric label="Resultado" value={moneyCompact(stats.netCents)} tone={stats.netCents < 0 ? "text-danger" : undefined} />
                </div>
                <div className="mt-auto flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
                  <span>
                    {stats.conversion === null ? "Sem vendas decididas ainda" : `Conversão ${Math.round(stats.conversion * 100)}%`} · {product.links.length}{" "}
                    {product.links.length === 1 ? "link" : "links"}
                  </span>
                  <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <ProductFormDialog open={formOpen} product={null} onClose={() => setFormOpen(false)} />
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="t-label">{label}</p>
      <p className={cn("tabular mt-0.5 text-base font-semibold", tone)}>{value}</p>
    </div>
  )
}
