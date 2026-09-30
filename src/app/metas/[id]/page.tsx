"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, PencilIcon, SearchXIcon, Trash2Icon } from "lucide-react"
import { GOAL_SOURCES } from "@/lib/domain/insights"
import { useGoals, useProducts } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { EmptyState, Panel } from "@/components/shared/layout"
import { GoalDialog, GoalRow } from "@/components/goals/goal-bits"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { ContextPanel } from "@/components/entities/context-panel"

export default function GoalPage() {
  const { id } = useParams<{ id: string }>()
  const goal = useGoals((s) => s.items.find((g) => g.id === id))
  const product = useProducts((s) => s.items.find((p) => p.id === goal?.productId))
  const [editing, setEditing] = useState(false)
  const router = useRouter()

  if (!goal)
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Meta não encontrada"
        action={
          <Button asChild variant="outline">
            <Link href="/metas">Voltar às metas</Link>
          </Button>
        }
        className="py-24"
      />
    )

  function remove() {
    router.push("/metas")
    const removed = useGoals.getState().remove(goal!.id)
    if (removed) toast(`Meta "${removed.title}" excluída`, { action: { label: "Desfazer", onClick: () => useGoals.getState().restore(removed) } })
  }

  const source = GOAL_SOURCES.find((s) => s.id === goal.source)
  const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 sm:p-6 lg:grid-cols-[1fr_20rem]">
      <div className="grid h-fit gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar às metas">
            <Link href="/metas">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <p className="t-label">Meta</p>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Editar
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={remove} aria-label="Excluir meta">
              <Trash2Icon />
            </Button>
          </div>
        </div>
        <Panel title={goal.title} description={`${source?.label} · ${fmt(goal.start)} a ${fmt(goal.end)}${product ? ` · ${product.name}` : ""}`}>
          <div className="p-3">
            <GoalRow goal={goal} className="pointer-events-none" />
            <p className="t-desc px-2 text-xs">{source?.hint}.</p>
          </div>
        </Panel>
        <ContextPanel entity={{ type: "goal", id: goal.id }} />
      </div>
      <ConnectionsPanel entity={{ type: "goal", id: goal.id }} className="h-fit" />
      {editing && <GoalDialog open onOpenChange={setEditing} goal={goal} />}
    </div>
  )
}
