"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { CornerDownRightIcon, XIcon } from "lucide-react"
import { cycleMapNodeStatus } from "@/lib/actions"
import { isRowMap } from "@/lib/domain/map-rows"
import { nodeKind, nodeStatus, outline, resolveLinkedTask } from "@/lib/domain/mindmap"
import type { MindMap, MindMapNode } from "@/lib/domain/types"
import { uid } from "@/lib/format"
import { removeMapNode, saveMapEdge, saveMapNode } from "@/lib/maps"
import { useMapEdges } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { StatusButton } from "@/components/shared/status-button"
import { NODE_KIND_ICON } from "./node-kinds"

const CHILD_DX = 240
const ROW_DY = 64

/**
 * Modo Lista: o mesmo mapa como tópicos numerados (1, 1.1, 1.2…). Editar aqui
 * grava balão por balão, igual ao mapa. Enter cria o próximo item no mesmo nível.
 */
export function MapOutline({ map }: { map: MindMap }) {
  const editable = isRowMap(map)
  const tasks = useStore((s) => s.tasks)
  const leads = useStore((s) => s.leads)
  const rows = useMemo(() => outline(map.nodes, map.edges), [map.nodes, map.edges])
  const [focusId, setFocusId] = useState<string | null>(null)

  function patch(node: MindMapNode, p: Partial<MindMapNode>) {
    if (editable) saveMapNode(map.id, { ...node, ...p })
  }

  /** Novo item logo abaixo deste, no mesmo nível (mesmo pai). */
  function addSibling(node: MindMapNode, parentId?: string) {
    if (!editable) return
    const next: MindMapNode = { id: uid(), label: "", x: node.x, y: node.y + ROW_DY / 2 }
    saveMapNode(map.id, next)
    if (parentId) saveMapEdge(map.id, { id: uid(), source: parentId, target: next.id })
    setFocusId(next.id)
  }

  function addChild(node: MindMapNode) {
    if (!editable) return
    const kids = rows.filter((r) => r.parentId === node.id).map((r) => r.node)
    const last = kids.at(-1)
    const next: MindMapNode = { id: uid(), label: "", x: node.x + CHILD_DX, y: last ? last.y + ROW_DY : node.y }
    saveMapNode(map.id, next)
    saveMapEdge(map.id, { id: uid(), source: node.id, target: next.id })
    setFocusId(next.id)
  }

  function remove(node: MindMapNode) {
    if (!editable) return
    const edges = useMapEdges.getState().items.filter((r) => r.mapId === map.id && (r.edge.source === node.id || r.edge.target === node.id))
    removeMapNode(map.id, node.id)
    toast(`“${node.label || "Sem texto"}” removido`, {
      action: {
        label: "Desfazer",
        onClick: () => {
          saveMapNode(map.id, node)
          for (const r of edges) saveMapEdge(map.id, r.edge)
        },
      },
    })
  }

  if (!rows.length) return <p className="p-8 text-center text-sm text-muted-foreground">Mapa vazio.</p>

  return (
    <div className="h-full overflow-y-auto">
      <ol className="page-body is-narrow grid gap-0.5 pt-6">
        {!editable && <li className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Somente leitura: abra no modo Mapa uma vez para atualizar o formato.</li>}
        {rows.map((r) => {
          const n = r.node
          const linked = resolveLinkedTask(n.taskId, tasks, new Date())
          const status = nodeStatus({ status: n.status, taskId: linked ? n.taskId : undefined }, tasks)
          const kind = nodeKind({ ...n, taskId: linked ? n.taskId : undefined }, leads.find((l) => l.id === n.leadId)?.stage)
          const Icon = NODE_KIND_ICON[kind]
          return (
            <li key={n.id} className="group flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-accent/40" style={{ paddingLeft: 8 + r.depth * 24 }}>
              <span className="tabular w-10 shrink-0 text-right text-xs text-muted-foreground">{r.number}</span>
              <StatusButton status={status} onClick={() => patch(n, { status: cycleMapNodeStatus(n) })} className={cn(!editable && "pointer-events-none")} />
              {kind !== "ideia" && <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={kind} />}
              <LabelInput
                value={n.label}
                autoFocus={focusId === n.id}
                readOnly={!editable}
                done={status === "feito"}
                depth={r.depth}
                onSave={(label) => label !== n.label && patch(n, { label })}
                onEnter={() => addSibling(n, r.parentId)}
                onTab={() => addChild(n)}
              />
              {linked && <span className="hidden truncate text-xs text-success sm:inline">✓ {linked.task.title}</span>}
              {editable && (
                <span className="flex shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <button onClick={() => addChild(n)} className="rounded p-1 text-muted-foreground hover:text-foreground" title="Adicionar filho (Tab)" aria-label="Adicionar filho">
                    <CornerDownRightIcon className="size-3.5" />
                  </button>
                  <button onClick={() => remove(n)} className="rounded p-1 text-muted-foreground hover:text-danger" title="Remover" aria-label="Remover">
                    <XIcon className="size-3.5" />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {editable && <p className="pb-8 text-center text-xs text-muted-foreground">Enter cria o próximo item · Tab cria um filho · tudo aparece no mapa na hora</p>}
    </div>
  )
}

function LabelInput({
  value,
  autoFocus,
  readOnly,
  done,
  depth,
  onSave,
  onEnter,
  onTab,
}: {
  value: string
  autoFocus: boolean
  readOnly: boolean
  done: boolean
  depth: number
  onSave: (v: string) => void
  onEnter: () => void
  onTab: () => void
}) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) setText(value)
  }, [value])
  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])
  const commit = () => {
    dirty.current = false
    onSave(text.trim())
  }
  return (
    <input
      ref={ref}
      value={text}
      readOnly={readOnly}
      onChange={(e) => {
        dirty.current = true
        setText(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          commit()
          onEnter()
        } else if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault()
          commit()
          onTab()
        }
      }}
      placeholder="Escreva…"
      className={cn(
        "min-w-0 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/60",
        depth === 0 && "font-semibold",
        done && "text-muted-foreground line-through",
      )}
    />
  )
}
