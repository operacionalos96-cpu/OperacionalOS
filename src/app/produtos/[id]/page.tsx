"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowDownLeftIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ClapperboardIcon,
  ExternalLinkIcon,
  KanbanIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  ReceiptIcon,
  Trash2Icon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon,
  XIcon,
} from "lucide-react"
import { stageColor, stageLabel } from "@/lib/domain/constants"
import { productStats, safeUrl } from "@/lib/domain/products"
import { CONTENT_STAGES } from "@/lib/domain/content"
import { money, moneyCompact, shortDate, uid } from "@/lib/format"
import { useContentItems, useProducts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { openLeadForm, openTxForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, Panel, StatCard, NotFound } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { CountUp } from "@/components/shared/count-up"
import { ProductFormDialog } from "@/components/products/product-form-dialog"
import { ProductStatusBadge, productKindLabel } from "@/components/products/product-bits"
import { RebalanceButton } from "@/components/crm/rebalance-button"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { ProductMapPanel } from "@/components/products/product-map-panel"
import { ContextPanel } from "@/components/entities/context-panel"

export default function ProductPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const product = useProducts((s) => s.items.find((p) => p.id === id))
  const removeProduct = useProducts((s) => s.remove)
  const leads = useStore((s) => s.leads)
  const transactions = useStore((s) => s.transactions)
  const contents = useContentItems((s) => s.items)
  const [editing, setEditing] = useState(false)
  const updateLead = useStore((s) => s.updateLead)

  const data = useMemo(() => {
    const now = new Date()
    return {
      stats: productStats(id, leads, transactions, now),
      leads: leads.filter((l) => l.productId === id).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
      txs: transactions.filter((t) => t.productId === id).sort((a, b) => b.date.localeCompare(a.date)),
      contents: contents.filter((c) => c.productId === id),
    }
  }, [id, leads, transactions, contents])

  if (!product) {
    return (
      <NotFound title="Produto não encontrado" backHref="/produtos" backLabel="Voltar aos produtos" />
    )
  }

  const { stats } = data

  function remove() {
    const removed = removeProduct(product!.id)
    router.push("/produtos")
    if (removed)
      toast(`Produto "${removed.name}" excluído`, {
        description: "Leads e lançamentos continuam existindo, só sem produto.",
        action: { label: "Desfazer", onClick: () => useProducts.getState().restore(removed) },
      })
  }

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-6">
        <Link href="/produtos" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> Produtos
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">{product.name}</h1>
              <ProductStatusBadge status={product.status} />
            </div>
            <p className="t-desc mt-0.5">
              {productKindLabel(product.kind)}
              {product.priceCents ? ` · ${money(product.priceCents)}` : ""}
            </p>
            {product.description && <p className="mt-2 max-w-2xl text-sm text-pretty text-muted-foreground">{product.description}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Editar
            </Button>
            <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={remove} aria-label="Excluir produto">
              <Trash2Icon />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard metric="leads-produto" icon={UsersIcon} style={{ "--i": 0 } as React.CSSProperties}>
            <p className="t-value mt-3">
              <CountUp value={stats.leads} />
            </p>
            <p className="t-desc mt-1 text-xs">
              {stats.openLeads} abertos · {stats.wonLeads} ganhos · {stats.lostLeads} perdidos
            </p>
          </StatCard>
          <StatCard
            metric="conversao"
            icon={TrendingUpIcon}
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <p className="t-value mt-3">{stats.conversion === null ? "—" : `${Math.round(stats.conversion * 100)}%`}</p>
            <p className="t-desc mt-1 text-xs">Pipeline aberto: {moneyCompact(stats.pipelineCents)}</p>
          </StatCard>
          <StatCard
            metric="entradas-produto"
            icon={ArrowDownLeftIcon}
            accent={stats.incomeCents > 0 ? "var(--success)" : undefined}
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <p className="t-value mt-3">
              <CountUp value={stats.incomeCents} format={moneyCompact} />
            </p>
            <p className="t-desc mt-1 text-xs">Este mês: {moneyCompact(stats.incomeMonthCents)}</p>
          </StatCard>
          <StatCard metric="resultado-produto" icon={WalletIcon} style={{ "--i": 3 } as React.CSSProperties}>
            <p className={cn("t-value mt-3", stats.netCents < 0 && "text-danger")}>
              <CountUp value={stats.netCents} format={moneyCompact} />
            </p>
            <p className="t-desc mt-1 text-xs">Saídas: {moneyCompact(stats.expenseCents)}</p>
          </StatCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <LinksPanel productId={product.id} />
          <ProductMapPanel product={product} />
          <ConnectionsPanel entity={{ type: "product", id: product.id }} />
          <ContextPanel entity={{ type: "product", id: product.id }} className="lg:col-span-2" />

          <Panel
            title="Leads deste produto"
            description="Do mais recente para o mais antigo."
            aside={
              <div className="flex gap-1.5">
                {(() => {
                  // Leads abertos com valor diferente do preço atual do produto.
                  const price = product.priceCents
                  const off = price ? data.leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido" && l.valueCents !== price) : []
                  if (!price || !off.length) return null
                  return (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Atualiza o valor estimado dos leads abertos para o preço do produto"
                      onClick={() => {
                        const before = off.map((l) => ({ id: l.id, valueCents: l.valueCents }))
                        for (const l of off) updateLead(l.id, { valueCents: price })
                        toast.success(`${off.length} leads agora valem ${money(price)}`, {
                          action: { label: "Desfazer", onClick: () => before.forEach((b) => useStore.getState().updateLead(b.id, { valueCents: b.valueCents })) },
                        })
                      }}
                    >
                      Aplicar {moneyCompact(price)} em {off.length}
                    </Button>
                  )
                })()}
                <RebalanceButton productId={product.id} />
                <Button size="sm" variant="outline" onClick={() => openLeadForm({ prefill: { productId: product.id } })}>
                  <PlusIcon /> Lead
                </Button>
              </div>
            }
          >
            {data.leads.length === 0 ? (
              <EmptyState icon={KanbanIcon} title="Nenhum lead ligado" description="Ao criar ou editar um lead, escolha este produto em “Produto de interesse”." />
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {data.leads.map((l) => (
                  <li key={l.id}>
                    <Link href={`/pipeline/${l.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: stageColor(l.stage) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{l.name}</span>
                        <span className="t-desc block truncate text-xs">
                          {stageLabel(l.stage)}
                          {l.company ? ` · ${l.company}` : ""}
                        </span>
                      </span>
                      <span className="tabular w-24 shrink-0 text-right text-sm">{moneyCompact(l.valueCents)}</span>
                      <UserAvatar userId={l.ownerId} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Entradas e saídas"
            description="Lançamentos do financeiro ligados a este produto."
            aside={
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => openTxForm({ prefill: { type: "saida", productId: product.id } })}>
                  <ArrowUpRightIcon /> Saída
                </Button>
                <Button size="sm" variant="brand" onClick={() => openTxForm({ prefill: { type: "entrada", productId: product.id } })}>
                  <ArrowDownLeftIcon /> Entrada
                </Button>
              </div>
            }
          >
            {data.txs.length === 0 ? (
              <EmptyState icon={ReceiptIcon} title="Nenhum lançamento ligado" description="Registre entradas (vendas) e saídas (tráfego, ferramentas) escolhendo este produto." />
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {data.txs.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="t-desc w-14 shrink-0 text-xs">{shortDate(t.date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.description}</span>
                      <span className="t-desc block text-xs">{t.category}</span>
                    </span>
                    <span className={cn("tabular w-28 shrink-0 text-right text-sm font-medium", t.type === "entrada" ? "text-success" : "text-foreground")}>
                      {t.type === "entrada" ? "+" : "−"}
                      {money(t.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Conteúdos"
            description="Vídeos e posts que divulgam este produto."
            aside={
              <Link href="/conteudos" className="text-xs text-muted-foreground hover:text-foreground">
                Abrir Conteúdos
              </Link>
            }
          >
            {data.contents.length === 0 ? (
              <EmptyState icon={ClapperboardIcon} title="Nenhum conteúdo ligado" description="Na aba Conteúdos, escolha este produto em cada vídeo." />
            ) : (
              <ul className="max-h-80 divide-y overflow-y-auto">
                {data.contents.map((c) => (
                  <li key={c.id}>
                    <Link href={`/conteudos/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60">
                      <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                      <span className="t-desc shrink-0 text-xs">{CONTENT_STAGES.find((s) => s.id === c.stage)?.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ProductFormDialog open={editing} product={product} onClose={() => setEditing(false)} />
    </div>
  )
}

/** Links do produto: venda, checkout, área de membros, drive, anúncios… Só http(s). */
function LinksPanel({ productId }: { productId: string }) {
  const product = useProducts((s) => s.items.find((p) => p.id === productId))!
  const patch = useProducts((s) => s.patch)
  const [label, setLabel] = useState("")
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  function add(e: React.FormEvent) {
    e.preventDefault()
    const clean = safeUrl(url)
    if (!clean) {
      setError("Link inválido. Use um endereço http(s), ex.: https://pay.hotmart.com/...")
      return
    }
    patch(productId, { links: [...product.links, { id: uid(), label: label.trim() || new URL(clean).hostname, url: clean }] })
    setLabel("")
    setUrl("")
    setError(null)
  }

  return (
    <Panel title="Links" description="Página de vendas, checkout, área de membros, pasta de materiais…">
      <ul className="divide-y">
        {product.links.map((l) => (
          <li key={l.id} className="group flex items-center gap-3 px-4 py-2.5">
            <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{l.label}</span>
              <span className="t-desc block truncate text-xs">{l.url}</span>
            </span>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label={`Abrir ${l.label}`}
            >
              <ExternalLinkIcon className="size-4" />
            </a>
            <button
              onClick={() => patch(productId, { links: product.links.filter((x) => x.id !== l.id) })}
              className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
              aria-label={`Remover ${l.label}`}
            >
              <XIcon className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className={cn("grid gap-2 p-4 sm:grid-cols-[1fr_1.4fr_auto]", product.links.length > 0 && "border-t")}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome (ex.: Checkout)" className="h-8" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8" inputMode="url" />
        <Button type="submit" size="sm" variant="outline" disabled={!url.trim()}>
          <PlusIcon /> Adicionar
        </Button>
        {error && <p className="text-xs text-danger sm:col-span-3">{error}</p>}
      </form>
    </Panel>
  )
}
