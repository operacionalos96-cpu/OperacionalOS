"use client"

import { Suspense, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { leadMatches } from "@/lib/domain/contact"
import { isDiscarded } from "@/lib/domain/prospecting"
import { ChevronDownIcon, FileSpreadsheetIcon, KanbanIcon, ListIcon, PlusIcon, SearchIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import type { Stage } from "@/lib/domain/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/shared/user-avatar"
import { leadsNeedingAction } from "@/lib/domain/rules"
import { useStore } from "@/lib/store"
import { openLeadForm } from "@/lib/ui-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader } from "@/components/shared/layout"
import { Kanban } from "@/components/crm/kanban"
import { NeedsActionList } from "@/components/crm/needs-action-list"
import { ImportLeadsDialog } from "@/components/crm/import-leads-dialog"
import { RebalanceButton } from "@/components/crm/rebalance-button"

export default function PipelinePage() {
  return (
    <Suspense>
      <Pipeline />
    </Suspense>
  )
}

type View = "quadro" | "acao"
type Owner = "todos" | "meus"

function Pipeline() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const allLeads = useStore((s) => s.leads)
  const meId = useStore((s) => s.meId)
  const [query, setQuery] = useState("")
  const [importing, setImporting] = useState(false)

  // Estado na URL: links do Dashboard abrem a visão certa, e o voltar do navegador funciona.
  const view: View = params.get("view") === "acao" ? "acao" : "quadro"
  const owner: Owner = params.get("dono") === "meus" ? "meus" : "todos"

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const leads = useMemo(() => {
    // Descartados na revisão ficam fora do Pipeline (estão no Modo Prospecção → Descartados).
    return allLeads.filter((l) => !isDiscarded(l) && (owner === "todos" || l.ownerId === meId) && leadMatches(l, query))
  }, [allLeads, owner, meId, query])

  const needsCount = leadsNeedingAction(leads, new Date()).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader page="/pipeline"
        actions={
          <>
            <RebalanceButton />
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileSpreadsheetIcon /> Importar planilha
            </Button>
            <Button onClick={() => openLeadForm()}>
              <PlusIcon /> Novo lead
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Modo de visualização (ícones) separado do filtro de dono (menu com avatar). */}
          <Segmented
            value={view}
            onChange={(v) => setParam("view", v === "acao" ? "acao" : null)}
            options={[
              {
                value: "quadro",
                label: (
                  <>
                    <KanbanIcon className="size-3.5" /> Quadro
                  </>
                ),
              },
              {
                value: "acao",
                label: (
                  <>
                    <ListIcon className="size-3.5" /> Precisa de ação
                    {needsCount > 0 && (
                      <span className="tabular rounded-full bg-danger-soft px-1.5 text-xs font-semibold text-danger">{needsCount}</span>
                    )}
                  </>
                ),
              },
            ]}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                {owner === "meus" ? <UserAvatar userId={meId} /> : <UsersIcon className="size-4" />}
                {owner === "meus" ? "Meus leads" : "Todos os donos"}
                <ChevronDownIcon className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => setParam("dono", null)}>
                <UsersIcon /> Todos os donos
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setParam("dono", "meus")}>
                <UserAvatar userId={meId} /> Meus leads
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative ml-auto w-full sm:w-56">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Nome, empresa ou WhatsApp…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8" />
          </div>
        </div>
      </PageHeader>

      <div className="min-h-0 flex-1">
        {allLeads.length === 0 ? (
          <EmptyState
            icon={KanbanIcon}
            title="Seu pipeline está vazio"
            description="Crie seu primeiro lead — só precisa de nome, valor estimado e a próxima ação. Depois é só arrastar entre as colunas."
            action={
              <Button onClick={() => openLeadForm()}>
                <UserPlusIcon /> Criar primeiro lead
              </Button>
            }
            className="py-24"
          />
        ) : view === "quadro" ? (
          <Kanban leads={leads} showOwner={owner === "todos"} focusStage={(params.get("etapa") as Stage | null) ?? null} />
        ) : (
          <NeedsActionList leads={leads} showOwner={owner === "todos"} />
        )}
      </div>
      <ImportLeadsDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  )
}
