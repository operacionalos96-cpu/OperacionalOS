"use client"

import { useState } from "react"
import { CircleCheckIcon, PlusIcon, TargetIcon } from "lucide-react"
import { useGoals } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/layout"
import { GoalDialog, GoalRow } from "@/components/goals/goal-bits"

/** Metas da equipe: receita, vendas, tarefas ligadas ou manual — com progresso automático. */
export default function GoalsPage() {
  const goals = useGoals((s) => s.items)
  const [creating, setCreating] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const active = goals.filter((g) => g.end >= today).sort((a, b) => a.end.localeCompare(b.end))
  const past = goals.filter((g) => g.end < today).sort((a, b) => b.end.localeCompare(a.end))
  const newButton = (
    <Button variant="brand" onClick={() => setCreating(true)}>
      <PlusIcon /> Nova meta
    </Button>
  )
  return (
    <div className="flex flex-col">
      <PageHeader page="/metas" actions={newButton} />
      <div className="page-body grid gap-5">
        <GoalSection icon={TargetIcon} title="Em andamento" count={active.length}>
          {active.length ? (
            active.map((g) => <GoalRow key={g.id} goal={g} size="large" />)
          ) : (
            // Vazio na horizontal (mock): ícone | texto | ação.
            <div className="flex flex-col items-center gap-5 px-6 py-8 text-center sm:flex-row sm:justify-center sm:text-left">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border bg-muted/60">
                <TargetIcon className="size-7 text-muted-foreground" />
              </span>
              <span className="hidden h-12 w-px bg-border sm:block" aria-hidden />
              <div>
                <p className="text-lg font-semibold">{goals.length ? "Nenhuma meta em andamento" : "Nenhuma meta ainda"}</p>
                <p className="text-sm text-muted-foreground">Crie uma nova meta para acompanhar o progresso da empresa.</p>
              </div>
              <Button variant="outline" className="border-brand text-foreground sm:ml-6" onClick={() => setCreating(true)}>
                <PlusIcon className="text-brand" /> Nova meta
              </Button>
            </div>
          )}
        </GoalSection>
        {past.length > 0 && (
          <GoalSection icon={CircleCheckIcon} title="Encerradas" count={past.length}>
            {past.map((g) => <GoalRow key={g.id} goal={g} size="large" />)}
          </GoalSection>
        )}
      </div>
      {creating && <GoalDialog open onOpenChange={setCreating} />}
    </div>
  )
}

/** Bloco da página Metas: ícone laranja, título e contagem em pílula. */
function GoalSection({ icon: Icon, title, count, children }: { icon: React.ComponentType<{ className?: string }>; title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <header className="flex items-center gap-3 border-b px-5 py-4">
        <Icon className="size-6 text-highlight" />
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="tabular ml-auto rounded-full bg-muted px-3 py-1 text-xs font-semibold">
          {count} {count === 1 ? "meta" : "metas"}
        </span>
      </header>
      <div className="grid gap-1 p-2">{children}</div>
    </section>
  )
}
