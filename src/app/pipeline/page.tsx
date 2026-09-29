"use client"

import { Suspense, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { KanbanIcon, PlusIcon, SearchIcon, UserPlusIcon } from "lucide-react"
import { leadsNeedingAction } from "@/lib/domain/rules"
import { useStore } from "@/lib/store"
import { openLeadForm } from "@/lib/ui-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader } from "@/components/shared/layout"
import { Kanban } from "@/components/crm/kanban"
import { NeedsActionList } from "@/components/crm/needs-action-list"

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
    const q = query.trim().toLowerCase()
    return allLeads.filter(
      (l) =>
        (owner === "todos" || l.ownerId === meId) &&
        (!q || l.name.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)),
    )
  }, [allLeads, owner, meId, query])

  const needsCount = leadsNeedingAction(leads, new Date()).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Pipeline"
        actions={
          <Button onClick={() => openLeadForm()}>
            <PlusIcon /> Novo lead
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={(v) => setParam("view", v === "acao" ? "acao" : null)}
            options={[
              { value: "quadro", label: "Quadro" },
              {
                value: "acao",
                label: (
                  <>
                    Precisa de ação
                    {needsCount > 0 && (
                      <span className="tabular rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold text-danger">{needsCount}</span>
                    )}
                  </>
                ),
              },
            ]}
          />
          <Segmented
            value={owner}
            onChange={(v) => setParam("dono", v === "meus" ? "meus" : null)}
            options={[
              { value: "todos", label: "Todos" },
              { value: "meus", label: "Meus" },
            ]}
          />
          <div className="relative ml-auto w-full sm:w-56">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Filtrar leads…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8" />
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
          <Kanban leads={leads} />
        ) : (
          <NeedsActionList leads={leads} />
        )}
      </div>
    </div>
  )
}
