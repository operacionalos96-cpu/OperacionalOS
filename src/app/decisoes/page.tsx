"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangleIcon, PlusIcon, ScaleIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { decisionOverdue, decisionsWaitingFor, kindOf } from "@/lib/domain/items"
import type { Task } from "@/lib/domain/types"
import { dueLabel } from "@/lib/format"
import { notify } from "@/lib/notifications"
import { useStore } from "@/lib/store"
import { useAreaList } from "@/lib/use-hzk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout"
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
      <div className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6">
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

function DecisionCard({ item, canDecide, overdue }: { item: Task; canDecide?: boolean; overdue?: boolean }) {
  const meId = useStore((s) => s.meId)
  const updateItem = useStore((s) => s.updateItem)
  const areas = useAreaList()
  const [reason, setReason] = useState("")
  const [editing, setEditing] = useState(false)
  const d = item.decision
  if (!d) return null
  const area = areas.find((a) => a.id === item.areaId)
  const chosen = d.options.find((o) => o.id === d.outcome)

  function answer(status: "decidida" | "recusada" | "mais_contexto", outcome?: string) {
    if (status !== "mais_contexto" && !reason.trim()) {
      toast.error("Escreva o motivo em uma frase", { description: "Ele fica no histórico para todo mundo entender a escolha." })
      return
    }
    const before = d!
    updateItem(item.id, { decision: { ...d!, status, outcome, reason: reason.trim() || undefined, decidedAt: status === "mais_contexto" ? undefined : new Date().toISOString().slice(0, 10), decidedBy: meId } })
    notify([item.createdById ?? item.ownerId], {
      kind: "decisao",
      title: status === "mais_contexto" ? `Pediram mais contexto: ${item.title}` : `Decidido: ${item.title}`,
      href: "/decisoes",
      fromId: meId,
    })
    toast.success(status === "decidida" ? "Decisão registrada" : status === "recusada" ? "Recusada" : "Pedido de contexto enviado", {
      action: { label: "Desfazer", onClick: () => updateItem(item.id, { decision: before }) },
    })
  }

  return (
    <li className="grid gap-2 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {area && <span className="rounded-full border bg-card px-2 py-0.5 font-medium text-muted-foreground">{area.name}</span>}
        {overdue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 font-medium text-danger">
            <AlertTriangleIcon className="size-3.5" /> Prazo vencido
          </span>
        )}
        {d.status === "mais_contexto" && <span className="rounded-full bg-warning-soft px-2 py-0.5 font-medium text-warning">Pediram mais contexto</span>}
        <span className="t-desc ml-auto">
          Decide: {(d.deciderIds ?? (d.deciderId ? [d.deciderId] : [])).map((x) => getUser(x).name).join(" ou ") || "—"}
          {item.dueDate && d.status !== "decidida" && d.status !== "recusada" && ` · ${dueLabel(item.dueDate)}`}
        </span>
      </div>
      <p className="text-[15px] font-semibold">{item.title}</p>
      {d.context && <p className="t-desc text-sm whitespace-pre-line">{d.context}</p>}
      {d.deciderReason && <p className="t-desc text-xs">{d.deciderReason}</p>}

      {d.status === "decidida" || d.status === "recusada" ? (
        <p className="text-sm">
          <span className="font-medium">{d.status === "recusada" ? "Recusada" : `Escolhido: ${chosen?.label ?? d.outcome}`}</span>
          {d.reason && <span className="text-muted-foreground"> · {d.reason}</span>}
          {d.decidedBy && <span className="text-muted-foreground"> · {getUser(d.decidedBy).name}</span>}
        </p>
      ) : canDecide ? (
        <div className="grid gap-2">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da escolha, em uma frase" />
          <div className="flex flex-wrap gap-2">
            {d.options.map((o) => (
              <Button key={o.id} size="sm" variant={d.recommendation === o.id ? "default" : "outline"} onClick={() => answer("decidida", o.id)}>
                {o.label}
                {d.recommendation === o.id && <span className="text-xs opacity-80">· recomendada</span>}
              </Button>
            ))}
            {d.options.length === 0 && (
              <Button size="sm" onClick={() => answer("decidida", "sim")}>
                Aprovar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => answer("recusada")}>
              Recusar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => answer("mais_contexto")}>
              Pedir mais contexto
            </Button>
          </div>
        </div>
      ) : (
        <div className={cn("flex flex-wrap gap-2 text-sm text-muted-foreground")}>
          {d.options.length > 0 && <span>Opções: {d.options.map((o) => o.label).join(" · ")}</span>}
          {(item.createdById === meId || item.ownerId === meId) && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Detalhar
            </Button>
          )}
        </div>
      )}
      {editing && <DecisionDialog item={item} open onOpenChange={setEditing} />}
    </li>
  )
}
