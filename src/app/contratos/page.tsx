"use client"

import { Suspense, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { AlertTriangleIcon, BanknoteIcon, EyeOffIcon, FileSignatureIcon, PaperclipIcon, PlusIcon, ShieldCheckIcon } from "lucide-react"
import { areaLevel, canReadArea, canWriteArea } from "@/lib/domain/area-access"
import { CONTRACT_AREA, CONTRACT_KINDS, CONTRACT_STATUS, activeValueCents, contractStatus, contractsDue, endLabel, type Contract, type ContractStatus } from "@/lib/domain/contracts"
import { money } from "@/lib/format"
import { contractsTableMissing, useContracts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAreaAccess } from "@/lib/use-area-access"
import { useAreaList } from "@/lib/use-hzk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shared/layout"
import { ContractDialog } from "@/components/contracts/contract-dialog"

export default function ContractsPage() {
  return (
    <Suspense>
      <Contracts />
    </Suspense>
  )
}

type Filter = "todos" | "vigor" | "atencao" | "fora"

const TONE: Record<(typeof CONTRACT_STATUS)[ContractStatus]["tone"], string> = {
  muted: "bg-muted text-muted-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
}

const inFilter = (s: ContractStatus, f: Filter) =>
  f === "todos" || (f === "vigor" && (s === "vigente" || s === "vence-em-breve")) || (f === "atencao" && (s === "vence-em-breve" || s === "vencido")) || (f === "fora" && (s === "rascunho" || s === "encerrado"))

/**
 * Contratos (ADR 0025): o que a empresa assinou, com quem, quanto vale e até quando, com o arquivo
 * junto. Quem vê e quem edita é a área "Contratos e jurídico" (Equipe › Acesso por área): a tela só
 * mostra o que o banco já deixa a pessoa fazer.
 */
function Contracts() {
  const contracts = useContracts((s) => s.items)
  const loaded = useContracts((s) => s.loaded)
  const meId = useStore((s) => s.meId)
  const meLevel = useStore((s) => s.meRoleLevel)
  const areas = useAreaList()
  const { grants, loaded: accessLoaded } = useAreaAccess()
  const [filter, setFilter] = useState<Filter>("todos")
  const [creating, setCreating] = useState(false)
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const openId = params.get("id")
  const now = new Date()

  const area = areas.find((a) => a.id === CONTRACT_AREA) ?? { id: CONTRACT_AREA }
  const level = areaLevel({ id: meId, level: meLevel }, area, grants, now)
  const canRead = canReadArea(level)
  const canWrite = canWriteArea({ level: meLevel }, level)

  const rows = useMemo(() => {
    const at = new Date()
    return contracts
      .map((c) => ({ c, status: contractStatus(c, at) }))
      .filter((r) => inFilter(r.status, filter))
      // Quem pede atenção primeiro; depois por fim de vigência (sem prazo por último) e nome.
      .sort((a, b) => (a.c.endsAt ?? "9999").localeCompare(b.c.endsAt ?? "9999") || a.c.title.localeCompare(b.c.title))
  }, [contracts, filter])
  const due = contractsDue(contracts, now)
  const active = contracts.filter((c) => inFilter(contractStatus(c, now), "vigor"))
  const opened = openId ? contracts.find((c) => c.id === openId) : undefined
  const open = (id?: string) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false })

  const newButton = canWrite && (
    <Button variant="brand" onClick={() => setCreating(true)}>
      <PlusIcon /> Novo contrato
    </Button>
  )

  return (
    <div className="flex flex-col">
      <PageHeader page="/contratos" actions={newButton} />
      <div className="page-body grid gap-4">
        {contractsTableMissing ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Os contratos ainda não foram ligados no banco. Falta aplicar a migration 0029 no Supabase.</p>
        ) : accessLoaded && !canRead ? (
          // Vitrine (ADR 0020): a pessoa sabe que a área existe, mas não vê os dados.
          <EmptyState icon={EyeOffIcon} title="Contratos é uma área restrita" description="Só os founders e quem recebeu acesso veem os contratos. Se precisar, peça acesso a quem cuida da área." className="py-20" />
        ) : !loaded ? null : contracts.length === 0 ? (
          <EmptyState
            icon={FileSignatureIcon}
            title="Nenhum contrato guardado"
            description="Cadastre o que a empresa assinou: com quem, quanto vale e até quando. O app avisa antes de vencer."
            action={newButton || undefined}
            className="py-20"
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Em vigor" icon={ShieldCheckIcon} style={{ "--i": 0 } as React.CSSProperties}>
                <p className="t-value mt-1">{active.length}</p>
              </StatCard>
              <StatCard label="Valor em vigor" icon={BanknoteIcon} style={{ "--i": 1 } as React.CSSProperties}>
                <p className="t-value mt-1">{money(activeValueCents(contracts, now))}</p>
              </StatCard>
              <StatCard label="Pedem atenção" icon={AlertTriangleIcon} style={{ "--i": 2 } as React.CSSProperties}>
                <p className={cn("t-value mt-1", due.length > 0 && "text-warning")}>{due.length}</p>
              </StatCard>
            </div>

            <Segmented
              value={filter}
              onChange={setFilter}
              className="w-fit"
              options={[
                { value: "todos", label: `Todos (${contracts.length})` },
                { value: "vigor", label: "Em vigor" },
                { value: "atencao", label: due.length ? `Pedem atenção (${due.length})` : "Pedem atenção" },
                { value: "fora", label: "Rascunhos e encerrados" },
              ]}
            />

            <Panel>
              {rows.length === 0 ? (
                <p className="t-desc p-5 text-sm">Nenhum contrato neste filtro.</p>
              ) : (
                <ul className="divide-y">
                  {rows.map(({ c, status }) => (
                    <ContractRow key={c.id} contract={c} status={status} now={now} onOpen={() => open(c.id)} />
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>

      {creating && <ContractDialog canWrite={canWrite} onOpenChange={(o) => !o && setCreating(false)} />}
      {opened && !creating && <ContractDialog key={opened.id} contract={opened} canWrite={canWrite} onOpenChange={(o) => !o && open()} />}
    </div>
  )
}

function ContractRow({ contract: c, status, now, onOpen }: { contract: Contract; status: ContractStatus; now: Date; onOpen: () => void }) {
  const st = CONTRACT_STATUS[status]
  const kind = CONTRACT_KINDS.find((k) => k.id === c.kind)?.label
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 text-left transition-colors hover:bg-accent/50">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate text-sm font-semibold">{c.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {c.party} · {kind}
          </span>
        </span>
        {c.files.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`${c.files.length} ${c.files.length === 1 ? "arquivo" : "arquivos"}`}>
            <PaperclipIcon className="size-3.5" /> {c.files.length}
          </span>
        )}
        <span className="tabular w-28 text-right text-sm">{c.valueCents != null ? money(c.valueCents) : <span className="text-muted-foreground">—</span>}</span>
        <span className="w-40 text-right text-xs text-muted-foreground">
          {status === "rascunho" ? "ainda não assinado" : (
            <>
              <span className={cn("block", (status === "vence-em-breve" || status === "vencido") && "font-medium text-foreground")}>{endLabel(c, now)}</span>
              {c.endsAt && !c.closedAt && <span className="tabular block">{format(parseISO(c.endsAt), "dd/MM/yyyy")}</span>}
            </>
          )}
        </span>
        <span className={cn("w-28 rounded-full px-2.5 py-1 text-center text-xs font-medium", TONE[st.tone])}>{st.label}</span>
      </button>
    </li>
  )
}
