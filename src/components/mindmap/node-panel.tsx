"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FileTextIcon, LinkIcon, PackageIcon, PlusIcon, SquareCheckIcon, TargetIcon, UserPlusIcon, VideoIcon, XIcon } from "lucide-react"
import { TEAM } from "@/config/team"
import { NODE_KIND, type NodeKind } from "@/lib/domain/mindmap"
import type { MindMapNode } from "@/lib/domain/types"
import type { EntityRef } from "@/lib/entities/types"
import { uid } from "@/lib/format"
import { useContentItems, useGoals, useProducts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { ContextPanel } from "@/components/entities/context-panel"
import { EntityChip, EntityPicker } from "@/components/entities/entity-bits"
import { NODE_KIND_ICON } from "./node-kinds"

/** O que o painel lê/grava do balão (mesmos campos do MindMapNode). */
export type PanelNodeData = Pick<MindMapNode, "label" | "taskId" | "leadId" | "ref" | "decision" | "summaryOf" | "description">

/**
 * Painel lateral do balão selecionado: vínculo (converter/vincular), campos de
 * Decisão e Resumo, estilo, conexões e contexto (notas, links, anexos, comentários).
 * É o mesmo "contexto comum" de tarefas, leads e produtos.
 */
export function NodePanel({
  mapId,
  nodeId,
  data,
  kind,
  areas,
  membersOf,
  style,
  onPatch,
  onConvertTask,
  onConvertLead,
  onClose,
}: {
  mapId: string
  nodeId: string
  data: PanelNodeData
  kind: NodeKind
  areas: { id: string; label: string }[]
  membersOf: (areaId: string) => string[]
  style: React.ReactNode
  onPatch: (patch: Partial<PanelNodeData>) => void
  onConvertTask: () => void
  onConvertLead: () => void
  onClose: () => void
}) {
  const entity: EntityRef = { type: "mapNode", id: `${mapId}/${nodeId}` }
  const Icon = NODE_KIND_ICON[kind]
  return (
    <aside
      className="absolute inset-y-0 right-0 z-10 hidden w-80 animate-enter flex-col border-l bg-background/95 shadow-lift backdrop-blur lg:flex"
      onKeyDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="t-label">{NODE_KIND[kind].label}</p>
          <TitleField key={nodeId} value={data.label} onSave={(label) => onPatch({ label })} />
        </div>
        <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Fechar painel">
          <XIcon />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Vínculo">
          <LinkSection data={data} onPatch={onPatch} onConvertTask={onConvertTask} onConvertLead={onConvertLead} />
        </Section>

        {kind === "decisao" && (
          <Section title="Decisão">
            <DecisionFields key={nodeId} value={data.decision ?? {}} onSave={(decision) => onPatch({ decision })} />
          </Section>
        )}

        {kind === "resumo" && (
          <Section title="Resumo de">
            <SummaryFields value={data.summaryOf} areas={areas} membersOf={membersOf} onSave={(summaryOf) => onPatch({ summaryOf })} />
          </Section>
        )}

        <Section title="Estilo">{style}</Section>
        <Section title="Conexões" bare>
          <ConnectionsPanel entity={entity} bare />
        </Section>
        <Section title="Contexto" bare>
          <ContextPanel entity={entity} bare />
        </Section>
      </div>
    </aside>
  )
}

function Section({ title, bare, children }: { title: string; bare?: boolean; children: React.ReactNode }) {
  return (
    <section className="border-b last:border-b-0">
      <p className="t-label px-4 pt-3">{title}</p>
      {bare ? children : <div className="grid gap-2 p-4 pt-2">{children}</div>}
    </section>
  )
}

function TitleField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const save = () => text.trim() && text.trim() !== value && onSave(text.trim())
  return (
    <textarea
      value={text}
      rows={1}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
      className="field-sizing-content w-full resize-none bg-transparent text-base leading-snug font-semibold outline-none"
      aria-label="Texto do balão"
    />
  )
}

