"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangleIcon, ArchiveIcon, CheckSquareIcon, ChevronRightIcon, ClockIcon, InboxIcon, LightbulbIcon, PlusIcon, ScaleIcon, UserIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { inInbox, inboxAlert, triage, type TriageChoice } from "@/lib/domain/items"
import type { Task } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { useStore } from "@/lib/store"
import { openCapture } from "@/lib/ui-store"
import { useAreaList, usePeople } from "@/lib/use-hzk"
import { Button } from "@/components/ui/button"
import { DueDateField, Segmented } from "@/components/shared/fields"
import { EmptyState, PageHeader } from "@/components/shared/layout"
import { cn } from "@/lib/utils"
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const now = new Date()

  const inbox = useMemo(
    () =>
      [...items, ...tasks]
        .filter(inInbox)
        .filter((t) => scope === "time" || t.ownerId === meId || t.createdById === meId || !t.ownerId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [items, tasks, scope, meId],
  )
  // Triou o selecionado? Ele sai da caixa e o próximo (mais antigo) entra no lugar.
  const selected = inbox.find((t) => t.id === selectedId) ?? inbox[0]

  return (
    <div className="flex flex-col">
      <PageHeader
        page="/caixa-de-entrada"
        actions={
          <Button variant="brand" onClick={() => openCapture()}>
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
      <div className="page-body grid gap-4">
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
          // Lista à esquerda, detalhe do item à direita (mock): triar sem perder o lugar na fila.
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,2fr)_3fr]">
            <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
              <header className="border-b px-5 py-4">
                <h2 className="text-lg font-semibold">
                  {inbox.length} {inbox.length === 1 ? "item para triar" : "itens para triar"}
                </h2>
                <p className="text-sm text-muted-foreground">Do mais antigo para o mais novo.</p>
              </header>
              <ul className="grid gap-1.5 p-2">
                {inbox.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      aria-pressed={t.id === selected?.id}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left transition-colors hover:bg-accent/50",
                        t.id === selected?.id && "border-highlight/60 bg-highlight-soft/30",
                      )}
                    >
                      <KindBadge item={t} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{t.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {getUser(t.createdById ?? t.ownerId).name} · {relative(t.createdAt)}
                        </span>
                      </span>
                      {inboxAlert(t, now) && <AlertTriangleIcon className="size-4 shrink-0 text-warning" aria-label="Há mais de 48 h aqui" />}
                      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {selected && <InboxDetail key={selected.id} item={selected} alert={inboxAlert(selected, now)} />}
          </div>
        )}
      </div>
    </div>
  )
}

function InboxDetail({ item, alert }: { item: Task; alert: boolean }) {
  const updateItem = useStore((s) => s.updateItem)
  const areas = useAreaList()
  const people = usePeople()
  const [areaId, setAreaId] = useState<string | undefined>(item.areaId)
  const [dueDate, setDueDate] = useState<string | undefined>(item.dueDate)
  const [deciding, setDeciding] = useState(false)

  function apply(choice: TriageChoice, done: string) {
    const before: Partial<Task> = { kind: item.kind, inbox: item.inbox, areaId: item.areaId, ownerId: item.ownerId, dueDate: item.dueDate, archivedAt: item.archivedAt, triagedAt: item.triagedAt }
    updateItem(item.id, triage(item, choice, { areas, people }, new Date()))
    toast.success(done, { action: { label: "Desfazer", onClick: () => updateItem(item.id, before) } })
  }

  const dest = "h-12 rounded-xl text-base"
  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-card">
      <header className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">Detalhes do item</h2>
      </header>
      <div className="grid gap-6 p-6">
        <div className="grid gap-3">
          <p className="text-3xl font-semibold tracking-tight">{item.title}</p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <KindBadge item={item} />
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="size-4" /> {getUser(item.createdById ?? item.ownerId).name}
            </span>
            <span className="h-4 w-px bg-border" aria-hidden />
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="size-4" /> {relative(item.createdAt)}
            </span>
            {alert && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                <AlertTriangleIcon className="size-3.5" /> Há mais de 48 h aqui
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t pt-5">
          <div>
            <p className="text-base font-semibold">Defina o destino deste item.</p>
            <p className="text-sm text-muted-foreground">Transforme em uma tarefa, registre como ideia, torne em uma decisão ou arquive.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Button variant="brand" className={dest} onClick={() => apply({ to: "task", areaId, dueDate }, "Virou tarefa")}>
              <CheckSquareIcon /> Virar tarefa
            </Button>
            <Button variant="outline" className={dest} onClick={() => apply({ to: "idea" }, "Guardado como ideia")}>
              <LightbulbIcon /> Ideia
            </Button>
            <Button variant="outline" className={dest} onClick={() => setDeciding(true)}>
              <ScaleIcon /> Decisão
            </Button>
            <Button variant="outline" className={dest} onClick={() => apply({ to: "archive" }, "Arquivado")}>
              <ArchiveIcon /> Arquivar
            </Button>
          </div>
        </div>

        {/* Área e prazo valem para "Virar tarefa"; o dono vem da área (regra da triagem). */}
        <div className="grid gap-3">
          <p className="text-base font-semibold">Informações complementares</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AreaSelect value={areaId} onChange={setAreaId} />
            <DueDateField value={dueDate} onChange={setDueDate} allowEmpty />
          </div>
        </div>
      </div>
      {deciding && <DecisionDialog item={{ ...item, kind: "decision" }} open onOpenChange={setDeciding} />}
    </section>
  )
}
