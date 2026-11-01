"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangleIcon, ArchiveIcon, CheckSquareIcon, InboxIcon, LightbulbIcon, PlusIcon, ScaleIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { inInbox, inboxAlert, triage, type TriageChoice } from "@/lib/domain/items"
import type { Task } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { useStore } from "@/lib/store"
import { openCapture } from "@/lib/ui-store"
import { useAreaList, usePeople } from "@/lib/use-hzk"
import { Button } from "@/components/ui/button"
import { DueDateField, Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout"
import { AreaSelect, KindBadge } from "@/components/hzk/item-bits"
import { DecisionDialog } from "@/components/hzk/decision-dialog"

/**
 * Caixa de entrada (HZK OS): tudo que foi capturado e ainda não tem destino.
 * Triar = decidir o que o item vira: tarefa (com área e dono), ideia, decisão ou arquivo.
 */
export default function InboxPage() {
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const meId = useStore((s) => s.meId)
  const [scope, setScope] = useState<"minha" | "time">("minha")
  const now = new Date()

  const inbox = useMemo(
    () =>
      [...items, ...tasks]
        .filter(inInbox)
        .filter((t) => scope === "time" || t.ownerId === meId || t.createdById === meId || !t.ownerId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items, tasks, scope, meId],
  )

  return (
    <div className="flex flex-col">
      <PageHeader
        page="/caixa-de-entrada"
        actions={
          <Button onClick={() => openCapture()}>
            <PlusIcon /> Capturar
          </Button>
        }
      >
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: "minha", label: "Minha" },
            { value: "time", label: "Do time" },
          ]}
        />
      </PageHeader>
      <div className="page-body is-narrow grid gap-4">
        {inbox.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title="Caixa de entrada vazia"
            description="Tudo triado. Quando surgir algo, capture em uma linha pelo botão + ou com Ctrl+K."
            action={
              <Button onClick={() => openCapture()}>
                <PlusIcon /> Capturar algo
              </Button>
            }
            className="py-20"
          />
        ) : (
          <Panel title={`${inbox.length} ${inbox.length === 1 ? "item para triar" : "itens para triar"}`} description="Do mais antigo para o mais novo.">
            <ul className="divide-y">
              {inbox.map((t) => (
                <InboxRow key={t.id} item={t} alert={inboxAlert(t, now)} />
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  )
}

function InboxRow({ item, alert }: { item: Task; alert: boolean }) {
  const updateItem = useStore((s) => s.updateItem)
  const areas = useAreaList()
  const people = usePeople()
  const [toTask, setToTask] = useState(false)
  const [areaId, setAreaId] = useState<string | undefined>(item.areaId)
  const [dueDate, setDueDate] = useState<string | undefined>(item.dueDate)
  const [deciding, setDeciding] = useState(false)

  function apply(choice: TriageChoice, done: string) {
    const before: Partial<Task> = { kind: item.kind, inbox: item.inbox, areaId: item.areaId, ownerId: item.ownerId, dueDate: item.dueDate, archivedAt: item.archivedAt, triagedAt: item.triagedAt }
    updateItem(item.id, triage(item, choice, { areas, people }, new Date()))
    toast.success(done, { action: { label: "Desfazer", onClick: () => updateItem(item.id, before) } })
  }

  return (
    <li className="grid gap-3 px-4 py-4">
      <div className="flex flex-wrap items-start gap-2">
        <KindBadge item={item} />
        {alert && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
            <AlertTriangleIcon className="size-3.5" /> Há mais de 48 h aqui
          </span>
        )}
        <span className="t-desc ml-auto text-xs">
          {getUser(item.createdById ?? item.ownerId).name} · {relative(item.createdAt)}
        </span>
      </div>
      <p className="text-[15px] font-medium">{item.title}</p>

      {toTask ? (
        <div className="grid gap-3 rounded-xl border bg-muted/40 p-3">
          <AreaSelect value={areaId} onChange={setAreaId} />
          <DueDateField value={dueDate} onChange={setDueDate} allowEmpty />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setToTask(false)}>
              Cancelar
            </Button>
            <Button onClick={() => apply({ to: "task", areaId, dueDate }, "Virou tarefa")}>Confirmar tarefa</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setToTask(true)}>
            <CheckSquareIcon /> Virar tarefa
          </Button>
          <Button size="sm" variant="outline" onClick={() => apply({ to: "idea" }, "Guardado como ideia")}>
            <LightbulbIcon /> Ideia
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDeciding(true)}>
            <ScaleIcon /> Decisão
          </Button>
          <Button size="sm" variant="ghost" onClick={() => apply({ to: "archive" }, "Arquivado")}>
            <ArchiveIcon /> Arquivar
          </Button>
        </div>
      )}
      {deciding && <DecisionDialog item={{ ...item, kind: "decision" }} open onOpenChange={setDeciding} />}
    </li>
  )
}
