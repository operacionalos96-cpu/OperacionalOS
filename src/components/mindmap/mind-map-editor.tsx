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
import { CheckSquareIcon, MaximizeIcon, MinusIcon, PlusIcon, ScissorsIcon, Trash2Icon, UserPlusIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MindMap } from "@/lib/domain/types"
import { uid } from "@/lib/format"
import { useStore } from "@/lib/store"
import { openLeadForm, openTaskForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type IdeaData = { label: string; taskId?: string; leadId?: string }
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
  toTask: (id: string) => void
  toLead: (id: string) => void
}

const MapCtx = createContext<MapActions | null>(null)
const useMap = () => useContext(MapCtx)!

function toFlow(map: MindMap): { nodes: IdeaNode[]; edges: Edge[] } {
  return {
    nodes: map.nodes.map((n) => ({
      id: n.id,
      type: "idea",
      position: { x: n.x, y: n.y },
      data: { label: n.label, taskId: n.taskId, leadId: n.leadId },
    })),
    edges: map.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

export function MindMapEditor({ map }: { map: MindMap }) {
  return (
    <ReactFlowProvider>
      <Editor map={map} />
    </ReactFlowProvider>
  )
}

function Editor({ map }: { map: MindMap }) {
  const saveMap = useStore((s) => s.saveMap)
  const initial = useMemo(() => toFlow(map), [map.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { screenToFlowPosition } = useReactFlow()
  const mapRef = useRef(map)
  mapRef.current = map

  // Autosave (debounce) de posições, textos e conexões — só se o conteúdo mudou
  // (seleção e medições do React Flow não contam como edição).
  const lastSaved = useRef(serialize(map.nodes, map.edges))
  useEffect(() => {
    const content = {
      nodes: nodes.map((n) => ({
        id: n.id,
        label: n.data.label,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        taskId: n.data.taskId,
        leadId: n.data.leadId,
      })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }
    const key = serialize(content.nodes, content.edges)
    if (key === lastSaved.current) return
    const t = setTimeout(() => {
      lastSaved.current = key
      saveMap({ ...mapRef.current, ...content })
    }, 400)
    return () => clearTimeout(t)
  }, [nodes, edges, saveMap])

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
      toTask: (id) => {
        const node = findNode(id)
        if (!node) return
        openTaskForm({
          prefill: { title: node.data.label },
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
          arraste as bolinhas para conectar · clique na linha para desvincular
        </div>
      </div>
    </MapCtx.Provider>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 font-sans text-[10px] text-foreground">{children}</kbd>
}

function IdeaNodeView({ id, data, selected }: NodeProps<IdeaNode>) {
  const map = useMap()
  const measured = !!useInternalNode(id)?.measured.width
  const editing = map.editingId === id
  const lead = useStore((s) => (data.leadId ? s.leads.find((l) => l.id === data.leadId) : undefined))
  const task = useStore((s) => (data.taskId ? s.tasks.find((t) => t.id === data.taskId) : undefined))

  return (
    <>
      <NodeToolbar isVisible={selected && !editing} position={Position.Top} className="flex gap-0.5 rounded-lg border bg-background p-0.5 shadow-md">
        <ToolbarButton onClick={() => map.addChild(id)} label="Adicionar filho (Tab)">
          <PlusIcon /> Filho
        </ToolbarButton>
        {!data.taskId && (
          <ToolbarButton onClick={() => map.toTask(id)} label="Transformar em tarefa">
            <CheckSquareIcon /> Tarefa
          </ToolbarButton>
        )}
        {!data.leadId && (
          <ToolbarButton onClick={() => map.toLead(id)} label="Transformar em lead">
            <UserPlusIcon /> Lead
          </ToolbarButton>
        )}
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
          "min-w-24 max-w-64 rounded-lg border bg-card px-3 py-2 text-sm shadow-xs transition-shadow",
          selected && "border-foreground/40 ring-2 ring-foreground/10",
          (data.taskId || data.leadId) && "border-l-[3px] border-l-success",
        )}
      >
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
          <p className={cn("break-words whitespace-pre-wrap", !data.label && "text-muted-foreground")}>{data.label || "Sem texto"}</p>
        )}
        {(lead || task) && (
          <div className="mt-1 flex flex-col gap-0.5 border-t pt-1">
            {task && (
              <Link href="/tarefas" className="nodrag text-[11px] text-success hover:underline">
                ✓ Tarefa{task.done ? " (feita)" : ""}
              </Link>
            )}
            {lead && (
              <Link href={`/pipeline/${lead.id}`} className="nodrag text-[11px] text-success hover:underline">
                → Lead: {lead.name}
              </Link>
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
      className="nodrag w-full min-w-40 bg-transparent outline-none"
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
    nodes.map((n) => [n.id, n.label, Math.round(n.x), Math.round(n.y), n.taskId ?? null, n.leadId ?? null]),
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
    <Panel position="bottom-right" className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-lift">
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
