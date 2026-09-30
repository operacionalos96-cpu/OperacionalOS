"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  Background,
  ConnectionMode,
  Handle,
  Panel,
  NodeResizer,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useInternalNode,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { CheckSquareIcon, MaximizeIcon, MinusIcon, PaletteIcon, PlusIcon, ScissorsIcon, Trash2Icon, UserPlusIcon } from "lucide-react"
import { LABEL_HUES } from "@/lib/domain/constants"
import { NODE_KINDS, NODE_KIND, NODE_STATUS, fitFontSize, nodeKind, nodeStatus, resolveLinkedTask, type NodeKind } from "@/lib/domain/mindmap"
import { NODE_KIND_ICON } from "@/components/mindmap/node-kinds"
import { setTaskStatus } from "@/lib/actions"
import { StatusButton } from "@/components/shared/status-button"
import { toast } from "sonner"
import { LabelChip, labelHue } from "@/components/tasks/task-bits"
import { Chip } from "@/components/shared/fields"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MindMap, MindMapEdge, MindMapNode } from "@/lib/domain/types"
import { diffItems, edgeRow, isRowMap, nodeRow, rowId, signature } from "@/lib/domain/map-rows"
import { useMindMaps } from "@/lib/maps"
import { useMapEdges, useMapNodes } from "@/lib/modules"
import { uid } from "@/lib/format"
import { useStore } from "@/lib/store"
import { openLeadForm, openTaskDetail, openTaskForm } from "@/lib/ui-store"
import { dueLabel } from "@/lib/format"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type IdeaData = { label: string; taskId?: string; leadId?: string; tag?: string; hue?: number; description?: string; status?: "andamento" | "feito"; kind?: NodeKind }
type IdeaNode = Node<IdeaData, "idea">

const CHILD_DX = 240
const ROW_DY = 64

interface MapActions {
  editingId: string | null
  setEditingId: (id: string | null) => void
  setLabel: (id: string, label: string) => void
  addChild: (id: string) => void
  addSibling: (id: string) => void
  remove: (id: string) => void
  toTask: (id: string, title?: string) => void
  toLead: (id: string) => void
  /** Liga (ou desliga, com undefined) uma tarefa/lead que já existe. */
  linkTask: (id: string, taskId: string | undefined) => void
  linkLead: (id: string, leadId: string | undefined) => void
  /** Etiqueta, cor e descrição do item. */
  setData: (id: string, patch: Partial<IdeaData>) => void
  /** Largura fixa (P/M/G) ou undefined = ajusta ao texto. Altura volta a ser automática. */
  setSize: (id: string, width: number | undefined) => void
}

const MapCtx = createContext<MapActions | null>(null)
const useMap = () => useContext(MapCtx)!

function flowNode(n: MindMapNode): IdeaNode {
  return {
    id: n.id,
    type: "idea",
    position: { x: n.x, y: n.y },
    ...(n.width ? { width: n.width } : {}),
    ...(n.height ? { height: n.height } : {}),
    data: { label: n.label, taskId: n.taskId, leadId: n.leadId, tag: n.tag, hue: n.hue, description: n.description, status: n.status, kind: n.kind },
  }
}

const flowEdge = (e: MindMapEdge): Edge => ({ id: e.id, source: e.source, target: e.target })

function toFlow(map: MindMap): { nodes: IdeaNode[]; edges: Edge[] } {
  return { nodes: map.nodes.map(flowNode), edges: map.edges.map(flowEdge) }
}

/** Nó do React Flow -> balão como é gravado. */
function toMapNode(n: IdeaNode): MindMapNode {
  return {
    id: n.id,
    label: n.data.label,
    x: Math.round(n.position.x),
    y: Math.round(n.position.y),
    taskId: n.data.taskId,
    leadId: n.data.leadId,
    tag: n.data.tag,
    hue: n.data.hue,
    description: n.data.description,
    status: n.data.status,
    kind: n.data.kind,
    width: n.width ? Math.round(n.width) : undefined,
    height: n.height ? Math.round(n.height) : undefined,
  }
}

const toMapEdge = (e: Edge): MindMapEdge => ({ id: e.id, source: e.source, target: e.target })

