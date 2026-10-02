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
  MarkerType,
  Panel,
  NodeResizer,
  NodeToolbar,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  reconnectEdge,
  SelectionMode,
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
import { CircleDotIcon, SquareStackIcon, Loader2Icon, SparklesIcon, BoxSelectIcon, CheckSquareIcon, ChevronLeftIcon, ChevronRightIcon, CrosshairIcon, MaximizeIcon, PanelRightIcon, PresentationIcon, MinusIcon, PaletteIcon, PlusIcon, ScissorsIcon, Trash2Icon, UserPlusIcon } from "lucide-react"
import { LABEL_HUES } from "@/lib/domain/constants"
import {
  NODE_KINDS,
  NODE_KIND,
  NODE_STATUS,
  areaAround,
  descendants,
  fitFontSize,
  focusSet,
  hiddenByCollapse,
  isArea,
  membersOf,
  nodeKind,
  nodeStatus,
  outline,
  resolveLinkedTask,
  type NodeKind,
} from "@/lib/domain/mindmap"
import { NodePanel } from "@/components/mindmap/node-panel"
import { outlineText, type AiAction, type AiResult } from "@/lib/domain/ai-map"
import { EntityChip } from "@/components/entities/entity-bits"
import { getUser } from "@/config/team"
import { NODE_KIND_ICON } from "@/components/mindmap/node-kinds"
import { cycleMapNodeStatus, setTaskStatus } from "@/lib/actions"
import { StatusButton } from "@/components/shared/status-button"
import { toast } from "sonner"
import { LabelChip, labelHue } from "@/components/tasks/task-bits"
import { Chip } from "@/components/shared/fields"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MindMap, MindMapEdge, MindMapNode } from "@/lib/domain/types"
import { diffItems, edgeRow, isRowMap, nodeRow, rowId, signature } from "@/lib/domain/map-rows"
import { useMindMaps } from "@/lib/maps"
import { RELATION_KINDS } from "@/lib/entities/types"
import { useMapEdges, useMapNodes } from "@/lib/modules"
import { uid } from "@/lib/format"
import { useStore } from "@/lib/store"
import { openLeadForm, openTaskDetail, openTaskForm } from "@/lib/ui-store"
import { dueLabel } from "@/lib/format"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type IdeaData = { label: string; taskId?: string; leadId?: string; tag?: string; hue?: number; description?: string; status?: "andamento" | "feito"; kind?: NodeKind; collapsed?: boolean } & Pick<MindMapNode, "ref" | "decision" | "summaryOf">
/** "idea" = balão; "area" = grupo (retângulo com título que leva junto o que está dentro). */
type IdeaNode = Node<IdeaData, "idea" | "area">

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
  /** Tipo (hierarquia/relação) e legenda de uma linha. */
  setEdgeData: (id: string, patch: LinkData) => void
  /** Cria um balão solto nesta posição do mapa (duplo clique dentro de um grupo). */
  createAt: (position: { x: number; y: number }) => void
  /** Quantos itens há abaixo (ramo inteiro), para o botão [n]. */
  branchSize: (id: string) => number
  toggleCollapse: (id: string) => void
  /** Modo foco: destaca o ramo, esmaece o resto. */
  focusId: string | null
  setFocus: (id: string | null) => void
  /** Abre o painel lateral do balão selecionado. */
  openPanel: () => void
  /** Vários selecionados: some a barra de cada balão (fica uma só, no topo). */
  multi: boolean
  areaLabel: (id: string) => string | undefined
  /** IA: contexto do pedido (título, mapa/ramo em lista, textos que já existem). */
  aiContext: (id: string, action: AiAction) => { mapTitle: string; outline: string; existing: string[] }
  /** Aceitar sugestões: cada texto vira um filho do balão. */
  addChildren: (id: string, labels: string[]) => void
  /** Aceitar resumo: vira um balão "Resumo" filho do balão. */
  addSummary: (id: string, text: string) => void
}

const MapCtx = createContext<MapActions | null>(null)
const useMap = () => useContext(MapCtx)!

function flowNode(n: MindMapNode): IdeaNode {
  return {
    id: n.id,
    type: isArea(n) ? "area" : "idea",
    ...(isArea(n) ? { zIndex: -1 } : {}),
    position: { x: n.x, y: n.y },
    ...(n.width ? { width: n.width } : {}),
    ...(n.height ? { height: n.height } : {}),
    data: { label: n.label, taskId: n.taskId, leadId: n.leadId, tag: n.tag, hue: n.hue, description: n.description, status: n.status, kind: n.kind, collapsed: n.collapsed, ref: n.ref, decision: n.decision, summaryOf: n.summaryOf },
  }
}

type Arrow = NonNullable<MindMapEdge["arrow"]>
type LinkData = { kind?: "relacao"; label?: string; arrow?: Arrow; bend?: { dx: number; dy: number } }

/** Seta padrão: relação aponta para o destino; hierarquia sem seta. */
const arrowOf = (d: LinkData | undefined): Arrow => d?.arrow ?? (d?.kind === "relacao" ? "fim" : "nenhuma")

const flowEdge = (e: MindMapEdge): Edge<LinkData> => ({
  id: e.id,
  source: e.source,
  target: e.target,
  ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
  ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
  ...(e.kind || e.label || e.arrow || e.bend ? { data: { kind: e.kind, label: e.label, arrow: e.arrow, bend: e.bend } } : {}),
})

