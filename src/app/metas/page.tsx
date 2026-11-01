"use client"

import { useState } from "react"
import { PlusIcon, TargetIcon } from "lucide-react"
import { useGoals } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout"
import { GoalDialog, GoalRow } from "@/components/goals/goal-bits"

/** Metas da equipe: receita, vendas, tarefas ligadas ou manual — com progresso automático. */
export default function GoalsPage() {
  const goals = useGoals((s) => s.items)
  const [creating, setCreating] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const active = goals.filter((g) => g.end >= today).sort((a, b) => a.end.localeCompare(b.end))
  const past = goals.filter((g) => g.end < today).sort((a, b) => b.end.localeCompare(a.end))
  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <PlusIcon /> Nova meta
    </Button>
  )
  return (
    <div className="flex flex-col">
      <PageHeader page="/metas" actions={newButton} />
      <div className="page-body is-narrow grid gap-4">
        {goals.length === 0 ? (
          <EmptyState icon={TargetIcon} title="Nenhuma meta ainda" description="Crie uma meta de receita, de vendas ou ligada a tarefas." action={newButton} className="py-20" />
        ) : (
          <>
            <Panel title="Em andamento">
              <div className="grid gap-1 p-2">{active.length ? active.map((g) => <GoalRow key={g.id} goal={g} />) : <EmptyState icon={TargetIcon} title="Nenhuma meta em andamento" description="As metas encerradas ficam abaixo. Crie uma nova para acompanhar o ritmo." action={newButton} className="py-8" />}</div>
            </Panel>
            {past.length > 0 && (
              <Panel title="Encerradas">
                <div className="grid gap-1 p-2 opacity-80">{past.map((g) => <GoalRow key={g.id} goal={g} />)}</div>
              </Panel>
            )}
          </>
        )}
      </div>
      {creating && <GoalDialog open onOpenChange={setCreating} />}
    </div>
  )
}
