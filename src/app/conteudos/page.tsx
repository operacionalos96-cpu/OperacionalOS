"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format as formatDate, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns"
import { ptBR } from "date-fns/locale"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  BarChart3Icon,
  ChevronRightIcon,
  ClapperboardIcon,
  CornerDownRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FilmIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  SendIcon,
  UsersIcon,
} from "lucide-react"
import {
  ASSET_KINDS,
  CONTENT_STAGES,
  PLATFORMS,
  accountTree,
  engagementRate,
  metricsByAccount,
  sumMetrics,
  type ContentAccount,
  type ContentItem,
  type ContentStage,
  type Platform,
} from "@/lib/domain/content"
import { dueLabel } from "@/lib/format"
import { useContentAccounts, useContentItems, useProducts } from "@/lib/modules"
import { cn } from "@/lib/utils"
import { setContentStage } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, GroupLabel, PageHeader, Panel, StatCard } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { CountUp } from "@/components/shared/count-up"
import { AccountFormDialog, NewContentDialog, PlatformIcon, accountLabel, formatLabel, platformLabel } from "@/components/content/content-bits"
import { ConnectionBadge, IntegrationResultToast, SyncMetricsButton, useConnections, type Connection } from "@/components/content/integrations"

type Tab = "producao" | "contas" | "metricas"

export default function ContentPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  )
}

function Content() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const tab = (["producao", "contas", "metricas"].includes(params.get("aba") ?? "") ? params.get("aba") : "producao") as Tab
  const [newOpen, setNewOpen] = useState(false)
  const [accountForm, setAccountForm] = useState<{ open: boolean; account: ContentAccount | null }>({ open: false, account: null })
  const { connections, reload } = useConnections()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Conteúdos"
        description="Do roteiro ao post: produção, arquivos por etapa, contas e métricas."
        actions={
          tab === "metricas" ? (
            <SyncMetricsButton onDone={reload} />
          ) : tab === "contas" ? (
            <Button onClick={() => setAccountForm({ open: true, account: null })}>
              <PlusIcon /> Nova conta
            </Button>
          ) : (
            <Button onClick={() => setNewOpen(true)}>
              <PlusIcon /> Novo conteúdo
            </Button>
          )
        }
      >
        <Segmented
          className="w-fit"
          value={tab}
          onChange={(v) => router.replace(v === "producao" ? pathname : `${pathname}?aba=${v}`, { scroll: false })}
          options={[
            { value: "producao", label: "Produção" },
            { value: "contas", label: "Contas" },
            { value: "metricas", label: "Métricas" },
          ]}
        />
      </PageHeader>

      <div className="min-h-0 flex-1">
        {tab === "producao" && <Production onNew={() => setNewOpen(true)} />}
        {tab === "contas" && (
          <Accounts
            connections={connections}
            onConnectionsChanged={reload}
            onEdit={(account) => setAccountForm({ open: true, account })}
            onNew={() => setAccountForm({ open: true, account: null })}
          />
        )}
        {tab === "metricas" && <Metrics />}
      </div>

      <IntegrationResultToast onResult={reload} />
      <NewContentDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => router.push(`/conteudos/${id}`)} />
      <AccountFormDialog open={accountForm.open} account={accountForm.account} onClose={() => setAccountForm({ open: false, account: null })} />
    </div>
  )
}

// ---------- Produção: quadro por etapa ----------