const signatures = <T extends MindMapNode | MindMapEdge>(items: T[]) => new Map(items.map((x) => [x.id, signature(x)]))

/**
 * Gravação e tempo real do mapa.
 * - Por balão (formato novo): grava só balões/linhas que mudaram; o que o sócio muda
 *   entra balão a balão, sem desfazer o que está sendo editado aqui.
 * - Formato antigo (SQL 0005 ainda não rodado): grava o mapa inteiro, como antes.
 */
function useMapSync(
  map: MindMap,
  nodes: IdeaNode[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<IdeaNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
) {
  const saveMap = useStore((s) => s.saveMap)
  const rows = isRowMap(map)
  const mapRef = useRef(map)
  mapRef.current = map
  const savedNodes = useRef(signatures(map.nodes))
  const savedEdges = useRef(signatures(map.edges))
  const lastSaved = useRef(serialize(map.nodes, map.edges))

  // Autosave (debounce): seleção e medições do React Flow não contam como edição.
  useEffect(() => {
    const content = { nodes: nodes.map(toMapNode), edges: edges.map(toMapEdge) }
    if (rows) {
      const n = diffItems(savedNodes.current, content.nodes)
      const e = diffItems(savedEdges.current, content.edges)
      if (!n.upsert.length && !n.remove.length && !e.upsert.length && !e.remove.length) return
      const t = setTimeout(() => {
        const mapId = mapRef.current.id
        const nodeStore = useMapNodes.getState()
        const edgeStore = useMapEdges.getState()
        for (const x of n.upsert) {
          savedNodes.current.set(x.id, signature(x))
          nodeStore.save(nodeRow(mapId, x))
        }
        for (const id of n.remove) {
          savedNodes.current.delete(id)
          nodeStore.remove(rowId(mapId, id))
        }
        for (const x of e.upsert) {
          savedEdges.current.set(x.id, signature(x))
          edgeStore.save(edgeRow(mapId, x))
        }
        for (const id of e.remove) {
          savedEdges.current.delete(id)
          edgeStore.remove(rowId(mapId, id))
        }
      }, 400)
      return () => clearTimeout(t)
    }
    const key = serialize(content.nodes, content.edges)
    if (key === lastSaved.current) return
    const t = setTimeout(() => {
      lastSaved.current = key
      saveMap({ ...mapRef.current, ...content })
    }, 400)
    return () => clearTimeout(t)
  }, [nodes, edges, rows, saveMap])

  // Mudança que veio do SÓCIO (tempo real).
  useEffect(() => {
    if (!rows) {
      const key = serialize(map.nodes, map.edges)
      if (key === lastSaved.current) return
      lastSaved.current = key
      const fresh = toFlow(map)
      setNodes((current) => {
        const selected = new Set(current.filter((n) => n.selected).map((n) => n.id))
        return fresh.nodes.map((n) => ({ ...n, selected: selected.has(n.id) }))
      })
      setEdges(fresh.edges)
      return
    }

    // Balões: só o que difere do que este editor gravou por último é mudança do sócio.
    const before = new Map(savedNodes.current)
    const remote = new Map(map.nodes.map((n) => [n.id, n]))
    const changed = map.nodes.filter((n) => before.get(n.id) !== signature(n))
    const gone = [...before.keys()].filter((id) => !remote.has(id))
    if (changed.length || gone.length) {
      for (const n of changed) savedNodes.current.set(n.id, signature(n))
      for (const id of gone) savedNodes.current.delete(id)
      const goneSet = new Set(gone)
      const changedIds = new Set(changed.map((n) => n.id))
      setNodes((current) => {
        const next: IdeaNode[] = []
        for (const n of current) {
          if (goneSet.has(n.id)) continue
          const r = changedIds.has(n.id) ? remote.get(n.id) : undefined
          // Balão sendo editado aqui (ainda não gravado) fica como está; a gravação daqui vence.
          const dirty = before.has(n.id) && before.get(n.id) !== signature(toMapNode(n))
          next.push(r && !dirty ? { ...flowNode(r), selected: n.selected } : n)
        }
        const have = new Set(current.map((n) => n.id))
        for (const n of changed) if (!have.has(n.id)) next.push(flowNode(n))
        return next
      })
    }

    const beforeE = new Map(savedEdges.current)
    const remoteE = new Set(map.edges.map((e) => e.id))
    const changedE = map.edges.filter((e) => beforeE.get(e.id) !== signature(e))
    const goneE = [...beforeE.keys()].filter((id) => !remoteE.has(id))
    if (changedE.length || goneE.length) {
      for (const e of changedE) savedEdges.current.set(e.id, signature(e))
      for (const id of goneE) savedEdges.current.delete(id)
      const goneSet = new Set(goneE)
      const byId = new Map(changedE.map((e) => [e.id, e]))
      setEdges((current) => {
        const kept = current.filter((e) => !goneSet.has(e.id))
        const next = kept.map((e) => (byId.has(e.id) ? { ...flowEdge(byId.get(e.id)!), selected: e.selected } : e))
        const have = new Set(kept.map((e) => e.id))
        for (const e of changedE) if (!have.has(e.id)) next.push(flowEdge(e))
        return next
      })
    }
  }, [map, rows, setNodes, setEdges])
}

export function MindMapEditor({ map }: { map: MindMap }) {
  return (
    <ReactFlowProvider>
      <Editor map={map} />
    </ReactFlowProvider>
  )
}

function Editor({ map }: { map: MindMap }) {
  const initial = useMemo(() => toFlow(map), [map.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { screenToFlowPosition } = useReactFlow()
  useMapSync(map, nodes, edges, setNodes, setEdges)

  const createNode = useCallback(
    (position: { x: number; y: number }, parentId?: string) => {
      const id = uid()
      setNodes((ns) => [
        ...ns.map((n) => ({ ...n, selected: false })),
        { id, type: "idea", position, data: { label: "" }, selected: true },
      ])
      if (parentId) setEdges((es) => [...es, { id: uid(), source: parentId, target: id }])
      setEditingId(id)
      return id
    },
    [setNodes, setEdges],
  )

  const actions: MapActions = useMemo(() => {
    const findNode = (id: string) => nodes.find((n) => n.id === id)
    return {
      editingId,
      setEditingId,
      setLabel: (id, label) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n))),
      addChild: (id) => {
        const parent = findNode(id)
        if (!parent) return
        const children = edges.filter((e) => e.source === id).length
        createNode({ x: parent.position.x + CHILD_DX, y: parent.position.y + children * ROW_DY }, id)
      },
      addSibling: (id) => {
        const node = findNode(id)
        if (!node) return
        const parentId = edges.find((e) => e.target === id)?.source
        createNode({ x: node.position.x, y: node.position.y + ROW_DY }, parentId)
      },
      remove: (id) => {
        setNodes((ns) => ns.filter((n) => n.id !== id))
        setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
      },
      toTask: (id, title) => {
        const node = findNode(id)
        if (!node) return
        openTaskForm({
          prefill: { title: title || node.data.label },
          onCreated: (task) =>
            setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, taskId: task.id } } : n))),
        })
      },
      toLead: (id) => {
        const node = findNode(id)
        if (!node) return
        openLeadForm({
          prefill: { name: node.data.label },
          onCreated: (lead) =>
            setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, leadId: lead.id } } : n))),
        })
      },
      linkTask: (id, taskId) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, taskId } } : n))),
      linkLead: (id, leadId) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, leadId } } : n))),
      setData: (id, patch) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
      setSize: (id, width) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, width, height: undefined } : n))),
    }
  }, [nodes, edges, editingId, setNodes, setEdges, createNode])

  // Cada conexão sai pelo lado voltado para o outro nó (evita curvas dando a volta).
  const displayEdges = useMemo(() => {
    const x = new Map(nodes.map((n) => [n.id, n.position.x]))
    return edges.map((e) => {
      const rightward = (x.get(e.target) ?? 0) >= (x.get(e.source) ?? 0)
      return { ...e, type: "unlink", sourceHandle: rightward ? "r" : "l", targetHandle: rightward ? "l" : "r" }
    })
  }, [nodes, edges])

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, id: uid() }, es)),
    [setEdges],
  )

  // Atalhos quando um nó está selecionado e não está em edição.
  function onKeyDown(e: React.KeyboardEvent) {
    if (editingId) return
    const target = e.target as HTMLElement
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
    const selected = nodes.find((n) => n.selected)
    if (!selected) return
    if (e.key === "Tab") {
      e.preventDefault()
      actions.addChild(selected.id)
    } else if (e.key === "Enter") {
      e.preventDefault()
      actions.addSibling(selected.id)
    } else if (e.key === "F2" || e.key === " ") {
      e.preventDefault()
      setEditingId(selected.id)
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return
    createNode(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  return (
    <MapCtx.Provider value={actions}>
      <div className="relative h-full w-full" onKeyDown={onKeyDown} onDoubleClick={onDoubleClick}>
        <ReactFlow
          nodes={nodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          deleteKeyCode={editingId ? null : ["Delete", "Backspace"]}
          defaultEdgeOptions={{ type: "default", style: { strokeWidth: 1.5 } }}
          fitView
          fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
          <MapControls />
        </ReactFlow>
        <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-lg border bg-background/90 px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground shadow-sm backdrop-blur lg:block">
          <Kbd>Duplo clique</Kbd> cria · <Kbd>Tab</Kbd> filho · <Kbd>Enter</Kbd> irmão · <Kbd>Espaço</Kbd> edita · <Kbd>Del</Kbd> apaga ·
          arraste as bolinhas para conectar · clique na linha para desvincular · ○ no canto marca o andamento
        </div>
      </div>
    </MapCtx.Provider>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-sans text-[10px] text-foreground">{children}</kbd>
}

function IdeaNodeView({ id, data, selected, width, height }: NodeProps<IdeaNode>) {
  const map = useMap()
  const measured = !!useInternalNode(id)?.measured.width
  const editing = map.editingId === id
  const lead = useStore((s) => (data.leadId ? s.leads.find((l) => l.id === data.leadId) : undefined))
  const tasks = useStore((s) => s.tasks)
  // Tarefa recorrente: acompanha a SÉRIE (a ocorrência atual), não só a primeira tarefa.
  const linked = resolveLinkedTask(data.taskId, tasks, new Date())
  const task = linked?.task
  // Vínculo para uma tarefa que não existe mais (foi excluída): não pode travar o item.
  const taskMissing = !!data.taskId && !linked
  // Cor: escolhida à mão > cor da etiqueta > neutro.
  const hue = data.hue ?? (data.tag ? labelHue(data.tag) : undefined)
  const colored = hue !== undefined
  const sized = !!width
  const status = nodeStatus({ status: data.status, taskId: linked ? data.taskId : undefined }, tasks)
  const kind = nodeKind({ kind: data.kind, taskId: linked ? data.taskId : undefined, leadId: lead ? data.leadId : undefined }, lead?.stage)
  const KindIcon = NODE_KIND_ICON[kind]
  const done = status === "feito"
  // Texto cresce junto com o balão (ao aumentar pelos cantos ou P/M/G).
  // Cresce com o MENOR lado do balão (largura ou altura), para caber sempre.
  // Texto preenche o balão: maior fonte em que título + descrição cabem na caixa.
  const titleSize = sized
    ? fitFontSize(
        { width: width!, height: height ?? width! * 0.4 },
        { title: data.label, description: data.description, extraTop: data.tag ? 22 : 0, extraBottom: data.taskId || data.leadId ? 28 : 0 },
      )
    : undefined

  // Um clique: a fazer → em andamento → feito → a fazer. Com tarefa vinculada, a tarefa muda junto.
  function cycleStatus() {
    const next = NODE_STATUS[status].next
    map.setData(id, { status: next === "afazer" ? undefined : next })
    if (!linked) return
    // Diária feita hoje e voltando para "a fazer": reabre a de hoje (e some com a de amanhã).
    if (linked.recurring && linked.doneToday && linked.doneTodayTask && next === "afazer") setTaskStatus(linked.doneTodayTask.id, "afazer")
    else setTaskStatus(linked.task.id, next)
  }

  // Desvincular não apaga nada e pode ser desfeito na hora.
  function unlink(kind: "task" | "lead") {
    const previous = kind === "task" ? data.taskId : data.leadId
    if (kind === "task") map.linkTask(id, undefined)
    else map.linkLead(id, undefined)
    toast(kind === "task" ? "Tarefa desvinculada" : "Lead desvinculado", {
      description: "Ela continua existindo. Para ligar de novo: Tarefa → Vincular existente.",
      action: { label: "Desfazer", onClick: () => (kind === "task" ? map.linkTask(id, previous) : map.linkLead(id, previous)) },
    })
  }

  return (
    <>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={120}
        minHeight={44}
        lineClassName="!border-brand/60"
        handleClassName="!size-2.5 !rounded-sm !border-brand !bg-card"
      />
      <NodeToolbar isVisible={selected && !editing} position={Position.Top} className="flex gap-0.5 rounded-lg border bg-background p-0.5 shadow-md">
        <ToolbarButton onClick={() => map.addChild(id)} label="Adicionar filho (Tab)">
          <PlusIcon /> Filho
        </ToolbarButton>
        <KindPicker nodeId={id} kind={kind} chosen={!!data.kind} />
        <StylePicker nodeId={id} data={data} width={width} />
        {(!data.taskId || taskMissing) && <LinkPicker kind="task" nodeId={id} label={data.label} />}
        {!data.leadId && <LinkPicker kind="lead" nodeId={id} label={data.label} />}
        <ToolbarButton onClick={() => map.remove(id)} label="Apagar (Del)">
          <Trash2Icon />
        </ToolbarButton>
      </NodeToolbar>
      <div
        onDoubleClick={(e) => {
          e.stopPropagation()
          map.setEditingId(id)
        }}
        className={cn(
          // Conteúdo sempre centralizado (horizontal e, no balão redimensionado, vertical).
          "relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border bg-card px-7 py-2 text-center text-sm shadow-xs transition-shadow",
          sized ? "h-full w-full justify-center" : "max-w-72 min-w-28",
          selected && "ring-2 ring-foreground/15",
          done && "outline outline-1 outline-success/60",
        )}
        style={
          colored
            ? {
                background: `color-mix(in oklch, var(--card), oklch(0.7 0.1 ${hue}) 12%)`,
                borderColor: `oklch(0.7 0.1 ${hue} / ${selected ? 90 : 45}%)`,
              }
            : undefined
        }
      >
        {colored && <span className="absolute inset-y-0 left-0 w-1" style={{ background: `oklch(0.68 0.13 ${hue})` }} />}
        {kind !== "ideia" && (
          <span className="absolute top-2 left-2 text-muted-foreground" title={NODE_KIND[kind].label} aria-label={NODE_KIND[kind].label}>
            <KindIcon className="size-3.5" />
          </span>
        )}
        <StatusButton status={status} onClick={cycleStatus} className="absolute top-2 right-2" />
        {data.tag && (
          <span
            className="w-fit rounded px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase"
            style={{ background: `oklch(0.7 0.1 ${hue} / 18%)`, color: `light-dark(oklch(0.42 0.1 ${hue}), oklch(0.82 0.08 ${hue}))` }}
          >
            {data.tag}
          </span>
        )}
        {editing ? (
          <NodeInput
            initial={data.label}
            ready={measured}
            onDone={(label) => {
              if (!label.trim() && !data.label) map.remove(id)
              else if (label.trim()) map.setLabel(id, label.trim())
              map.setEditingId(null)
            }}
          />
        ) : (
          <p
            className={cn("w-full leading-tight font-medium break-words whitespace-pre-wrap", !data.label && "text-muted-foreground", done && "text-muted-foreground")}
            style={titleSize ? { fontSize: titleSize } : undefined}
          >
            {data.label || "Sem texto"}
          </p>
        )}
        {data.description && !editing && (
          <p
            className={cn("w-full text-xs leading-snug break-words whitespace-pre-wrap text-muted-foreground", !sized && "line-clamp-4")}
            style={titleSize ? { fontSize: Math.round(titleSize * 0.62) } : undefined}
          >
            {data.description}
          </p>
        )}
        {(lead || task || taskMissing) && (
          <div className="mt-1 flex w-full flex-col gap-0.5 border-t pt-1 text-left">
            {taskMissing && (
              <LinkedRow onUnlink={() => map.linkTask(id, undefined)} label="Remover vínculo com tarefa apagada">
                <span className="truncate text-warning" title="A tarefa ligada a este item foi excluída">⚠ tarefa apagada</span>
              </LinkedRow>
            )}
            {task && (
              <LinkedRow onUnlink={() => unlink("task")} label="Desvincular tarefa">
                <button onClick={() => openTaskDetail(task.id)} className={cn("nodrag truncate text-left hover:underline", task.done && "line-through opacity-70")}>
                  ✓ {task.title}
                </button>
              </LinkedRow>
            )}
            {linked?.recurring && (
              <p className="text-[10px] text-muted-foreground">
                🔁 {task?.recurrence === "semanal" ? "Toda semana" : task?.recurrence === "mensal" ? "Todo mês" : "Todo dia"}
                {linked.doneToday ? " · feito hoje" : ""}
                {task && !task.done && task.dueDate ? ` · próxima: ${dueLabel(task.dueDate)}` : ""}
              </p>
            )}
            {lead && (
              <LinkedRow onUnlink={() => unlink("lead")} label="Desvincular lead">
                <Link href={`/pipeline/${lead.id}`} className="nodrag truncate hover:underline">
                  → Lead: {lead.name}
                </Link>
              </LinkedRow>
            )}
          </div>
        )}
      </div>
      {/* Modo "Loose": qualquer bolinha conecta com qualquer outra. */}
      <Handle id="l" type="source" position={Position.Left} className="idea-handle" />
      <Handle id="r" type="source" position={Position.Right} className="idea-handle" />
    </>
  )
}

/** Tipo do balão. "Automático" volta a deduzir pelo vínculo (tarefa, lead). */
function KindPicker({ nodeId, kind, chosen }: { nodeId: string; kind: NodeKind; chosen: boolean }) {
  const map = useMap()
  const [open, setOpen] = useState(false)
  const Icon = NODE_KIND_ICON[kind]
  const pick = (k: NodeKind | undefined) => {
    map.setData(nodeId, { kind: k })
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title="Tipo do item">
          <Icon /> {NODE_KIND[kind].label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-64 gap-0.5 p-1" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {NODE_KINDS.map((k) => {
          const KIcon = NODE_KIND_ICON[k.id]
          const active = k.id === kind
          return (
            <button
              key={k.id}
              type="button"
              onClick={() => pick(k.id)}
              className={cn("flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent", active && "bg-accent")}
            >
              <KIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="grid">
                <span className="font-medium">{k.label}</span>
                <span className="text-[11px] text-muted-foreground">{k.hint}</span>
              </span>
            </button>
          )
        })}
        {chosen && (
          <button type="button" onClick={() => pick(undefined)} className="mt-0.5 rounded-md border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent">
            Automático (pelo vínculo)
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}

const SIZES = [
  { id: "auto", label: "Auto", width: undefined },
  { id: "p", label: "P", width: 180 },
  { id: "m", label: "M", width: 260 },
  { id: "g", label: "G", width: 360 },
] as const

/** Etiqueta (fase), cor, tamanho e descrição do item. Tudo salva na hora. */
function StylePicker({ nodeId, data, width }: { nodeId: string; data: IdeaData; width?: number }) {
  const map = useMap()
  const tasks = useStore((s) => s.tasks)
  const maps = useMindMaps()
  const [tag, setTag] = useState("")
  const known = [
    ...new Set([...maps.flatMap((m) => m.nodes.map((n) => n.tag).filter((t): t is string => !!t)), ...tasks.flatMap((t) => t.labels ?? [])]),
  ]
    .filter((t) => t !== data.tag)
    .sort()

  function applyTag(raw: string) {
    const t = raw.trim().replace(/^#/, "").toLowerCase()
    if (t) map.setData(nodeId, { tag: t })
    setTag("")
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title="Etiqueta, cor, tamanho e descrição">
          <PaletteIcon /> Estilo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="grid gap-1.5">
          <p className="t-label">Etiqueta / fase</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {data.tag && <LabelChip label={data.tag} onRemove={() => map.setData(nodeId, { tag: undefined })} />}
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  applyTag(tag)
                }
              }}
              onBlur={() => tag && applyTag(tag)}
              placeholder={data.tag ? "trocar…" : "ex.: prospecção (Enter)"}
              className="h-6 min-w-28 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-brand"
            />
          </div>
          {known.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {known.slice(0, 10).map((l) => (
                <button key={l} type="button" onClick={() => applyTag(l)} className="rounded-full opacity-75 transition-opacity hover:opacity-100">
                  <LabelChip label={l} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-1.5">
          <p className="t-label">Cor{data.tag && data.hue === undefined ? " · da etiqueta" : ""}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => map.setData(nodeId, { hue: undefined })}
              className={cn("flex size-6 items-center justify-center rounded-full border text-[10px] text-muted-foreground", data.hue === undefined && "ring-2 ring-foreground/40")}
              title={data.tag ? "Usar a cor da etiqueta" : "Sem cor"}
            >
              {data.tag ? "A" : "—"}
            </button>
            {LABEL_HUES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => map.setData(nodeId, { hue: h })}
                className={cn("size-6 rounded-full transition-transform hover:scale-110", data.hue === h && "ring-2 ring-foreground/60 ring-offset-2 ring-offset-popover")}
                style={{ background: `oklch(0.68 0.13 ${h})` }}
                aria-label={`Cor ${h}`}
              />
            ))}
          </div>
          {data.tag && data.hue === undefined && <p className="t-desc text-[11px]">A cor segue a etiqueta: mesma etiqueta, mesma cor em todo o sistema.</p>}
        </div>

        <div className="grid gap-1.5">
          <p className="t-label">Tamanho · ou arraste os cantos</p>
          <div className="flex gap-1.5">
            {SIZES.map((s) => (
              <Chip key={s.id} active={s.width === undefined ? !width : width === s.width} onClick={() => map.setSize(nodeId, s.width)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <p className="t-label">Descrição</p>
          <textarea
            defaultValue={data.description ?? ""}
            onBlur={(e) => map.setData(nodeId, { description: e.target.value.trim() || undefined })}
            placeholder="O que é esta fase, objetivo, critério de pronto…"
            rows={3}
            className="rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-brand"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NodeInput({ initial, ready, onDone }: { initial: string; ready: boolean; onDone: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  const finish = (v: string) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  // Nós novos ficam invisíveis até o React Flow medi-los; só então o foco "pega".
  useEffect(() => {
    if (ready) ref.current?.focus()
  }, [ready])
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") finish(value)
        if (e.key === "Escape") finish(initial)
      }}
      placeholder="Digite a ideia…"
      className="nodrag w-full min-w-40 bg-transparent text-center outline-none"
    />
  )
}

function ToolbarButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <Button size="xs" variant="ghost" onClick={onClick} title={label} aria-label={label}>
      {children}
    </Button>
  )
}

function LinkedRow({ children, onUnlink, label }: { children: React.ReactNode; onUnlink: () => void; label: string }) {
  return (
    <div className="group/link flex min-w-0 items-center gap-1 text-[11px] text-success">
      {children}
      <button
        onClick={onUnlink}
        className="nodrag ml-auto shrink-0 rounded px-0.5 text-muted-foreground opacity-0 group-hover/link:opacity-100 hover:text-danger focus:opacity-100"
        title={label}
        aria-label={label}
      >
        ×
      </button>
    </div>
  )
}

/**
 * "Tarefa" / "Lead" no nó: criar novo OU vincular um que já existe (com busca).
 * Eventos param aqui dentro para não disparar atalhos do mapa (Del, duplo clique).
 */
function LinkPicker({ kind, nodeId, label }: { kind: "task" | "lead"; nodeId: string; label: string }) {
  const map = useMap()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const tasks = useStore((s) => s.tasks)
  const leads = useStore((s) => s.leads)
  const newName = search.trim() || label
  const items =
    kind === "task"
      ? [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title)).map((t) => ({ id: t.id, title: t.title, hint: t.done ? "feita" : t.dueDate ? dueLabel(t.dueDate) : "" }))
      : [...leads].sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({ id: l.id, title: l.name, hint: l.company ?? "" }))

  function pick(itemId: string) {
    if (kind === "task") map.linkTask(nodeId, itemId)
    else map.linkLead(nodeId, itemId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title={kind === "task" ? "Criar ou vincular tarefa" : "Criar ou vincular lead"}>
          {kind === "task" ? <CheckSquareIcon /> : <UserPlusIcon />} {kind === "task" ? "Tarefa" : "Lead"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-0"
        onKeyDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput value={search} onValueChange={setSearch} placeholder={kind === "task" ? "Buscar ou criar tarefa…" : "Buscar ou criar lead…"} />
          <CommandList className="max-h-64">
            <CommandGroup>
              {/* forceMount: continua visível mesmo filtrando; cria com o que foi digitado. */}
              <CommandItem
                forceMount
                value="__criar_novo__"
                onSelect={() => {
                  setOpen(false)
                  setSearch("")
                  if (kind === "task") map.toTask(nodeId, newName)
                  else map.toLead(nodeId)
                }}
              >
                <PlusIcon /> Criar {kind === "task" ? "tarefa" : "lead"} “{newName || "nova ideia"}”
              </CommandItem>
            </CommandGroup>
            <CommandEmpty>Nada encontrado.</CommandEmpty>
            {items.length > 0 && (
              <CommandGroup heading={kind === "task" ? "Vincular tarefa existente" : "Vincular lead existente"}>
                {items.map((it) => (
                  <CommandItem key={it.id} value={`${it.title} ${it.id}`} onSelect={() => pick(it.id)}>
                    <span className="min-w-0 flex-1 truncate">{it.title}</span>
                    {it.hint && <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

const NODE_TYPES = { idea: IdeaNodeView }

/**
 * Linha entre ideias. Área de clique larga (a linha é fina); selecionada, fica
 * destacada e mostra "Desvincular" no meio. Delete/Backspace também desvincula.
 */
function UnlinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, style }: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={24}
        style={{ ...style, stroke: selected ? "var(--brand)" : undefined, strokeWidth: selected ? 2.5 : 1.5 }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={() => deleteElements({ edges: [{ id }] })}
            className="nodrag nopan pointer-events-auto absolute inline-flex animate-enter items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-lift transition-colors hover:border-danger/50 hover:text-danger"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <ScissorsIcon className="size-3.5" /> Desvincular
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const EDGE_TYPES = { unlink: UnlinkEdge }

function serialize(nodes: MindMap["nodes"], edges: MindMap["edges"]) {
  return JSON.stringify([
    nodes.map((n) => [
      n.id,
      n.label,
      Math.round(n.x),
      Math.round(n.y),
      n.taskId ?? null,
      n.leadId ?? null,
      n.tag ?? null,
      n.hue ?? null,
      n.description ?? null,
      n.width ?? null,
      n.height ?? null,
      n.status ?? null,
      n.kind ?? null,
    ]),
    edges.map((e) => [e.id, e.source, e.target]),
  ])
}

/**
 * Zoom e enquadrar com o visual do app (os controles padrão da biblioteca ficavam
 * claro-sobre-claro no tema escuro). Nome de cada botão aparece ao passar o mouse.
 */
function MapControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const buttons = [
    { label: "Aproximar", icon: PlusIcon, onClick: () => zoomIn({ duration: 200 }) },
    { label: "Afastar", icon: MinusIcon, onClick: () => zoomOut({ duration: 200 }) },
    { label: "Enquadrar tudo", icon: MaximizeIcon, onClick: () => fitView({ padding: 0.3, maxZoom: 1, duration: 300 }) },
  ]
  return (
    <Panel position="bottom-right" className="!mb-16 flex flex-col overflow-hidden rounded-lg border bg-card shadow-lift">
      {buttons.map((b, i) => (
        <Tooltip key={b.label}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={b.onClick}
              aria-label={b.label}
              className={cn(
                "flex size-9 items-center justify-center text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
                i > 0 && "border-t",
              )}
            >
              <b.icon className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{b.label}</TooltipContent>
        </Tooltip>
      ))}
    </Panel>
  )
}