/** Linha de hierarquia (pai → filho). Relações livres não contam como filhos. */
const isHierarchy = (e: Edge) => (e.data as LinkData | undefined)?.kind !== "relacao"

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
    type: n.type === "area" ? "group" : undefined,
    collapsed: n.data.collapsed || undefined,
    ref: n.data.ref,
    decision: n.data.decision && Object.keys(n.data.decision).length ? n.data.decision : undefined,
    summaryOf: n.data.summaryOf,
    width: n.width ? Math.round(n.width) : undefined,
    height: n.height ? Math.round(n.height) : undefined,
  }
}

const toMapEdge = (e: Edge): MindMapEdge => {
  const d = e.data as LinkData | undefined
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    kind: d?.kind,
    label: d?.label?.trim() || undefined,
    arrow: d?.arrow,
    bend: d?.bend ? { dx: Math.round(d.bend.dx), dy: Math.round(d.bend.dy) } : undefined,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
  }
}

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
  const [focusId, setFocus] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [presenting, setPresenting] = useState<number | null>(null)

  // Ramos: tamanho de cada um, o que está escondido (recolhido) e o que está em foco.
  const links = useMemo(() => edges.map(toMapEdge), [edges])
  const branch = useMemo(() => new Map(nodes.map((n) => [n.id, descendants(n.id, links).size])), [nodes, links])
  const collapsedKey = nodes.filter((n) => n.data.collapsed).map((n) => n.id).join()
  const hidden = useMemo(
    () => hiddenByCollapse(nodes.filter((n) => n.data.collapsed).map((n) => ({ id: n.id, collapsed: true })), links),
    [collapsedKey, links], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const focused = useMemo(() => (focusId ? focusSet(focusId, links) : null), [focusId, links])

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
        const children = edges.filter((e) => e.source === id && isHierarchy(e)).length
        createNode({ x: parent.position.x + CHILD_DX, y: parent.position.y + children * ROW_DY }, id)
      },
      addSibling: (id) => {
        const node = findNode(id)
        if (!node) return
        const parentId = edges.find((e) => e.target === id && isHierarchy(e))?.source
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
      setEdgeData: (id, patch) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...(e.data as LinkData | undefined), ...patch } } : e))),
      createAt: (position) => createNode(position),
      branchSize: (id) => branch.get(id) ?? 0,
      toggleCollapse: (id) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, collapsed: !n.data.collapsed || undefined } } : n))),
      focusId,
      setFocus,
      openPanel: () => setPanelOpen(true),
      multi: nodes.filter((n) => n.selected).length > 1,
      aiContext: (nodeId, action) => {
        const all = outline(nodes.map(toMapNode), links)
        const branch = action === "resumir" ? new Set([nodeId, ...descendants(nodeId, links)]) : null
        const rows = branch ? all.filter((r) => branch.has(r.node.id)) : all
        return { mapTitle: map.title, outline: outlineText(rows), existing: nodes.map((n) => n.data.label).filter(Boolean) }
      },
      addChildren: (parentId, labels) => {
        const parent = findNode(parentId)
        if (!parent || !labels.length) return
        const start = edges.filter((e) => e.source === parentId && isHierarchy(e)).length
        const created = labels.map((label, i) => ({
          id: uid(),
          type: "idea" as const,
          position: { x: parent.position.x + CHILD_DX, y: parent.position.y + (start + i) * ROW_DY },
          data: { label },
        }))
        setNodes((ns) => [...ns, ...created])
        setEdges((es) => [...es, ...created.map((c) => ({ id: uid(), source: parentId, target: c.id }))])
      },
      addSummary: (parentId, text) => {
        const parent = findNode(parentId)
        if (!parent) return
        const id = uid()
        setNodes((ns) => [
          ...ns,
          {
            id,
            type: "idea",
            position: { x: parent.position.x + CHILD_DX, y: parent.position.y - ROW_DY },
            data: { label: `Resumo: ${parent.data.label}`, description: text, kind: "resumo" },
          },
        ])
        setEdges((es) => [...es, { id: uid(), source: parentId, target: id }])
      },
      areaLabel: (areaId) => nodes.find((n) => n.id === areaId && n.type === "area")?.data.label || (nodes.some((n) => n.id === areaId) ? "Grupo" : undefined),
    }
  }, [nodes, edges, editingId, setNodes, setEdges, createNode, branch, focusId, links, map.title])

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const isHidden = hidden.has(n.id)
        const dim = !!focused && !focused.has(n.id) && n.type !== "area"
        if (!isHidden && !dim && !n.hidden && !n.className) return n
        return { ...n, hidden: isHidden, className: dim ? "opacity-15 transition-opacity" : undefined }
      }),
    [nodes, hidden, focused],
  )

  // Cada conexão sai pelo lado voltado para o outro nó (evita curvas dando a volta).
  const displayEdges = useMemo(() => {
    const x = new Map(nodes.map((n) => [n.id, n.position.x]))
    return edges.map((e) => {
      const rightward = (x.get(e.target) ?? 0) >= (x.get(e.source) ?? 0)
      const dim = !!focused && !(focused.has(e.source) && focused.has(e.target))
      return {
        ...e,
        hidden: hidden.has(e.source) || hidden.has(e.target),
        ...(dim ? { style: { opacity: 0.12 } } : {}),
        type: "unlink",
        // Ponto escolhido ao ligar (ou ao arrastar a ponta da linha) vence; sem escolha, o lado mais perto.
        sourceHandle: e.sourceHandle ?? (rightward ? "r" : "l"),
        targetHandle: e.targetHandle ?? (rightward ? "l" : "r"),
        ...(["fim", "ambos"].includes(arrowOf(e.data as LinkData)) ? { markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } } : {}),
        ...(["inicio", "ambos"].includes(arrowOf(e.data as LinkData)) ? { markerStart: { type: MarkerType.ArrowClosed, width: 14, height: 14, orient: "auto-start-reverse" } } : {}),
      }
    })
  }, [nodes, edges, hidden, focused])

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, id: uid() }, es)),
    [setEdges],
  )
  // Arrastar a ponta de uma linha para outra bolinha muda o ponto (mesma linha, mesmo id).
  const onReconnect = useCallback(
    (old: Edge, c: Connection) => setEdges((es) => reconnectEdge(old, c, es, { shouldReplaceId: false })),
    [setEdges],
  )

  // Atalhos quando um nó está selecionado e não está em edição.
  function onKeyDown(e: React.KeyboardEvent) {
    if (editingId) return
    if (e.key === "Escape" && focusId) {
      setFocus(null)
      return
    }
    const target = e.target as HTMLElement
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
    const selected = nodes.find((n) => n.selected)
    if (!selected) return
    if (selected.type === "area" && (e.key === "Tab" || e.key === "Enter")) return
    if (e.key === "Tab") {
      e.preventDefault()
      actions.addChild(selected.id)
    } else if (e.key === "Enter") {
      e.preventDefault()
      actions.addSibling(selected.id)
    } else if ((e.key === "f" || e.key === "F") && selected.type !== "area") {
      e.preventDefault()
      setFocus(focusId === selected.id ? null : selected.id)
    } else if (e.key === "F2" || e.key === " ") {
      e.preventDefault()
      setEditingId(selected.id)
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return
    createNode(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  // Grupo: ao arrastar a área, o que tem o centro dentro dela vai junto.
  const groupDrag = useRef<{ id: string; start: { x: number; y: number }; members: Map<string, { x: number; y: number }> } | null>(null)
  const onNodeDragStart = useCallback(
    (_: unknown, node: IdeaNode) => {
      if (node.type !== "area") return
      const boxes = nodes.filter((n) => !n.selected || n.id === node.id).map(box)
      const ids = new Set(membersOf(box(node), boxes))
      groupDrag.current = {
        id: node.id,
        start: { ...node.position },
        members: new Map(nodes.filter((n) => ids.has(n.id)).map((n) => [n.id, { ...n.position }])),
      }
    },
    [nodes],
  )
  const onNodeDrag = useCallback(
    (_: unknown, node: IdeaNode) => {
      const drag = groupDrag.current
      if (!drag || drag.id !== node.id || !drag.members.size) return
      const dx = node.position.x - drag.start.x
      const dy = node.position.y - drag.start.y
      setNodes((ns) => ns.map((n) => {
        const from = drag.members.get(n.id)
        return from ? { ...n, position: { x: from.x + dx, y: from.y + dy } } : n
      }))
    },
    [setNodes],
  )
  const onNodeDragStop = useCallback(() => {
    groupDrag.current = null
  }, [])

  // Apresentação: percorre a árvore (mesma ordem da Lista), centralizando cada balão.
  const { fitView } = useReactFlow()
  const slides = useMemo(
    () => (presenting === null ? [] : outline(nodes.map(toMapNode), links).map((r) => r.node.id).filter((id) => !hidden.has(id))),
    [presenting !== null, links, hidden], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const slideId = presenting !== null ? slides[presenting] : undefined
  useEffect(() => {
    if (!slideId) return
    setFocus(slideId)
    fitView({ nodes: [{ id: slideId }], duration: 500, padding: 1.2, maxZoom: 1.6 })
  }, [slideId, fitView])
  const stopPresenting = useCallback(() => {
    setPresenting(null)
    setFocus(null)
    fitView({ padding: 0.3, maxZoom: 1, duration: 400 })
  }, [fitView])
  useEffect(() => {
    if (presenting === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopPresenting()
      else if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) setPresenting((i) => (i === null ? i : Math.min(i + 1, slides.length - 1)))
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) setPresenting((i) => (i === null ? i : Math.max(i - 1, 0)))
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [presenting, slides.length, stopPresenting])

  // Painel lateral: um único balão selecionado (fora da apresentação).
  const selectedAll = nodes.filter((n) => n.selected)
  const panelNode = presenting === null && panelOpen && selectedAll.length === 1 && selectedAll[0].type === "idea" ? selectedAll[0] : undefined
  const leads = useStore((s) => s.leads)
  const areas = nodes.filter((n) => n.type === "area").map((n) => ({ id: n.id, label: n.data.label }))
  const membersLabels = (areaId: string) => {
    const area = nodes.find((n) => n.id === areaId)
    if (!area) return []
    const ids = new Set(membersOf(box(area), nodes.filter((n) => n.type === "idea").map(box)))
    return nodes.filter((n) => ids.has(n.id) && n.id !== panelNode?.id).map((n) => n.data.label || "Sem texto")
  }

  const selectedIdeas = nodes.filter((n) => n.selected && n.type !== "area")
  function groupSelected() {
    if (selectedIdeas.length < 2) return
    const a = areaAround(selectedIdeas.map(box))
    const id = uid()
    setNodes((ns) => [
      { id, type: "area", zIndex: -1, position: { x: a.x, y: a.y }, width: a.width, height: a.height, data: { label: "Grupo" }, selected: true },
      ...ns.map((n) => ({ ...n, selected: false })),
    ])
    setEditingId(id)
  }

  return (
    <MapCtx.Provider value={actions}>
      <div className="relative h-full w-full overflow-hidden" onKeyDown={onKeyDown} onDoubleClick={onDoubleClick}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          edgesReconnectable
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          onPaneContextMenu={(e) => e.preventDefault()}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          elevateNodesOnSelect={false}
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
          <MapControls onPresent={() => setPresenting(0)} />
          {presenting !== null && (
            <Panel position="bottom-center" className="!mb-6">
              <div className="flex animate-enter items-center gap-1 rounded-xl border bg-card p-1 shadow-lift">
                <Button size="icon-sm" variant="ghost" disabled={presenting === 0} onClick={() => setPresenting(presenting - 1)} aria-label="Anterior">
                  <ChevronLeftIcon />
                </Button>
                <span className="tabular px-2 text-xs font-semibold">
                  {Math.min(presenting + 1, slides.length)} / {slides.length}
                </span>
                <Button size="icon-sm" variant="ghost" disabled={presenting >= slides.length - 1} onClick={() => setPresenting(presenting + 1)} aria-label="Próximo">
                  <ChevronRightIcon />
                </Button>
                <Button size="xs" variant="ghost" onClick={stopPresenting}>
                  Sair (Esc)
                </Button>
              </div>
            </Panel>
          )}
          {focusId && presenting === null && (
            <Panel position="top-center">
              <div className="flex animate-enter items-center gap-2 rounded-lg border bg-card py-1 pr-1 pl-3 text-xs shadow-lift">
                <CrosshairIcon className="size-3.5 text-brand" />
                <span>
                  Foco em <strong className="font-semibold">{nodes.find((n) => n.id === focusId)?.data.label || "item"}</strong>
                </span>
                <Button size="xs" variant="ghost" onClick={() => setFocus(null)}>
                  Sair (Esc)
                </Button>
              </div>
            </Panel>
          )}
          {selectedIdeas.length >= 2 && !editingId && !focusId && presenting === null && (
            <Panel position="top-center">
              <MultiToolbar
                count={selectedIdeas.length}
                onGroup={groupSelected}
                onKind={(kind) => setNodes((ns) => ns.map((n) => (n.selected && n.type === "idea" ? { ...n, data: { ...n.data, kind } } : n)))}
                onStatus={(st) => {
                  for (const n of selectedIdeas) if (n.data.taskId) setTaskStatus(n.data.taskId, st)
                  setNodes((ns) => ns.map((n) => (n.selected && n.type === "idea" ? { ...n, data: { ...n.data, status: st === "afazer" ? undefined : st } } : n)))
                }}
                onDelete={() => {
                  const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
                  setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
                  setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)))
                }}
              />
            </Panel>
          )}
        </ReactFlow>
        {panelNode && (
          <NodePanel
            mapId={map.id}
            nodeId={panelNode.id}
            data={panelNode.data}
            kind={nodeKind(panelNode.data, leads.find((l) => l.id === panelNode.data.leadId)?.stage)}
            areas={areas}
            membersOf={membersLabels}
            style={<StyleFields nodeId={panelNode.id} data={panelNode.data} width={panelNode.width} />}
            onPatch={(patch) => actions.setData(panelNode.id, patch)}
            onConvertTask={() => actions.toTask(panelNode.id)}
            onConvertLead={() => actions.toLead(panelNode.id)}
            onClose={() => setPanelOpen(false)}
          />
        )}
        <div className={cn("pointer-events-none absolute bottom-3 left-1/2 hidden", (presenting !== null || panelNode) && "!hidden", "w-max max-w-[calc(100%-7rem)] -translate-x-1/2 rounded-lg border bg-background/90 px-3 py-1.5 text-center text-xs leading-relaxed text-muted-foreground shadow-sm backdrop-blur lg:block")}>
          <Kbd>Duplo clique</Kbd> cria · <Kbd>Tab</Kbd> filho · <Kbd>Enter</Kbd> irmão · <Kbd>Espaço</Kbd> edita · <Kbd>Del</Kbd> apaga · <Kbd>Arrastar no fundo</Kbd> seleciona vários · <Kbd>Botão direito</Kbd> move a tela · <Kbd>F</Kbd> foco ·
          arraste as bolinhas para conectar · clique na linha e arraste o ponto do meio para moldar · clique na linha para legenda ou desvincular · ○ no canto marca o andamento
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
  const kind = nodeKind({ kind: data.kind, taskId: linked ? data.taskId : undefined, leadId: lead ? data.leadId : undefined, ref: data.ref }, lead?.stage)
  const summaryArea = data.summaryOf ? map.areaLabel(data.summaryOf) : undefined
  const KindIcon = NODE_KIND_ICON[kind]
  const branchCount = map.branchSize(id)
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
    map.setData(id, { status: cycleMapNodeStatus({ status: data.status, taskId: data.taskId }) })
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
        isVisible={selected && !editing && !map.multi}
        minWidth={120}
        minHeight={44}
        lineClassName="!border-brand/60"
        handleClassName="!size-2.5 !rounded-sm !border-brand !bg-card"
      />
      <NodeToolbar isVisible={selected && !editing && !map.multi} position={Position.Top} className="flex gap-0.5 rounded-lg border bg-background p-0.5 shadow-md">
        <ToolbarButton onClick={() => map.addChild(id)} label="Adicionar filho (Tab)">
          <PlusIcon /> Filho
        </ToolbarButton>
        <ToolbarButton onClick={() => map.setFocus(map.focusId === id ? null : id)} label="Modo foco: destaca este ramo (F)">
          <CrosshairIcon />
        </ToolbarButton>
        <AiMenu nodeId={id} label={data.label} description={data.description} />
        <KindPicker nodeId={id} kind={kind} chosen={!!data.kind} />
        {/* Tela larga: estilo e tudo mais ficam no painel lateral. */}
        <span className="lg:hidden">
          <StylePicker nodeId={id} data={data} width={width} />
        </span>
        <span className="hidden lg:inline-flex">
          <ToolbarButton onClick={map.openPanel} label="Detalhes: vínculo, estilo, conexões e contexto">
            <PanelRightIcon /> Detalhes
          </ToolbarButton>
        </span>
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
          "group/node relative flex flex-col items-center gap-1 overflow-hidden rounded-lg border bg-card px-7 py-2 text-center text-sm shadow-xs transition-shadow",
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
        {kind === "decisao" && (data.decision?.decidedAt || data.decision?.ownerId) && !editing && (
          <p className="text-[11px] text-muted-foreground">
            Decidido{data.decision.decidedAt ? ` em ${data.decision.decidedAt.slice(8, 10)}/${data.decision.decidedAt.slice(5, 7)}` : ""}
            {data.decision.ownerId ? ` · ${getUser(data.decision.ownerId).name}` : ""}
          </p>
        )}
        {kind === "resumo" && summaryArea && !editing && <p className="text-[11px] text-muted-foreground">Resume: {summaryArea}</p>}
        {(lead || task || taskMissing || data.ref) && (
          <div className="mt-1 flex w-full flex-col gap-0.5 border-t pt-1 text-left">
            {data.ref && (
              <LinkedRow onUnlink={() => map.setData(id, { ref: undefined })} label="Desvincular">
                <EntityChip entity={data.ref} className="nodrag min-w-0 truncate text-[11px] text-success" showType={false} />
              </LinkedRow>
            )}
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
      {branchCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            map.toggleCollapse(id)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className={cn(
            // Embaixo do balão: as linhas saem pelos lados, aqui não há nada.
            "nodrag absolute -right-2.5 -bottom-2.5 flex h-5 min-w-6 items-center justify-center rounded-full border bg-card px-1.5 text-[11px] leading-none font-semibold text-muted-foreground shadow-xs transition-opacity hover:border-brand/60 hover:text-foreground",
            !data.collapsed && !selected && "opacity-0 group-hover/node:opacity-100",
            data.collapsed && "border-brand/50 text-foreground",
          )}
          title={data.collapsed ? `Mostrar ${branchCount} ${branchCount === 1 ? "item" : "itens"}` : "Recolher este ramo"}
          aria-label={data.collapsed ? `Mostrar ${branchCount} itens` : "Recolher ramo"}
        >
          {data.collapsed ? `+${branchCount}` : "−"}
        </button>
      )}
      {/* Modo "Loose": qualquer bolinha conecta com qualquer outra. */}
      <Handle id="l" type="source" position={Position.Left} className="idea-handle" />
      <Handle id="r" type="source" position={Position.Right} className="idea-handle" />
      <Handle id="t" type="source" position={Position.Top} className="idea-handle" />
      <Handle id="b" type="source" position={Position.Bottom} className="idea-handle" />
    </>
  )
}

const AI_ACTIONS: { id: AiAction; label: string; hint: string }[] = [
  { id: "expandir", label: "Sugerir filhos", hint: "Próximos passos ou subtópicos deste balão" },
  { id: "lacunas", label: "Achar lacunas", hint: "O que está faltando no mapa" },
  { id: "resumir", label: "Resumir ramo", hint: "Este balão e tudo abaixo em 3 frases" },
]

/**
 * IA no balão. As sugestões chegam como RASCUNHO: nada entra no mapa até você
 * aceitar. Só o texto do mapa vai para a IA (nada de leads, valores ou contatos).
 */
function AiMenu({ nodeId, label, description }: { nodeId: string; label: string; description?: string }) {
  const map = useMap()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<AiAction | null>(null)
  const [result, setResult] = useState<(AiResult & { action: AiAction }) | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function run(action: AiAction) {
    if (!label.trim()) return setError("Escreva algo no balão primeiro.")
    setBusy(action)
    setError(null)
    setResult(null)
    try {
      const ctx = map.aiContext(nodeId, action)
      const res = await fetch("/api/ia/mapa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, mapTitle: ctx.mapTitle, outline: ctx.outline, existing: ctx.existing, focus: { label, description } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.erro || "Falha na IA.")
      setResult({ ...data, action })
      if ("items" in data) setPicked(new Set(data.items.map((_: string, i: number) => i)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na IA.")
    } finally {
      setBusy(null)
    }
  }

  function reset() {
    setResult(null)
    setError(null)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title="IA: sugerir, achar lacunas, resumir">
          <SparklesIcon /> IA
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-2 p-2" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {!result &&
          AI_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              disabled={!!busy}
              onClick={() => run(a.id)}
              className="flex items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              {busy === a.id ? <Loader2Icon className="mt-0.5 size-4 shrink-0 animate-spin text-brand" /> : <SparklesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <span className="grid">
                <span className="font-medium">{busy === a.id ? "Pensando…" : a.label}</span>
                <span className="text-[11px] text-muted-foreground">{a.hint}</span>
              </span>
            </button>
          ))}
        {error && <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">{error}</p>}
        {result && "items" in result && (
          <>
            <p className="t-label px-1">Sugestões (rascunho)</p>
            <ul className="grid gap-0.5">
              {result.items.map((it, i) => (
                <li key={i}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/60">
                    <input
                      type="checkbox"
                      checked={picked.has(i)}
                      onChange={() => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))}
                      className="mt-1 accent-[var(--brand)]"
                    />
                    {it}
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={!picked.size}
                onClick={() => {
                  map.addChildren(nodeId, result.items.filter((_, i) => picked.has(i)))
                  setOpen(false)
                  reset()
                }}
              >
                Adicionar {picked.size}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                Descartar
              </Button>
            </div>
          </>
        )}
        {result && "summary" in result && (
          <>
            <p className="t-label px-1">Resumo (rascunho)</p>
            <p className="rounded-md bg-muted/60 px-2 py-1.5 text-sm">{result.summary}</p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                onClick={() => {
                  map.addSummary(nodeId, result.summary)
                  setOpen(false)
                  reset()
                }}
              >
                Criar balão Resumo
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                Descartar
              </Button>
            </div>
          </>
        )}
        <p className="px-1 text-[10px] text-muted-foreground">Vai para a IA só o texto deste mapa.</p>
      </PopoverContent>
    </Popover>
  )
}

/** Uma barra só para vários balões selecionados: agrupar, tipo, andamento e apagar. */
function MultiToolbar({
  count,
  onGroup,
  onKind,
  onStatus,
  onDelete,
}: {
  count: number
  onGroup: () => void
  onKind: (k: NodeKind | undefined) => void
  onStatus: (s: "afazer" | "andamento" | "feito") => void
  onDelete: () => void
}) {
  return (
    <div className="flex animate-enter items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-lift" onDoubleClick={(e) => e.stopPropagation()}>
      <span className="px-2 text-xs font-semibold">{count} selecionados</span>
      <ToolbarButton onClick={onGroup} label="Agrupar numa área">
        <BoxSelectIcon /> Agrupar
      </ToolbarButton>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="xs" variant="ghost" title="Tipo de todos">
            <SquareStackIcon /> Tipo
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="grid w-56 gap-0.5 p-1">
          {NODE_KINDS.map((k) => {
            const KIcon = NODE_KIND_ICON[k.id]
            return (
              <button key={k.id} type="button" onClick={() => onKind(k.id)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
                <KIcon className="size-4 text-muted-foreground" /> {k.label}
              </button>
            )
          })}
          <button type="button" onClick={() => onKind(undefined)} className="rounded-md border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent">
            Automático (pelo vínculo)
          </button>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="xs" variant="ghost" title="Andamento de todos">
            <CircleDotIcon /> Status
          </Button>
        </PopoverTrigger>
        <PopoverContent align="center" className="grid w-44 gap-0.5 p-1">
          {(["afazer", "andamento", "feito"] as const).map((st) => (
            <button key={st} type="button" onClick={() => onStatus(st)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
              <StatusButton status={st} onClick={() => onStatus(st)} className="pointer-events-none" /> {NODE_STATUS[st].label}
            </button>
          ))}
          <p className="px-2 pt-1 text-[11px] text-muted-foreground">Tarefas ligadas mudam junto.</p>
        </PopoverContent>
      </Popover>
      <ToolbarButton onClick={onDelete} label="Apagar selecionados (Del)">
        <Trash2Icon />
      </ToolbarButton>
    </div>
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

/** Estilo em popover (telas pequenas; nas largas fica no painel lateral). */
function StylePicker({ nodeId, data, width }: { nodeId: string; data: IdeaData; width?: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title="Etiqueta, cor, tamanho e descrição">
          <PaletteIcon /> Estilo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-3" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <StyleFields nodeId={nodeId} data={data} width={width} />
      </PopoverContent>
    </Popover>
  )
}

/** Etiqueta (fase), cor, tamanho e descrição do item. Tudo salva na hora. */
function StyleFields({ nodeId, data, width }: { nodeId: string; data: IdeaData; width?: number }) {
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
    <div className="grid gap-3">
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
    </div>
  )
}

function NodeInput({ initial, ready, onDone, placeholder = "Digite a ideia…", className }: { initial: string; ready: boolean; onDone: (v: string) => void; placeholder?: string; className?: string }) {
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
      placeholder={placeholder}
      className={cn("nodrag w-full min-w-40 bg-transparent text-center outline-none", className)}
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

/** Tamanho real na tela (medido pelo React Flow) para saber o que está dentro de um grupo. */
function box(n: IdeaNode) {
  return {
    id: n.id,
    x: n.position.x,
    y: n.position.y,
    width: n.measured?.width ?? n.width ?? 120,
    height: n.measured?.height ?? n.height ?? 40,
  }
}

const AREA_HUES = [150, 210, 260, 320, 30, 80]

/**
 * Grupo: área com título. Arrastar pela área leva junto o que está dentro;
 * duplo clique no título renomeia, no fundo cria um balão ali.
 */
function AreaNodeView({ id, data, selected }: NodeProps<IdeaNode>) {
  const map = useMap()
  const { screenToFlowPosition } = useReactFlow()
  const editing = map.editingId === id
  const hue = data.hue
  const tint = hue !== undefined ? `oklch(0.7 0.1 ${hue})` : "var(--muted-foreground)"
  return (
    <>
      <NodeResizer
        isVisible={selected && !editing}
        minWidth={180}
        minHeight={120}
        lineClassName="!border-brand/60"
        handleClassName="!size-2.5 !rounded-sm !border-brand !bg-card"
      />
      {/* zIndex: a área fica atrás de tudo; título e barra ficam na frente das linhas. */}
      <NodeToolbar isVisible={selected && !editing && !map.multi} position={Position.Bottom} style={{ zIndex: 1001 }} className="flex items-center gap-1 rounded-lg border bg-background p-1 shadow-md">
        <button
          type="button"
          onClick={() => map.setData(id, { hue: undefined })}
          className={cn("size-5 rounded-full border bg-muted", hue === undefined && "ring-2 ring-foreground/50")}
          aria-label="Sem cor"
        />
        {AREA_HUES.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => map.setData(id, { hue: h })}
            className={cn("size-5 rounded-full", hue === h && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-background")}
            style={{ background: `oklch(0.68 0.13 ${h})` }}
            aria-label={`Cor ${h}`}
          />
        ))}
        <ToolbarButton onClick={() => map.remove(id)} label="Desagrupar (os itens continuam no mapa)">
          <ScissorsIcon /> Desagrupar
        </ToolbarButton>
      </NodeToolbar>
      {/* Título como "aba" em cima da área: nenhuma linha passa por cima do nome. */}
      <NodeToolbar isVisible position={Position.Top} align="start" offset={6} style={{ zIndex: 1000 }}>
        <div
          onDoubleClick={(e) => {
            e.stopPropagation()
            map.setEditingId(id)
          }}
          className="max-w-72 rounded-md border bg-background px-2.5 py-1 text-sm font-semibold shadow-xs"
          style={{
            borderColor: `color-mix(in oklch, ${tint} 50%, transparent)`,
            color: hue !== undefined ? `light-dark(oklch(0.42 0.1 ${hue}), oklch(0.82 0.08 ${hue}))` : undefined,
          }}
          title="Duplo clique para renomear"
        >
          {editing ? (
            <NodeInput
              initial={data.label}
              ready
              placeholder="Nome do grupo"
              className="min-w-32 text-left"
              onDone={(label) => {
                map.setLabel(id, label.trim() || data.label || "Grupo")
                map.setEditingId(null)
              }}
            />
          ) : (
            <p className="truncate">{data.label || "Grupo"}</p>
          )}
        </div>
      </NodeToolbar>
      <div
        onDoubleClick={(e) => {
          e.stopPropagation()
          map.createAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
        }}
        className={cn("h-full w-full rounded-xl border-2 border-dashed", selected && "border-solid")}
        style={{ borderColor: `color-mix(in oklch, ${tint} ${selected ? 80 : 45}%, transparent)`, background: `color-mix(in oklch, ${tint} 7%, transparent)` }}
      />
    </>
  )
}

const NODE_TYPES = { idea: IdeaNodeView, area: AreaNodeView }

const ARROWS: { id: Arrow; label: string; hint: string }[] = [
  { id: "nenhuma", label: "—", hint: "Sem seta" },
  { id: "fim", label: "→", hint: "Vai para o destino" },
  { id: "inicio", label: "←", hint: "Volta para a origem" },
  { id: "ambos", label: "↔", hint: "Ida e volta (loop)" },
]

/** Legendas prontas (as mesmas das Conexões do resto do OS). */
const EDGE_LABELS = RELATION_KINDS.map((k) => k.label)

/**
 * Linha entre ideias. Sólida = hierarquia ("filho de"); tracejada com seta = relação
 * livre, com legenda ("depende de", "gera"…). Área de clique larga; selecionada,
 * mostra o tipo, a legenda e "Desvincular". Delete/Backspace também desvincula.
 */
function UnlinkEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, style, markerEnd, markerStart, data }: EdgeProps) {
  const { deleteElements, screenToFlowPosition } = useReactFlow()
  const map = useMap()
  const link = (data ?? {}) as LinkData
  const relation = link.kind === "relacao"
  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2
  const [autoPath, autoX, autoY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  // Linha moldada à mão: curva que PASSA pelo ponto arrastado (guardado como deslocamento do meio).
  const bx = link.bend ? midX + link.bend.dx : autoX
  const by = link.bend ? midY + link.bend.dy : autoY
  const path = link.bend ? `M ${sourceX},${sourceY} Q ${2 * bx - midX},${2 * by - midY} ${targetX},${targetY}` : autoPath
  const labelX = bx
  const labelY = by

  function dragBend(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const move = (ev: PointerEvent) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
      map.setEdgeData(id, { bend: { dx: p.x - midX, dy: p.y - midY } })
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  // zIndex: por cima dos balões (o rótulo fica numa camada abaixo dos nós por padrão).
  const at = { transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, zIndex: selected ? 1001 : undefined }
  const below = { transform: `translate(-50%, 14px) translate(${labelX}px, ${labelY}px)`, zIndex: 1001 }
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={24}
        style={{
          ...style,
          stroke: selected ? "var(--brand)" : relation ? "var(--muted-foreground)" : undefined,
          strokeWidth: selected ? 2.5 : 1.5,
          strokeDasharray: relation ? "6 4" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {selected && (
          <button
            type="button"
            onPointerDown={dragBend}
            onDoubleClick={(e) => {
              e.stopPropagation()
              map.setEdgeData(id, { bend: undefined })
            }}
            className="nodrag nopan pointer-events-auto absolute size-3.5 cursor-grab rounded-full border-2 border-brand bg-card shadow-sm active:cursor-grabbing"
            style={{ ...at, zIndex: 1002 }}
            title="Arraste para moldar a linha · duplo clique volta ao normal"
            aria-label="Moldar a linha"
          />
        )}
        {selected ? (
          <div
            className="nodrag nopan pointer-events-auto absolute flex animate-enter flex-col gap-1.5 rounded-lg border bg-card p-1.5 text-xs shadow-lift"
            style={below}
            onKeyDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-1">
              <Chip active={!relation} onClick={() => map.setEdgeData(id, { kind: undefined })}>
                Hierarquia
              </Chip>
              <Chip active={relation} onClick={() => map.setEdgeData(id, { kind: "relacao" })}>
                Relação
              </Chip>
              <button
                type="button"
                onClick={() => deleteElements({ edges: [{ id }] })}
                className="ml-1 inline-flex items-center gap-1 rounded-md px-1.5 font-medium text-muted-foreground transition-colors hover:text-danger"
              >
                <ScissorsIcon className="size-3.5" /> Desvincular
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Sentido</span>
              {ARROWS.map((a) => (
                <Chip key={a.id} active={arrowOf(link) === a.id} onClick={() => map.setEdgeData(id, { arrow: a.id })} title={a.hint}>
                  {a.label}
                </Chip>
              ))}
            </div>
            <EdgeLabelInput
              key={id}
              value={link.label ?? ""}
              onSave={(label) => map.setEdgeData(id, { label: label || undefined, ...(label && !relation ? { kind: "relacao" as const } : {}) })}
            />
          </div>
        ) : (
          link.label && (
            <span
              className="nodrag nopan pointer-events-none absolute rounded-md border bg-background px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground"
              style={at}
            >
              {link.label}
            </span>
          )
        )}
      </EdgeLabelRenderer>
    </>
  )
}

/** Legenda da linha: digitar livre ou escolher uma pronta. Dar legenda vira relação. */
function EdgeLabelInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  const save = (v: string) => v.trim() !== value && onSave(v.trim())
  return (
    <div className="grid gap-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => save(text)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === "Enter") save(text)
        }}
        placeholder="Legenda (ex.: depende de)"
        className="h-6 w-52 rounded-md border bg-background px-2 text-xs outline-none focus:border-brand"
      />
      <div className="flex max-w-52 flex-wrap gap-1">
        {EDGE_LABELS.filter((l) => l !== value).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => {
              setText(l)
              onSave(l)
            }}
            className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground hover:text-foreground"
          >
            {l}
          </button>
        ))}
      </div>
    </div>
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
      n.type ?? null,
      n.collapsed ?? null,
      n.ref ? `${n.ref.type}:${n.ref.id}` : null,
      n.decision ? JSON.stringify(n.decision) : null,
      n.summaryOf ?? null,
    ]),
    edges.map((e) => [e.id, e.source, e.target, e.kind ?? null, e.label ?? null, e.sourceHandle ?? null, e.targetHandle ?? null, e.arrow ?? null, e.bend ? `${e.bend.dx},${e.bend.dy}` : null]),
  ])
}

/**
 * Zoom e enquadrar com o visual do app (os controles padrão da biblioteca ficavam
 * claro-sobre-claro no tema escuro). Nome de cada botão aparece ao passar o mouse.
 */
function MapControls({ onPresent }: { onPresent: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const buttons = [
    { label: "Aproximar", icon: PlusIcon, onClick: () => zoomIn({ duration: 200 }) },
    { label: "Afastar", icon: MinusIcon, onClick: () => zoomOut({ duration: 200 }) },
    { label: "Enquadrar tudo", icon: MaximizeIcon, onClick: () => fitView({ padding: 0.3, maxZoom: 1, duration: 300 }) },
    { label: "Apresentar (← → para navegar)", icon: PresentationIcon, onClick: onPresent },
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