function Production({ onNew }: { onNew: () => void }) {
  const items = useContentItems((s) => s.items)
  const products = useProducts((s) => s.items)
  const accounts = useContentAccounts((s) => s.items)
  const [productId, setProductId] = useState<string>("todos")
  const [brand, setBrand] = useState<string>("todos")
  const [accountId, setAccountId] = useState<string>("todos")
  const [viewMode, setViewMode] = useState<"etapas" | "calendario">("etapas")
  const [calendarMonth, setCalendarMonth] = useState(formatDate(new Date(), "yyyy-MM"))
  const brands = [...new Set(["HZK", "Gabriel", ...accounts.map((a) => a.brand), ...items.map((i) => i.brand)].filter((v): v is string => !!v?.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const visible = items.filter((i) => {
    const account = accounts.find((a) => a.id === (i.accountId ?? i.posts[0]?.accountId))
    const itemBrand = i.brand ?? account?.brand
    const brandMatches = brand === "todos" || itemBrand === brand || i.posts.some((p) => accounts.find((a) => a.id === p.accountId)?.brand === brand)
    const accountMatches = accountId === "todos" || i.accountId === accountId || i.posts.some((p) => p.accountId === accountId)
    return (productId === "todos" || i.productId === productId) && brandMatches && accountMatches
  })
  const monthStart = startOfMonth(parseISO(`${calendarMonth}-01`))
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calendarEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 })
  const calendarDays = Array.from({ length: differenceInCalendarDays(calendarEnd, calendarStart) + 1 }, (_, i) => addDays(calendarStart, i))

  if (items.length === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={ClapperboardIcon}
        title="Nenhum conteúdo ainda"
        description="Crie o primeiro como ideia. Ele passa por roteiro, gravação (bruto), edição, revisão e fica pronto para postar."
        action={
          <Button variant="outline" onClick={onNew}>
            <PlusIcon /> Novo conteúdo
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-6">
        <Segmented size="sm" value={brand} onChange={setBrand} options={[{ value: "todos", label: "Visão geral" }, ...brands.map((b) => ({ value: b, label: b }))]} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Conta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-xs text-foreground" aria-label="Filtrar produção por conta">
            <option value="todos">Todas</option>
            {accounts.filter((a) => a.active && (brand === "todos" || !a.brand || a.brand === brand)).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.platform}</option>)}
          </select>
        </label>
        {products.length > 0 && <label className="flex items-center gap-2 text-xs text-muted-foreground">Produto
          <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-8 rounded-md border bg-card px-2 text-xs text-foreground" aria-label="Filtrar por produto">
            <option value="todos">Todos</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>}
        <Segmented size="sm" value={viewMode} onChange={setViewMode} options={[{ value: "etapas", label: "Etapas" }, { value: "calendario", label: "Calendário" }]} />
        {viewMode === "calendario" && <div className="flex items-center gap-1">
          <button type="button" aria-label="Mês anterior" onClick={() => setCalendarMonth(formatDate(addDays(monthStart, -1), "yyyy-MM"))} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">‹</button>
          <span className="min-w-28 text-center text-xs font-medium capitalize">{formatDate(monthStart, "MMMM yyyy", { locale: ptBR })}</span>
          <button type="button" aria-label="Próximo mês" onClick={() => setCalendarMonth(formatDate(addDays(endOfMonth(monthStart), 1), "yyyy-MM"))} className="rounded-md border px-2 py-1 text-xs hover:bg-accent">›</button>
        </div>}
        <span className="ml-auto text-xs text-muted-foreground">{visible.length} conteúdos</span>
      </div>
      {viewMode === "etapas" ? <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4 sm:px-6">
        {CONTENT_STAGES.map((stage) => {
          const list = visible.filter((i) => i.stage === stage.id)
          return (
            <section key={stage.id} className="flex w-64 shrink-0 flex-col rounded-xl border bg-muted/40">
              <div className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className="text-sm font-semibold">{stage.label}</span>
                <span className="tabular text-xs text-muted-foreground">{list.length}</span>
              </div>
              <p className="t-desc -mt-1 px-3 pb-2 text-[11px]">{stage.hint}</p>
              <div className="flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {list.map((item, i) => (
                  <ContentCard key={item.id} item={item} index={i} />
                ))}
              </div>
            </section>
          )
        })}
      </div> : <div className="min-h-0 flex-1 overflow-auto p-4 sm:px-6">
        <div className="grid grid-cols-7 gap-1.5">
          {(["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]).map((day) => <div key={day} className="px-2 py-1 text-center text-xs font-semibold text-muted-foreground">{day}</div>)}
          {calendarDays.map((day) => {
            const key = formatDate(day, "yyyy-MM-dd")
            const dayItems = visible.filter((item) => item.dueDate === key)
            return <div key={key} className={cn("min-h-28 rounded-lg border p-1.5 sm:min-h-36 sm:p-2", !isSameMonth(day, monthStart) && "bg-muted/30 opacity-60", formatDate(day, "yyyy-MM-dd") === formatDate(new Date(), "yyyy-MM-dd") && "border-brand")}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{formatDate(day, "d")}</p>
              <div className="grid gap-1">
                {dayItems.map((item) => <Link key={item.id} href={`/conteudos/${item.id}`} className="rounded-md border bg-card px-1.5 py-1 text-[11px] leading-snug hover:border-brand" title={`${item.title} · ${CONTENT_STAGES.find((stage) => stage.id === item.stage)?.label ?? item.stage}`}>
                  <span className="line-clamp-2 font-medium">{item.title}</span><span className="block truncate text-muted-foreground">{item.brand ?? "Sem frente"} · {CONTENT_STAGES.find((stage) => stage.id === item.stage)?.label ?? item.stage}</span>
                </Link>)}
              </div>
            </div>
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">O calendário usa o prazo para publicar. Conteúdos sem prazo continuam visíveis na visão por etapas.</p>
      </div>}
    </div>
  )
}

function ContentCard({ item, index }: { item: ContentItem; index: number }) {
  const product = useProducts((s) => s.items.find((p) => p.id === item.productId))
  const stageIdx = CONTENT_STAGES.findIndex((s) => s.id === item.stage)
  const next = CONTENT_STAGES[stageIdx + 1]
  const assetsDone = new Set(item.assets.map((a) => a.kind)).size
  const published = item.posts.filter((p) => p.status === "publicado").length

  return (
    <div className="group stagger rounded-lg border bg-card p-3 transition-colors hover:border-foreground/20" style={{ "--i": Math.min(index, 10) } as React.CSSProperties}>
      <Link href={`/conteudos/${item.id}`} className="block">
        <p className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</p>
        <p className="t-desc mt-1 truncate text-xs">
          {formatLabel(item.format)}
          {product ? ` · ${product.name}` : ""}{item.brand ? ` · ${item.brand}` : ""}
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
          {item.script?.trim() && (
            <span className="inline-flex items-center gap-1" title="Tem roteiro">
              <FileTextIcon className="size-3" /> roteiro
            </span>
          )}
          <span className="inline-flex items-center gap-1" title="Arquivos por etapa">
            <FilmIcon className="size-3" /> {assetsDone}/{ASSET_KINDS.length}
          </span>
          {item.posts.length > 0 && (
            <span className="inline-flex items-center gap-1" title="Publicações">
              <SendIcon className="size-3" /> {published}/{item.posts.length}
            </span>
          )}
          {item.dueDate && <span className="ml-auto">{dueLabel(item.dueDate)}</span>}
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <UserAvatar userId={item.ownerId} />
        {next && (
          <button
            onClick={() => setContentStage(item, next.id as ContentStage)}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={`Mover para ${next.label}`}
          >
            {next.label} <ChevronRightIcon className="size-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ---------- Contas: principal → cortes, por plataforma ----------

function Accounts({
  onEdit,
  onNew,
  connections,
  onConnectionsChanged,
}: {
  onEdit: (a: ContentAccount) => void
  onNew: () => void
  connections: Map<string, Connection>
  onConnectionsChanged: () => void
}) {
  const accounts = useContentAccounts((s) => s.items)
  const items = useContentItems((s) => s.items)
  const byAccount = useMemo(() => metricsByAccount(items), [items])

  if (accounts.length === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={UsersIcon}
        title="Nenhuma conta cadastrada"
        description="Cadastre a conta principal de cada plataforma e, embaixo dela, as contas de cortes."
        action={
          <Button variant="outline" onClick={onNew}>
            <PlusIcon /> Nova conta
          </Button>
        }
      />
    )
  }

  const platforms = PLATFORMS.filter((p) => accounts.some((a) => a.platform === p.id))

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-card/50 p-4">
        <PlugIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="t-desc">
          <span className="font-medium text-foreground">Métricas automáticas (YouTube e TikTok):</span> clique em <span className="font-medium text-foreground">Conectar</span> em cada
          conta (principal e cortes). Depois, basta colar o link do post publicado no conteúdo: as métricas são atualizadas todo dia e no botão
          “Atualizar métricas”. Publicar direto pelo sistema entra na próxima etapa.
        </p>
      </div>
      {platforms.map((p) => {
        const tree = accountTree(accounts.filter((a) => a.platform === p.id))
        return (
          <Panel
            key={p.id}
            title={
              <span className="flex items-center gap-2">
                <PlatformIcon platform={p.id} /> {p.label}
              </span>
            }
            description={`${accounts.filter((a) => a.platform === p.id).length} contas`}
          >
            <ul className="divide-y">
              {tree.groups.map(({ principal, cuts }) => (
                <li key={principal.id}>
                  <AccountRow account={principal} stats={byAccount.get(principal.id)} onEdit={onEdit} connection={connections.get(principal.id)} onConnectionsChanged={onConnectionsChanged} />
                  {cuts.map((c) => (
                    <AccountRow key={c.id} account={c} stats={byAccount.get(c.id)} onEdit={onEdit} nested connection={connections.get(c.id)} onConnectionsChanged={onConnectionsChanged} />
                  ))}
                </li>
              ))}
              {tree.orphanCuts.map((c) => (
                <li key={c.id}>
                  <AccountRow account={c} stats={byAccount.get(c.id)} onEdit={onEdit} connection={connections.get(c.id)} onConnectionsChanged={onConnectionsChanged} />
                </li>
              ))}
            </ul>
          </Panel>
        )
      })}
    </div>
  )
}

function AccountRow({
  account,
  stats,
  onEdit,
  nested = false,
  connection,
  onConnectionsChanged,
}: {
  account: ContentAccount
  stats?: { posts: number; metrics: { views: number } }
  onEdit: (a: ContentAccount) => void
  nested?: boolean
  connection?: Connection
  onConnectionsChanged: () => void
}) {
  return (
    <div className={cn("group flex items-center gap-3 px-4 py-2.5", nested && "pl-10")}>
      {nested && <CornerDownRightIcon className="-ml-6 size-3.5 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-sm font-medium">
          {accountLabel(account)}
          <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{account.brand || "Sem frente"}</span>
          <span className={cn("rounded px-1.5 py-px text-[10px] font-medium", account.role === "principal" ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground")}>
            {account.role === "principal" ? "Principal" : "Cortes"}
          </span>
        </p>
      </div>
      <span className="hidden w-44 shrink-0 justify-end sm:flex">
        <ConnectionBadge account={account} connection={connection} onChanged={onConnectionsChanged} />
      </span>
      <span className="tabular w-36 shrink-0 text-right text-xs text-muted-foreground">
        {stats ? `${stats.posts} posts · ${compact(stats.metrics.views)} views` : "sem posts"}
      </span>
      <div className="flex w-16 shrink-0 justify-end gap-1">
        {account.url && (
          <a href={account.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Abrir perfil">
            <ExternalLinkIcon className="size-3.5" />
          </a>
        )}
        <button onClick={() => onEdit(account)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Editar conta">
          <PencilIcon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------- Métricas ----------

const numberFmt = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
function compact(n: number) {
  return numberFmt.format(n)
}

function Metrics() {
  const items = useContentItems((s) => s.items)
  const accounts = useContentAccounts((s) => s.items)
  const [brand, setBrand] = useState("todos")
  const [platform, setPlatform] = useState<Platform | "todos">("todos")
  const [accountId, setAccountId] = useState("todos")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const brands = [...new Set(["HZK", "Gabriel", ...accounts.map((a) => a.brand), ...items.map((i) => i.brand)].filter((v): v is string => !!v?.trim()))].sort((a, b) => a.localeCompare(b, "pt-BR"))
  const filteredItems = useMemo(() => items.map((item) => ({ ...item, posts: item.posts.filter((post) => {
    const account = accounts.find((a) => a.id === post.accountId)
    const date = post.metricsAt ?? post.publishedAt
    const brandMatches = brand === "todos" || (account?.brand ?? item.brand) === brand
    const platformMatches = platform === "todos" || account?.platform === platform
    const accountMatches = accountId === "todos" || post.accountId === accountId
    const dateMatches = (!fromDate && !toDate) || (!!date && (!fromDate || date.slice(0, 10) >= fromDate) && (!toDate || date.slice(0, 10) <= toDate))
    return brandMatches && platformMatches && accountMatches && dateMatches
  }) })).filter((item) => item.posts.length > 0), [items, accounts, brand, platform, accountId, fromDate, toDate])
  const byAccount = useMemo(() => metricsByAccount(filteredItems), [filteredItems])
  const total = sumMetrics([...byAccount.values()].map((v) => v.metrics))
  const posts = [...byAccount.values()].reduce((a, v) => a + v.posts, 0)
  const eng = engagementRate(total)

  const byPlatform = useMemo(() => {
    const map = new Map<Platform, { posts: number; views: number }>()
    for (const [accountId, v] of byAccount) {
      const a = accounts.find((x) => x.id === accountId)
      if (!a) continue
      const cur = map.get(a.platform) ?? { posts: 0, views: 0 }
      map.set(a.platform, { posts: cur.posts + v.posts, views: cur.views + v.metrics.views })
    }
    return [...map.entries()].sort((a, b) => b[1].views - a[1].views)
  }, [byAccount, accounts])

  const top = useMemo(
    () => platform === "todos" ? [] : filteredItems
      .map((i) => ({ item: i, views: sumMetrics(i.posts.map((p) => p.metrics)).views }))
      .filter((x) => x.views > 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
    [filteredItems, platform],
  )
  const maxViews = Math.max(...byPlatform.map(([, v]) => v.views), 1)

  if (posts === 0) {
    return (
      <EmptyState
        className="py-20"
        icon={BarChart3Icon}
        title={items.length === 0 ? "Sem métricas ainda" : "Nenhuma métrica para os filtros atuais"}
        description={items.length === 0 ? "Na página de cada conteúdo, registre as publicações (conta, link) e os números. Depois, a integração por API vai atualizar isso sozinha." : "Altere frente, plataforma, conta ou período. Só entram no cálculo publicações marcadas como publicadas e com dados registrados."}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="grid gap-1 text-xs text-muted-foreground">Frente
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-8 min-w-32 rounded-md border bg-background px-2 text-sm text-foreground"><option value="todos">Visão geral</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Plataforma
          <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | "todos")} className="h-8 min-w-32 rounded-md border bg-background px-2 text-sm text-foreground"><option value="todos">Todas</option>{PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">Conta
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 min-w-36 rounded-md border bg-background px-2 text-sm text-foreground"><option value="todos">Todas</option>{accounts.filter((a) => brand === "todos" || !a.brand || a.brand === brand).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">De <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" /></label>
        <label className="grid gap-1 text-xs text-muted-foreground">Até <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-sm text-foreground" /></label>
        <p className="ml-auto text-xs text-muted-foreground">{fromDate || toDate ? `Período ${fromDate || "início"} – ${toDate || "hoje"}` : "Todo o período disponível"}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Publicações" icon={SendIcon} style={{ "--i": 0 } as React.CSSProperties}>
          <p className="t-value mt-3">
            <CountUp value={posts} />
          </p>
        </StatCard>
        <StatCard label="Visualizações" icon={BarChart3Icon} info="Definições variam entre plataformas. Selecione uma plataforma para ver um total comparável dentro dela." style={{ "--i": 1 } as React.CSSProperties}>
          <p className="t-value mt-3">{platform === "todos" ? "Por plataforma" : <CountUp value={total.views} format={compact} />}</p>
        </StatCard>
        <StatCard label="Interações" icon={UsersIcon} info="Curtidas + comentários + compartilhamentos + salvos; exibidas por plataforma para evitar somas de métricas com definições diferentes." style={{ "--i": 2 } as React.CSSProperties}>
          <p className="t-value mt-3">{platform === "todos" ? "Por plataforma" : <CountUp value={total.likes + total.comments + total.shares + total.saves} format={compact} />}</p>
        </StatCard>
        <StatCard label="Engajamento" icon={ClapperboardIcon} info="Interações ÷ visualizações, calculado apenas para a plataforma selecionada." style={{ "--i": 3 } as React.CSSProperties}>
          <p className="t-value mt-3">{platform === "todos" ? "Selecione uma plataforma" : eng === null ? "—" : `${(eng * 100).toFixed(1)}%`}</p>
        </StatCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Visualizações por plataforma" description={`Visualizações informadas por cada plataforma; não são somadas como indicador único. Fonte: publicações registradas · ${fromDate || toDate ? "período filtrado" : "todo o histórico disponível"}.`}>
          <ul className="grid gap-3 p-4">
            {byPlatform.map(([platform, v], i) => (
              <li key={platform} className="grid gap-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <PlatformIcon platform={platform} /> {platformLabel(platform)}
                  </span>
                  <span className="tabular text-muted-foreground">
                    <span className="font-semibold text-foreground">{compact(v.views)}</span> · {v.posts} posts
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="grow-x h-full rounded-full bg-brand" style={{ width: `${(v.views / maxViews) * 100}%`, animationDelay: `${i * 70}ms` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Conteúdos com mais visualizações" description={platform === "todos" ? "Selecione uma plataforma para comparar visualizações com a mesma definição." : `Ranking na plataforma ${platformLabel(platform)} para os filtros atuais.`}>
          {top.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Selecione uma plataforma ou aplique filtros para ver um ranking comparável.</p> : <ol className="divide-y">
            {top.map(({ item, views }, i) => (
              <li key={item.id}>
                <Link href={`/conteudos/${item.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60">
                  <span className="tabular w-5 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  <span className="tabular text-sm font-semibold">{compact(views)}</span>
                </Link>
              </li>
            ))}
          </ol>}
        </Panel>
      </div>

      <Panel title="Por conta" description="Principal e cortes separadas.">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                {["Conta", "Fonte", "Posts", "Views", "Curtidas", "Coment.", "Compart.", "Salvos", "Engaj."].map((h, i) => (
                  <th key={h} className={cn("t-label px-4 py-2 font-semibold", i > 0 && "text-right")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {[...byAccount.entries()]
                .sort((a, b) => b[1].metrics.views - a[1].metrics.views)
                .map(([accountId, v]) => {
                  const a = accounts.find((x) => x.id === accountId)
                  const e = engagementRate(v.metrics)
                  return (
                    <tr key={accountId}>
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          {a && <PlatformIcon platform={a.platform} />}
                          <span className="truncate">{accountLabel(a)}</span>
                          {a?.role === "cortes" && <GroupLabel className="text-[10px]">cortes</GroupLabel>}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                        {[...new Set(filteredItems.flatMap((item) => item.posts.filter((post) => post.accountId === accountId).map((post) => post.source)))].map((source) => source === "api" ? "API" : "Manual").join(" / ") || "—"}
                      </td>
                      {[v.posts, v.metrics.views, v.metrics.likes, v.metrics.comments, v.metrics.shares, v.metrics.saves].map((n, i) => (
                        <td key={i} className="tabular px-4 py-2 text-right">
                          {compact(n)}
                        </td>
                      ))}
                      <td className="tabular px-4 py-2 text-right">{e === null ? "—" : `${(e * 100).toFixed(1)}%`}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