/** Tarefa, lead ou qualquer outra coisa do OS que este balão representa. */
function LinkSection({
  data,
  onPatch,
  onConvertTask,
  onConvertLead,
}: {
  data: PanelNodeData
  onPatch: (patch: Partial<PanelNodeData>) => void
  onConvertTask: () => void
  onConvertLead: () => void
}) {
  const meId = useStore((s) => s.meId)
  const links: { ref: EntityRef; clear: Partial<PanelNodeData> }[] = [
    ...(data.taskId ? [{ ref: { type: "task", id: data.taskId } as EntityRef, clear: { taskId: undefined } }] : []),
    ...(data.leadId ? [{ ref: { type: "lead", id: data.leadId } as EntityRef, clear: { leadId: undefined } }] : []),
    ...(data.ref ? [{ ref: data.ref as EntityRef, clear: { ref: undefined } }] : []),
  ]

  function link(ref: EntityRef) {
    if (ref.type === "task") onPatch({ taskId: ref.id })
    else if (ref.type === "lead") onPatch({ leadId: ref.id })
    else if (ref.type === "product" || ref.type === "content" || ref.type === "note" || ref.type === "transaction" || ref.type === "map" || ref.type === "goal")
      onPatch({ ref: { type: ref.type, id: ref.id } })
  }

  function unlink(l: (typeof links)[number]) {
    const before: Partial<PanelNodeData> = { taskId: data.taskId, leadId: data.leadId, ref: data.ref }
    onPatch(l.clear)
    toast("Vínculo removido", { description: "Nada foi apagado.", action: { label: "Desfazer", onClick: () => onPatch(before) } })
  }

  const now = () => new Date().toISOString()
  const convert = {
    produto: () => {
      const p = useProducts.getState().save({ id: uid(), name: data.label || "Novo produto", kind: "outro", status: "desenvolvimento", description: data.description, links: [], ownerId: meId, createdAt: now() })
      onPatch({ ref: { type: "product", id: p.id } })
      toast.success("Produto criado e ligado ao balão")
    },
    conteudo: () => {
      const c = useContentItems.getState().save({ id: uid(), title: data.label || "Novo conteúdo", format: "outro", stage: "ideia", ownerId: meId, notes: data.description, assets: [], posts: [], createdAt: now() })
      onPatch({ ref: { type: "content", id: c.id } })
      toast.success("Conteúdo criado e ligado ao balão")
    },
    meta: () => {
      const today = new Date()
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      const g = useGoals.getState().save({
        id: uid(),
        title: data.label || "Nova meta",
        source: "tarefas",
        target: 0,
        start: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
        end: iso(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
        ownerId: meId,
        createdAt: now(),
      })
      onPatch({ ref: { type: "goal", id: g.id } })
      toast.success("Meta criada e ligada ao balão", { description: "Conecte tarefas a ela para o progresso andar sozinho." })
    },
    nota: () => {
      const s = useStore.getState()
      const n = s.createNote()
      s.updateNote(n.id, { title: data.label, body: data.description ?? "" })
      onPatch({ ref: { type: "note", id: n.id } })
      toast.success("Nota criada e ligada ao balão")
    },
  }

  return (
    <>
      {links.length === 0 ? (
        <p className="t-desc text-xs">Este balão ainda não representa nada no OS. Converta em algo novo ou vincule o que já existe.</p>
      ) : (
        <ul className="grid gap-1">
          {links.map((l) => (
            <li key={`${l.ref.type}:${l.ref.id}`} className="group flex min-w-0 items-center gap-2 text-sm">
              <EntityChip entity={l.ref} className="min-w-0 flex-1" />
              <button onClick={() => unlink(l)} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100" aria-label="Desvincular">
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <PlusIcon /> Converter em…
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="grid w-56 gap-0.5 p-1">
            <ConvertItem icon={SquareCheckIcon} label="Tarefa" disabled={!!data.taskId} onClick={onConvertTask} />
            <ConvertItem icon={UserPlusIcon} label="Lead" disabled={!!data.leadId} onClick={onConvertLead} />
            <ConvertItem icon={PackageIcon} label="Produto" disabled={!!data.ref} onClick={convert.produto} />
            <ConvertItem icon={VideoIcon} label="Conteúdo" disabled={!!data.ref} onClick={convert.conteudo} />
            <ConvertItem icon={FileTextIcon} label="Nota" disabled={!!data.ref} onClick={convert.nota} />
            <ConvertItem icon={TargetIcon} label="Meta" disabled={!!data.ref} onClick={convert.meta} />
            {!!data.ref && <p className="px-2 py-1 text-xs text-muted-foreground">Desvincule o item atual para converter em outro.</p>}
          </PopoverContent>
        </Popover>
        <EntityPicker
          types={["task", "lead", "product", "content", "note", "map", "goal"]}
          onPick={link}
          trigger={
            <Button size="sm" variant="outline">
              <LinkIcon /> Vincular existente
            </Button>
          }
        />
      </div>
    </>
  )
}

function ConvertItem({ icon: Icon, label, disabled, onClick }: { icon: React.ComponentType<{ className?: string }>; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="size-4 text-muted-foreground" /> {label}
    </button>
  )
}

type Decision = NonNullable<MindMapNode["decision"]>

function DecisionFields({ value, onSave }: { value: Decision; onSave: (v: Decision) => void }) {
  const [d, setD] = useState<Decision>(value)
  const commit = (patch: Partial<Decision>) => {
    const next = { ...d, ...patch }
    setD(next)
    onSave(Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Decision)
  }
  const input = "h-8 rounded-md border bg-background px-2 text-sm outline-none focus:border-brand"
  const area = "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-brand"
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Quando
          <input type="date" value={d.decidedAt ?? ""} onChange={(e) => commit({ decidedAt: e.target.value || undefined })} className={input} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Quem decidiu
          <select value={d.ownerId ?? ""} onChange={(e) => commit({ ownerId: e.target.value || undefined })} className={input}>
            <option value="">—</option>
            {TEAM.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Por quê
        <textarea defaultValue={d.reason} rows={3} onBlur={(e) => e.target.value !== (d.reason ?? "") && commit({ reason: e.target.value.trim() || undefined })} placeholder="O motivo da escolha" className={area} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Alternativas consideradas
        <textarea
          defaultValue={d.alternatives}
          rows={2}
          onBlur={(e) => e.target.value !== (d.alternatives ?? "") && commit({ alternatives: e.target.value.trim() || undefined })}
          placeholder="O que mais estava na mesa"
          className={area}
        />
      </label>
    </div>
  )
}

function SummaryFields({
  value,
  areas,
  membersOf,
  onSave,
}: {
  value?: string
  areas: { id: string; label: string }[]
  membersOf: (areaId: string) => string[]
  onSave: (v: string | undefined) => void
}) {
  if (!areas.length) return <p className="t-desc text-xs">Crie um grupo (selecione vários balões → Agrupar) para este resumo apontar para ele.</p>
  const members = value ? membersOf(value) : []
  return (
    <div className="grid gap-2">
      <select value={value ?? ""} onChange={(e) => onSave(e.target.value || undefined)} className="h-8 rounded-md border bg-background px-2 text-sm">
        <option value="">Escolha o grupo…</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label || "Grupo"}
          </option>
        ))}
      </select>
      {value && (
        <div className="rounded-md bg-muted/50 px-2.5 py-2">
          <p className="text-xs font-medium text-muted-foreground">No grupo agora ({members.length})</p>
          <ul className={cn("mt-1 grid gap-0.5 text-xs", !members.length && "text-muted-foreground")}>
            {members.length ? members.map((m, i) => <li key={i}>• {m}</li>) : <li>Nenhum item dentro do grupo.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
