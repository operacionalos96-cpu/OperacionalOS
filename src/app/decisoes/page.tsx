"use client"

import { useMemo, useState } from "react"
import { PlusIcon, ScaleIcon } from "lucide-react"
import { decisionOverdue, decisionsWaitingFor, kindOf } from "@/lib/domain/items"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout"
import { DecisionCard } from "@/components/hzk/decision-card"
import { DecisionDialog } from "@/components/hzk/decision-dialog"

/** Decisões (HZK OS): esperando por você, em aberto no time, e o histórico com o motivo de cada escolha. */
export default function DecisionsPage() {
  const items = useStore((s) => s.items)
  const meId = useStore((s) => s.meId)
  const [creating, setCreating] = useState(false)
  const now = new Date()

  const decisions = useMemo(() => items.filter((t) => kindOf(t) === "decision" && !t.archivedAt && !t.inbox), [items])
  const mine = decisionsWaitingFor(meId, decisions)
  const open = decisions.filter((d) => !mine.includes(d) && d.decision?.status !== "decidida" && d.decision?.status !== "recusada")
  const history = decisions
    .filter((d) => d.decision?.status === "decidida" || d.decision?.status === "recusada")
    .sort((a, b) => (b.decision?.decidedAt ?? "").localeCompare(a.decision?.decidedAt ?? ""))

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon /> Nova decisão
    </Button>
  )

  return (
    <div className="flex flex-col">
      <PageHeader page="/decisoes" actions={newButton} />
      <div className="page-body is-narrow grid gap-4">
        {decisions.length === 0 ? (
          <EmptyState icon={ScaleIcon} title="Nenhuma decisão ainda" description="Quando algo precisar ser escolhido, registre aqui: o app mostra quem decide e guarda o motivo." action={newButton} className="py-20" />
        ) : (
          <>
            {mine.length > 0 && (
              <Panel title="Esperando a sua decisão" description="Escolha uma opção, recuse ou peça mais contexto.">
                <ul className="divide-y">{mine.map((d) => <DecisionCard key={d.id} item={d} canDecide overdue={decisionOverdue(d, now)} />)}</ul>
              </Panel>
            )}
            {open.length > 0 && (
              <Panel title="Em aberto no time">
                <ul className="divide-y">{open.map((d) => <DecisionCard key={d.id} item={d} overdue={decisionOverdue(d, now)} />)}</ul>
              </Panel>
            )}
            <Panel title="Histórico de decisões" description="O que foi escolhido, por quem e por quê.">
              {history.length ? <ul className="divide-y">{history.map((d) => <DecisionCard key={d.id} item={d} />)}</ul> : <p className="t-desc p-4 text-sm">Nada decidido ainda.</p>}
            </Panel>
          </>
        )}
      </div>
      {creating && <DecisionDialog open onOpenChange={setCreating} />}
    </div>
  )
}
