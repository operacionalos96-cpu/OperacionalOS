"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { LinkIcon, LockIcon, PlusIcon, XIcon } from "lucide-react"
import { useEntitySnapshot } from "@/lib/entities/registry"
import { blockersOf, presenceOf, relationExists } from "@/lib/entities/relations"
import { summaryOf } from "@/lib/entities/summary"
import { RELATION_KINDS, refKey, type EntityRef, type RelationKind } from "@/lib/entities/types"
import { uid } from "@/lib/format"
import { useRelations } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/layout"
import { EntityChip, EntityPicker } from "./entity-bits"

/**
 * "Conexões": tudo que está ligado a esta entidade, em qualquer módulo — relações
 * criadas à mão (removíveis) e ligações que já existem (lead do produto, balão do
 * mapa, lançamento do lead…). É o mesmo painel em todas as telas.
 */
export function ConnectionsPanel({ entity, className, bare = false }: { entity: EntityRef; className?: string; bare?: boolean }) {
  const snap = useEntitySnapshot()
  const meId = useStore((s) => s.meId)
  const save = useRelations((s) => s.save)
  const remove = useRelations((s) => s.remove)
  const [kind, setKind] = useState<RelationKind>("relacionado")

  const presence = useMemo(() => presenceOf(entity, snap), [entity, snap])
  const blockers = useMemo(
    () => blockersOf(entity, snap.relations, (r) => summaryOf(r, snap)?.done ?? true),
    [entity, snap],
  )

  function connect(to: EntityRef) {
    if (relationExists(snap.relations, entity, to, kind)) return toast("Essa conexão já existe.")
    save({ id: uid(), from: entity, to, kind, createdBy: meId, createdAt: new Date().toISOString() })
  }

  function disconnect(relationId: string) {
    const removed = remove(relationId)
    if (removed) toast("Conexão removida", { action: { label: "Desfazer", onClick: () => useRelations.getState().restore(removed) } })
  }

  const body = (
    <div className="grid gap-3 p-4">
      {blockers.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          <p className="flex items-center gap-1.5 font-semibold">
            <LockIcon className="size-3.5" /> Bloqueado por
          </p>
          <ul className="mt-1 grid gap-0.5">
            {blockers.map((b) => (
              <li key={refKey(b)}>
                <EntityChip entity={b} className="text-danger" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {presence.length === 0 ? (
        <p className="t-desc text-xs">Ainda não está ligado a nada. Conecte a tarefas, leads, produtos, conteúdos, notas ou mapas.</p>
      ) : (
        <ul className="grid gap-1.5">
          {presence.map((p) => (
            <li key={`${refKey(p.ref)}-${p.via}`} className="group flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-sm hover:bg-accent/50">
              {/* Empilhado: "como está ligado" em cima, nome embaixo — cabe em colunas estreitas. */}
              <div className="grid min-w-0 flex-1">
                <span className="truncate text-xs text-muted-foreground">{p.via}</span>
                <EntityChip entity={p.ref} />
              </div>
              {p.relationId && (
                <button
                  onClick={() => disconnect(p.relationId!)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100"
                  aria-label="Remover conexão"
                >
                  <XIcon className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as RelationKind)}
          className="h-7 rounded-md border bg-card px-2 text-xs"
          aria-label="Tipo de conexão"
        >
          {RELATION_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <EntityPicker
          exclude={[entity]}
          onPick={connect}
          trigger={
            <Button size="sm" variant="outline">
              <PlusIcon /> Conectar a…
            </Button>
          }
        />
      </div>
    </div>
  )

  if (bare) return body
  return (
    <Panel
      className={className}
      title={
        <span className="flex items-center gap-2">
          <LinkIcon className="size-4 text-muted-foreground" /> Conexões
          {presence.length > 0 && <span className="tabular rounded bg-muted px-1.5 text-xs text-muted-foreground">{presence.length}</span>}
        </span>
      }
      description="Onde isto aparece no OS e do que depende."
    >
      {body}
    </Panel>
  )
}
