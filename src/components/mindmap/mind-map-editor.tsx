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
  useStore as useFlowStore,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { ChevronDownIcon, CircleDotIcon, SquareStackIcon, Loader2Icon, SparklesIcon, BoxSelectIcon, CheckSquareIcon, ChevronLeftIcon, ChevronRightIcon, CrosshairIcon, MaximizeIcon, PanelRightIcon, PresentationIcon, MinusIcon, PaletteIcon, PlusIcon, ScissorsIcon, Trash2Icon, UserPlusIcon, MousePointer2Icon, Undo2Icon, Redo2Icon, TypeIcon, PencilIcon, LayersIcon, MessageSquareIcon, MessageSquarePlusIcon, NetworkIcon, ZoomInIcon } from "lucide-react"
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
  membersOf,
  nodeKind,
  nodeStatus,
  outline,
  resolveLinkedTask,
  type NodeKind,
} from "@/lib/domain/mindmap"
import { DRAW_LIMITS, LAYER_MOVES, ZOOM_LIMITS, drawingFromStroke, gridGap, moveLayer, organize, pathBox, pathD, roundScale, scaleForZoom, scaleOf, scaleSet, zOf, type LayerMove, type ScalePatch, type SizedItem } from "@/lib/domain/canvas"
import { NoteBranches } from "@/components/mindmap/node-notes"
import { AiCommand, type AiScope, type ScopeRow } from "@/components/mindmap/ai-command"
import { addNote, makeNote } from "@/lib/domain/node-notes"
import { autocorrected, spellProps } from "@/lib/use-autocorrect"
import { correctText } from "@/lib/domain/autocorrect"
import { NodePanel } from "@/components/mindmap/node-panel"
import { outlineText, type AiAction, type AiResult, type MapOp } from "@/lib/domain/ai-map"
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
import { record, redo, replacePresent, startHistory, undo, type History } from "@/lib/domain/history"
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

type IdeaData = { label: string; taskId?: string; leadId?: string; tag?: string; hue?: number; description?: string; status?: "andamento" | "feito"; kind?: NodeKind; collapsed?: boolean } & Pick<
  MindMapNode,
  "ref" | "decision" | "summaryOf" | "scale" | "z" | "path" | "stroke" | "notes"
> & {
  /** Tipo gravado que esta versão não conhece (de uma versão mais nova): volta igual ao gravar. */
  storedType?: string
}
/**
 * "idea" = balão; "area" = grupo (retângulo com título que leva junto o que está dentro);
 * "text" = texto solto no fundo do quadro; "drawing" = traço à mão.
 */
type FlowKind = "idea" | "area" | "text" | "drawing"
type IdeaNode = Node<IdeaData, FlowKind>

const FLOW_KIND: Record<NonNullable<MindMapNode["type"]> | "none", FlowKind> = { none: "idea", group: "area", text: "text", drawing: "drawing" }
const STORED_TYPE: Record<FlowKind, MindMapNode["type"]> = { idea: undefined, area: "group", text: "text", drawing: "drawing" }

/** Ferramenta do quadro: selecionar/mover, escrever texto solto, desenhar. */
type Tool = "selecionar" | "texto" | "desenhar"
/** Tamanho padrão da letra do texto solto (px na tela, antes da ampliação). */
const TEXT_SIZE = 24
const PEN_SIZES = [
  { id: 2, label: "Fino" },
  { id: 4, label: "Médio" },
  { id: 8, label: "Grosso" },
]
/** Cor de texto/desenho: matiz ou sem valor = cor do texto do tema. */
const INK_HUES = [25, 75, 150, 250, 310]
const inkColor = (hue?: number) => (hue === undefined ? "var(--foreground)" : `oklch(0.62 0.17 ${hue})`)

const CHILD_DX = 240
const ROW_DY = 64
const COL_DX = 200
const CHILD_DY = 120

/** Para que lado o filho nasce. A linha sai exatamente desse lado (não escolhe sozinha). */
type Dir = "direita" | "baixo" | "esquerda" | "cima"
const DIRS: { id: Dir; label: string; arrow: string; out: string; in: string }[] = [
  { id: "direita", label: "Direita", arrow: "→", out: "r", in: "l" },
  { id: "baixo", label: "Baixo", arrow: "↓", out: "b", in: "t" },
  { id: "esquerda", label: "Esquerda", arrow: "←", out: "l", in: "r" },
  { id: "cima", label: "Cima", arrow: "↑", out: "t", in: "b" },
]
const DIR = Object.fromEntries(DIRS.map((d) => [d.id, d])) as Record<Dir, (typeof DIRS)[number]>
/** Lado de uma linha já existente (pelo ponto de saída). */
const dirOfHandle = (h?: string | null): Dir | undefined => DIRS.find((d) => d.out === h)?.id

/** Posição do n-ésimo filho naquela direção (em fila: vertical para os lados, horizontal para cima/baixo). */
/** `s` = ampliação do pai: num balão pequeno (zoom infinito) os filhos ficam perto, na mesma escala. */
function childPosition(parent: { x: number; y: number }, dir: Dir, index: number, s = 1) {
  if (dir === "direita") return { x: parent.x + CHILD_DX * s, y: parent.y + index * ROW_DY * s }
  if (dir === "esquerda") return { x: parent.x - CHILD_DX * s, y: parent.y + index * ROW_DY * s }
  if (dir === "baixo") return { x: parent.x + index * COL_DX * s, y: parent.y + CHILD_DY * s }
  return { x: parent.x + index * COL_DX * s, y: parent.y - CHILD_DY * s }
}

interface MapActions {
  editingId: string | null
  setEditingId: (id: string | null) => void
  setLabel: (id: string, label: string) => void
  addChild: (id: string, dir?: Dir) => void
  /** Direção atual dos filhos (a última escolhida neste mapa). */
  childDir: Dir
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
  /** Amplia/reduz itens (fator) em volta do centro do conjunto. */
  scaleItems: (ids: string[], factor: number) => void
  /** Camada (frente/trás) dos itens. */
  moveLayers: (ids: string[], move: LayerMove) => void
  /** Item sendo anotado (cartão de anotações aberto mesmo sem nenhuma). */
  notesFor: string | null
  setNotesFor: (id: string | null) => void
}

const MapCtx = createContext<MapActions | null>(null)
const useMap = () => useContext(MapCtx)!

/**
 * Balão gravado -> nó do React Flow. TODOS os campos do balão vão para `data`
 * (inclusive os que esta versão não conhece): assim uma versão mais antiga/nova do
 * app aberta no outro computador nunca apaga o que não entende ao gravar de volta.
 */
function flowNode(n: MindMapNode): IdeaNode {
  const z = zOf(n)
  const { id, x, y, width, height, type, ...rest } = n
  const known = FLOW_KIND[type ?? "none"]
  return {
    id,
    type: known ?? "idea",
    ...(z ? { zIndex: z } : {}),
    position: { x, y },
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    data: { ...rest, ...(known ? {} : { storedType: type }) } as IdeaData,
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
  // Balão normal: números inteiros, como sempre. Minúsculo (zoom infinito): precisão suficiente para não "pular".
  const r = scaleOf(n.data) >= 0.5 ? Math.round : (v: number) => Number(v.toPrecision(6))
  const { storedType, ...data } = n.data
  return {
    // Campos que esta versão não conhece seguem como vieram (ver flowNode).
    ...data,
    id: n.id,
    x: r(n.position.x),
    y: r(n.position.y),
    type: (storedType as MindMapNode["type"]) ?? STORED_TYPE[n.type ?? "idea"],
    collapsed: data.collapsed || undefined,
    decision: data.decision && Object.keys(data.decision).length ? data.decision : undefined,
    width: n.width ? r(n.width) : undefined,
    height: n.height ? r(n.height) : undefined,
    notes: data.notes?.length ? data.notes : undefined,
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
  remoteApplied: React.RefObject<boolean>,
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
      remoteApplied.current = true
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
      remoteApplied.current = true
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
      remoteApplied.current = true
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
  }, [map, rows, setNodes, setEdges, remoteApplied])
}

type Snapshot = { nodes: MindMapNode[]; edges: MindMapEdge[]; key: string }

const snapshotOf = (nodes: IdeaNode[], edges: Edge[]): Snapshot => {
  const ns = nodes.map(toMapNode)
  const es = edges.map(toMapEdge)
  return { nodes: ns, edges: es, key: JSON.stringify([ns.map(signature), es.map(signature)]) }
}

/**
 * Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) no mapa. Cada pausa de edição (~0,4s) vira um
 * passo: arrastar, digitar, organizar, apagar… Seleção e medidas não contam.
 * Desfazer grava normalmente (o sócio vê o mapa voltar).
 */
function useMapHistory(
  nodes: IdeaNode[],
  edges: Edge[],
  setNodes: React.Dispatch<React.SetStateAction<IdeaNode[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  remoteApplied: React.RefObject<boolean>,
) {
  const hist = useRef<History<Snapshot> | null>(null)
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; snap: Snapshot } | null>(null)
  // Próxima mudança se junta ao passo anterior (ex.: aplicar a IA + organizar = um Ctrl+Z).
  const merge = useRef(false)
  const [, bump] = useState(0)

  const commit = useCallback(() => {
    const p = pending.current
    if (!p || !hist.current) return
    clearTimeout(p.timer)
    pending.current = null
    if (p.snap.key === hist.current.present.key) return
    hist.current = remoteApplied.current || merge.current ? replacePresent(hist.current, p.snap) : record(hist.current, p.snap)
    remoteApplied.current = false
    merge.current = false
    bump((x) => x + 1)
  }, [remoteApplied])

  useEffect(() => {
    const snap = snapshotOf(nodes, edges)
    if (!hist.current) {
      hist.current = startHistory(snap)
      return
    }
    if (snap.key === (pending.current?.snap.key ?? hist.current.present.key)) return
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = { snap, timer: setTimeout(commit, 400) }
  }, [nodes, edges, commit])

  const restore = useCallback(
    (snap: Snapshot) => {
      // Reaproveita o que não mudou (sem piscar: o React Flow não precisa medir de novo).
      setNodes((current) => {
        const byId = new Map(current.map((n) => [n.id, n]))
        return snap.nodes.map((n) => {
          const cur = byId.get(n.id)
          if (cur && signature(toMapNode(cur)) === signature(n)) return cur
          return { ...flowNode(n), selected: !!cur?.selected, ...(cur?.measured ? { measured: cur.measured } : {}) }
        })
      })
      setEdges((current) => {
        const byId = new Map(current.map((e) => [e.id, e]))
        return snap.edges.map((e) => {
          const cur = byId.get(e.id)
          return cur && signature(toMapEdge(cur)) === signature(e) ? cur : { ...flowEdge(e), selected: !!cur?.selected }
        })
      })
    },
    [setNodes, setEdges],
  )

  const go = useCallback(
    (dir: "undo" | "redo") => {
      commit() // a edição de agora vira passo antes de desfazer
      if (!hist.current) return
      const next = dir === "undo" ? undo(hist.current) : redo(hist.current)
      if (!next) return
      hist.current = next
      restore(next.present)
      bump((x) => x + 1)
    },
    [commit, restore],
  )

  return {
    undo: () => go("undo"),
    redo: () => go("redo"),
    /** A mudança que vem a seguir entra no mesmo passo do Ctrl+Z que a última. */
    mergeNext: () => {
      commit()
      merge.current = true
    },
    canUndo: !!hist.current?.past.length || !!pending.current,
    canRedo: !!hist.current?.future.length,
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
  const initial = useMemo(() => toFlow(map), [map.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { screenToFlowPosition, flowToScreenPosition, getZoom, setCenter, fitView } = useReactFlow()
  // Mudança que veio do sócio: entra no histórico sem virar um passo do Ctrl+Z daqui.
  const remoteApplied = useRef(false)
  useMapSync(map, nodes, edges, setNodes, setEdges, remoteApplied)
  const history = useMapHistory(nodes, edges, setNodes, setEdges, remoteApplied)
  const [focusId, setFocus] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>("selecionar")
  const [pen, setPen] = useState<{ hue?: number; size: number }>({ size: 4 })
  const [notesFor, setNotesFor] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [childDir, setChildDir] = useState<Dir>("direita")
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

  /**
   * Zoom infinito: "acompanha" o item novo. Se ele ficou pequeno/grande demais na
   * tela ou fora dela, a tela vai até ele (no zoom em que ele aparece no tamanho normal).
   */
  const follow = useCallback(
    (position: { x: number; y: number }, scale = 1) => {
      const zoom = getZoom()
      const onScreen = scale * zoom
      const target = { x: position.x + 70 * scale, y: position.y + 20 * scale }
      const p = flowToScreenPosition(target)
      const r = wrapRef.current?.getBoundingClientRect()
      const outside = !!r && (p.x < r.left + 40 || p.x > r.right - 40 || p.y < r.top + 40 || p.y > r.bottom - 40)
      if (onScreen < 0.45 || onScreen > 2.5) setCenter(target.x, target.y, { zoom: Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, 1 / scale)), duration: 450 })
      else if (outside) setCenter(target.x, target.y, { zoom, duration: 300 })
    },
    [getZoom, setCenter, flowToScreenPosition],
  )

  /**
   * Cria um balão (ou texto solto). Sem pai, nasce do tamanho da tela (zoom infinito:
   * aproximou, nasce pequeno). Com pai, na mesma escala do pai.
   */
  const createNode = useCallback(
    (position: { x: number; y: number }, parentId?: string, dir?: Dir, scale: number | undefined | "zoom" = "zoom", type: "idea" | "text" = "idea") => {
      const id = uid()
      const s = scale === "zoom" ? scaleForZoom(getZoom()) : roundScale(scale ?? 1)
      const data: IdeaData = { label: "", ...(s ? { scale: s } : {}) }
      setNodes((ns) => [
        ...ns.map((n) => ({ ...n, selected: false })),
        { id, type, position, data, selected: true, ...(type === "text" ? { zIndex: -1 } : {}) },
      ])
      const handles = dir ? { sourceHandle: DIR[dir].out, targetHandle: DIR[dir].in } : {}
      if (parentId) setEdges((es) => [...es, { id: uid(), source: parentId, target: id, ...handles }])
      setEditingId(id)
      follow(position, s ?? 1)
      return id
    },
    [setNodes, setEdges, getZoom, follow],
  )

  /** Aplica ampliação/posição calculadas (conjunto, hierarquia, desfazer). */
  const applyScale = useCallback(
    (patches: ScalePatch[]) => {
      const byId = new Map(patches.map((p) => [p.id, p]))
      setNodes((ns) =>
        ns.map((n) => {
          const p = byId.get(n.id)
          if (!p) return n
          return {
            ...n,
            position: { x: p.x, y: p.y },
            ...(n.width ? { width: p.width } : {}),
            ...(n.height ? { height: p.height } : {}),
            // Área (grupo) só muda de tamanho; o resto ganha a ampliação.
            data: n.type === "area" ? n.data : { ...n.data, scale: p.scale },
          }
        }),
      )
    },
    [setNodes],
  )

  const actions: MapActions = useMemo(() => {
    const findNode = (id: string) => nodes.find((n) => n.id === id)
    return {
      editingId,
      setEditingId,
      setLabel: (id, label) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n))),
      childDir,
      addChild: (id, dir) => {
        const parent = findNode(id)
        if (!parent) return
        const d = dir ?? childDir
        if (dir) setChildDir(dir)
        // Conta só os filhos que já estão daquele lado, para enfileirar sem sobrepor.
        const same = edges.filter((e) => e.source === id && isHierarchy(e) && (dirOfHandle(e.sourceHandle) ?? "direita") === d).length
        createNode(childPosition(parent.position, d, same, scaleOf(parent.data)), id, d, parent.data.scale)
      },
      addSibling: (id) => {
        const node = findNode(id)
        if (!node) return
        const link = edges.find((e) => e.target === id && isHierarchy(e))
        const d = dirOfHandle(link?.sourceHandle) ?? "direita"
        // Irmão fica ao lado, na fila da mesma direção do pai, na mesma escala.
        const s = scaleOf(node.data)
        const pos = d === "baixo" || d === "cima" ? { x: node.position.x + COL_DX * s, y: node.position.y } : { x: node.position.x, y: node.position.y + ROW_DY * s }
        createNode(pos, link?.source, link?.sourceHandle ? d : undefined, node.data.scale)
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
      multi: nodes.filter((n) => n.selected).length + edges.filter((e) => e.selected).length > 1,
      aiContext: (nodeId, action) => {
        const all = outline(nodes.map(toMapNode), links)
        const branch = action === "resumir" ? new Set([nodeId, ...descendants(nodeId, links)]) : null
        const rows = branch ? all.filter((r) => branch.has(r.node.id)) : all
        return { mapTitle: map.title, outline: outlineText(rows), existing: nodes.filter((n) => n.type === "idea").map((n) => n.data.label).filter(Boolean) }
      },
      addChildren: (parentId, labels) => {
        const parent = findNode(parentId)
        if (!parent || !labels.length) return
        const d = childDir
        const start = edges.filter((e) => e.source === parentId && isHierarchy(e) && (dirOfHandle(e.sourceHandle) ?? "direita") === d).length
        const created = labels.map((label, i) => ({
          id: uid(),
          type: "idea" as const,
          position: childPosition(parent.position, d, start + i, scaleOf(parent.data)),
          data: { label, scale: parent.data.scale },
        }))
        setNodes((ns) => [...ns, ...created])
        setEdges((es) => [...es, ...created.map((c) => ({ id: uid(), source: parentId, target: c.id, sourceHandle: DIR[d].out, targetHandle: DIR[d].in }))])
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
            position: { x: parent.position.x + CHILD_DX * scaleOf(parent.data), y: parent.position.y - ROW_DY * scaleOf(parent.data) },
            data: { label: `Resumo: ${parent.data.label}`, description: text, kind: "resumo", scale: parent.data.scale },
          },
        ])
        setEdges((es) => [...es, { id: uid(), source: parentId, target: id }])
      },
      areaLabel: (areaId) => nodes.find((n) => n.id === areaId && n.type === "area")?.data.label || (nodes.some((n) => n.id === areaId) ? "Grupo" : undefined),
      scaleItems: (ids, factor) => {
        const set = new Set(ids)
        applyScale(scaleSet(nodes.filter((n) => set.has(n.id)).map(sized), factor))
      },
      moveLayers: (ids, move) => {
        const next = moveLayer(nodes.map((n) => ({ id: n.id, z: n.data.z, type: STORED_TYPE[n.type ?? "idea"] })), new Set(ids), move)
        setNodes((ns) => ns.map((n) => (next.has(n.id) ? { ...n, zIndex: next.get(n.id), data: { ...n.data, z: next.get(n.id) } } : n)))
      },
      notesFor,
      setNotesFor,
    }
  }, [nodes, edges, editingId, setNodes, setEdges, createNode, branch, focusId, links, map.title, childDir, applyScale, notesFor])

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const isHidden = hidden.has(n.id)
        const dim = !!focused && !focused.has(n.id) && n.type !== "area"
        const className = cn(n.type === "drawing" && "map-drawing", dim && "opacity-15 transition-opacity") || undefined
        // Balão selecionado com anotações abertas fica por cima: os balões ramificados não somem atrás dos vizinhos.
        const lifted = n.selected && n.type === "idea" && (!!n.data.notes?.length || notesFor === n.id)
        if (!isHidden && !n.hidden && className === n.className && !lifted) return n
        return { ...n, hidden: isHidden, className, ...(lifted ? { zIndex: 1000 } : {}) }
      }),
    [nodes, hidden, focused, notesFor],
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
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return
    const selected = nodes.find((n) => n.selected)
    if (!selected) return
    if (selected.type !== "idea" && (e.key === "Tab" || e.key === "Enter")) return
    if (e.key === "Tab") {
      e.preventDefault()
      actions.addChild(selected.id)
    } else if (e.key === "Enter") {
      e.preventDefault()
      actions.addSibling(selected.id)
    } else if ((e.key === "f" || e.key === "F") && selected.type === "idea") {
      e.preventDefault()
      setFocus(focusId === selected.id ? null : selected.id)
    } else if ((e.key === "F2" || e.key === " ") && selected.type !== "drawing") {
      e.preventDefault()
      setEditingId(selected.id)
    }
  }

  // Ferramentas do quadro (V, T, D) e Z: valem mesmo com o foco fora do mapa (depois de clicar no fundo).
  // Sem Ctrl/Cmd, para não brigar com copiar/colar/desfazer; nunca enquanto digita.
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id).join()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId || presenting !== null) return
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (t !== document.body && !wrapRef.current?.contains(t)) return
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === "z" || k === "y")) {
        e.preventDefault()
        if (k === "y" || e.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (k === "v" || (k === "escape" && tool !== "selecionar")) setTool("selecionar")
      else if (k === "t") setTool("texto")
      else if (k === "d") setTool("desenhar")
      else if (k === "z") {
        // Zoom infinito: entra no que está selecionado (ou enquadra tudo).
        const ids = selectedIds ? selectedIds.split(",") : []
        // Para quando o menor item selecionado aparece no tamanho normal (zoom = 1 / ampliação dele).
        const smallest = Math.min(...nodes.filter((n) => ids.includes(n.id)).map((n) => scaleOf(n.data)))
        if (ids.length) fitView({ nodes: ids.map((id) => ({ id })), padding: 0.5, maxZoom: Math.min(ZOOM_LIMITS.max, 1 / smallest), duration: 450 })
        else fitView({ padding: 0.3, maxZoom: 1, duration: 400 })
      } else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [tool, editingId, presenting, selectedIds, fitView, nodes, history])

  function onDoubleClick(e: React.MouseEvent) {
    if (tool !== "selecionar" || !(e.target as HTMLElement).classList.contains("react-flow__pane")) return
    createNode(screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  // Ferramenta Texto: um clique no fundo do quadro escreve ali (e volta para selecionar).
  function onPaneClick(e: React.MouseEvent) {
    if (tool !== "texto") return
    createNode(screenToFlowPosition({ x: e.clientX, y: e.clientY - 16 }), undefined, undefined, "zoom", "text")
    setTool("selecionar")
  }

  // Ferramenta Desenhar: arrastar no fundo faz um traço. A rodinha continua dando zoom.
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null)
  const strokeRef = useRef<{ screen: { x: number; y: number }[]; flow: { x: number; y: number }[] } | null>(null)
  function onDrawStart(e: React.PointerEvent) {
    if (tool !== "desenhar" || e.button !== 0) return
    if ((e.target as HTMLElement).closest(".react-flow__panel, .react-flow__node-toolbar")) return
    e.preventDefault()
    e.stopPropagation()
    const r = wrapRef.current!.getBoundingClientRect()
    strokeRef.current = { screen: [{ x: e.clientX - r.left, y: e.clientY - r.top }], flow: [screenToFlowPosition({ x: e.clientX, y: e.clientY })] }
    setStroke(strokeRef.current.screen)
    const move = (ev: PointerEvent) => {
      const cur = strokeRef.current
      if (!cur || cur.flow.length > DRAW_LIMITS.points * 4) return
      cur.screen.push({ x: ev.clientX - r.left, y: ev.clientY - r.top })
      cur.flow.push(screenToFlowPosition({ x: ev.clientX, y: ev.clientY }))
      setStroke([...cur.screen])
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      const cur = strokeRef.current
      strokeRef.current = null
      setStroke(null)
      const d = cur && drawingFromStroke(cur.flow, getZoom(), pen.size)
      if (!d) return
      setNodes((ns) => [
        ...ns,
        { id: uid(), type: "drawing", zIndex: -1, position: { x: d.x, y: d.y }, data: { label: "", path: d.path, stroke: d.stroke, scale: d.scale, hue: pen.hue } },
      ])
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
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
  const panelNode = presenting === null && panelOpen && selectedAll.length === 1 && selectedAll[0].type === "idea" && !edges.some((e) => e.selected) ? selectedAll[0] : undefined
  const leads = useStore((s) => s.leads)
  const areas = nodes.filter((n) => n.type === "area").map((n) => ({ id: n.id, label: n.data.label }))
  const membersLabels = (areaId: string) => {
    const area = nodes.find((n) => n.id === areaId)
    if (!area) return []
    const ids = new Set(membersOf(box(area), nodes.filter((n) => n.type === "idea").map(box)))
    return nodes.filter((n) => ids.has(n.id) && n.id !== panelNode?.id).map((n) => n.data.label || "Sem texto")
  }

  const selectedIdeas = nodes.filter((n) => n.selected && n.type !== "area")
  const selectedLinks = edges.filter((e) => e.selected)
  function groupSelected() {
    if (selectedIdeas.length < 2) return
    const a = areaAround(selectedIdeas.map(box))
    const id = uid()
    setNodes((ns) => [
      { id, type: "area", zIndex: -2, position: { x: a.x, y: a.y }, width: a.width, height: a.height, data: { label: "Grupo" }, selected: true },
      ...ns.map((n) => ({ ...n, selected: false })),
    ])
    setEditingId(id)
  }

  const [sizing, setSizing] = useState(false)

  /**
   * IA: tamanhos pela hierarquia das linhas. A IA sugere o peso de cada balão;
   * a regra garante que filho nunca fica do tamanho do pai ou maior. Sem IA
   * (fora do ar, limite), usa só a hierarquia. Dá para desfazer.
   */
  function organizeSelected() {
    return organizeNodes(selectedAll.filter((n) => n.type === "idea"), nodes, edges, true)
  }

  /** Organiza estes balões (importância → tamanhos → árvore). `useAi` = pede a importância para a IA. */
  async function organizeNodes(items: IdeaNode[], allNodes: IdeaNode[], allEdges: Edge[], useAi: boolean) {
    if (items.length < 2) return
    const ids = new Set(items.map((n) => n.id))
    const allLinks = allEdges.map(toMapEdge)
    if (!allLinks.some((l) => l.kind !== "relacao" && ids.has(l.source) && ids.has(l.target)))
      return toast("Nenhuma linha de hierarquia entre os selecionados", { description: "Ligue os balões (pai → filho) e tente de novo." })
    const rows = outline(items.map(toMapNode), allLinks)
    let suggested: Map<string, number> | undefined
    let usedAi = false
    if (useAi) setSizing(true)
    if (useAi) try {
      const res = await fetch("/api/ia/mapa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "hierarquia", mapTitle: map.title, outline: outlineText(rows), focus: { label: rows[0]?.node.label || "Mapa" } }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.levels) {
        suggested = new Map(rows.filter((r) => data.levels[r.number] !== undefined).map((r) => [r.node.id, data.levels[r.number] as number]))
        usedAi = true
      }
    } catch {
      // Sem IA: segue só pela hierarquia.
    }
    setSizing(false)
    // Tamanhos medidos mais recentes (balões que acabaram de nascer já foram medidos).
    const fresh = new Map(allNodes.map((n) => [n.id, n]))
    applyScale(organize(items.map((n) => sized(fresh.get(n.id) ?? n)), allLinks, suggested))
    // Árvore da esquerda para a direita: as linhas do conjunto saem pela direita do pai e entram pela esquerda do filho.
    setEdges((es) => es.map((e) => (isHierarchy(e) && ids.has(e.source) && ids.has(e.target) ? { ...e, sourceHandle: "r", targetHandle: "l" } : e)))
    toast.success(usedAi ? "Mapa organizado pela importância (IA)" : "Mapa organizado pela hierarquia", {
      description: usedAi ? "Principal maior, detalhes menores, cada ramo no seu lugar. Ctrl+Z desfaz." : useAi ? "A IA não respondeu agora; usei só as linhas pai → filho. Ctrl+Z desfaz." : "Cada ramo no seu lugar. Ctrl+Z desfaz.",
      action: { label: "Desfazer", onClick: history.undo },
    })
  }

  // Pedido livre à IA: sobre os balões selecionados ou o mapa inteiro.
  const meId = useStore((s) => s.meId)
  const latest = useRef({ nodes, edges })
  latest.current = { nodes, edges }

  function aiScope(): AiScope {
    const sel = nodes.filter((n) => n.selected && n.type === "idea")
    const scope = sel.length ? sel : nodes.filter((n) => n.type === "idea")
    const rows = outline(scope.map(toMapNode), links)
    return {
      label: sel.length ? `${sel.length} ${sel.length === 1 ? "balão selecionado" : "balões selecionados"}` : "o mapa inteiro",
      mapTitle: map.title,
      outline: outlineText(rows),
      rows: rows.map((r) => ({ number: r.number, id: r.node.id, label: r.node.label })),
    }
  }

  /** Aplica as mudanças escolhidas do rascunho da IA, tudo de uma vez (um Ctrl+Z desfaz). */
  function applyPlan(ops: MapOp[], organizeAfter: boolean, rows: ScopeRow[]) {
    const idOf = new Map(rows.map((r) => [r.number, r.id]))
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const created = new Map<string, { id: string; position: { x: number; y: number }; scale?: number }>()
    const childCount = new Map<string, number>()
    const newNodes: IdeaNode[] = []
    const newEdges: Edge[] = []
    const patches = new Map<string, Partial<IdeaData>>()
    const removed = new Set<string>()
    const patch = (id: string, p: Partial<IdeaData>) => patches.set(id, { ...patches.get(id), ...p })
    const scopeNodes = rows.map((r) => byId.get(r.id)).filter((n): n is IdeaNode => !!n)
    const bottom = scopeNodes.length ? Math.max(...scopeNodes.map((n) => n.position.y + box(n).height)) : 0
    const left = scopeNodes.length ? Math.min(...scopeNodes.map((n) => n.position.x)) : 0
    let loose = 0

    for (const op of ops) {
      if (op.op === "adicionar") {
        const parentId = op.parent ? (idOf.get(op.parent) ?? created.get(op.parent)?.id) : undefined
        const parentNode = parentId ? byId.get(parentId) : undefined
        const parentNew = op.parent ? created.get(op.parent) : undefined
        const parent = parentNode ? { position: parentNode.position, scale: parentNode.data.scale } : parentNew
        const id = uid()
        let position: { x: number; y: number }
        if (parentId && parent) {
          const existing = edges.filter((e) => e.source === parentId && isHierarchy(e) && (dirOfHandle(e.sourceHandle) ?? "direita") === "direita").length
          const i = existing + (childCount.get(parentId) ?? 0)
          childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1)
          position = childPosition(parent.position, "direita", i, parent.scale ?? 1)
        } else position = { x: left, y: bottom + 120 + loose++ * ROW_DY }
        const scale = parent?.scale
        newNodes.push({ id, type: "idea", position, data: { label: op.label, ...(op.description ? { description: op.description } : {}), ...(scale ? { scale } : {}) } })
        if (parentId) newEdges.push({ id: uid(), source: parentId, target: id, sourceHandle: "r", targetHandle: "l" })
        if (op.ref) created.set(op.ref, { id, position, scale })
      } else {
        const id = idOf.get(op.target)
        if (!id) continue
        if (op.op === "renomear") patch(id, { label: op.label })
        else if (op.op === "descrever") patch(id, { description: op.description })
        else if (op.op === "anotar") {
          const note = makeNote({ kind: op.kind, text: op.text, app: op.app }, meId, uid())
          if (note) patch(id, { notes: addNote(patches.get(id)?.notes ?? byId.get(id)?.data.notes, note) })
        } else if (op.op === "remover") removed.add(id)
      }
    }

    setNodes((ns) => [
      ...ns.filter((n) => !removed.has(n.id)).map((n) => (patches.has(n.id) ? { ...n, data: { ...n.data, ...patches.get(n.id) } } : n)),
      ...newNodes,
    ])
    setEdges((es) => [...es.filter((e) => !removed.has(e.source) && !removed.has(e.target)), ...newEdges])
    const total = ops.length
    if (total) toast.success(`${total} ${total === 1 ? "mudança aplicada" : "mudanças aplicadas"}`, { description: "Ctrl+Z desfaz tudo de uma vez.", action: { label: "Desfazer", onClick: history.undo } })

    // Organizar depois: espera os balões novos serem medidos.
    if (organizeAfter) {
      const ids = new Set([...rows.map((r) => r.id), ...newNodes.map((n) => n.id)].filter((id) => !removed.has(id)))
      setTimeout(() => {
        const cur = latest.current
        history.mergeNext()
        organizeNodes(cur.nodes.filter((n) => ids.has(n.id) && n.type === "idea"), cur.nodes, cur.edges, false)
      }, 450)
    }
  }

  /** Volta os selecionados ao tamanho normal (sem ampliação e sem tamanho fixo): conserta balões distorcidos. */
  function resetSize() {
    const ids = new Set(selectedAll.map((n) => n.id))
    setNodes((ns) => ns.map((n) => (ids.has(n.id) && n.type === "idea" ? { ...n, width: undefined, height: undefined, data: { ...n.data, scale: undefined } } : n)))
    toast("Tamanho normal", { description: "Ctrl+Z desfaz.", action: { label: "Desfazer", onClick: history.undo } })
  }

  const drawing = tool === "desenhar"

  return (
    <MapCtx.Provider value={actions}>
      <div
        ref={wrapRef}
        className={cn("relative h-full w-full overflow-hidden", tool === "texto" && "[&_.react-flow__pane]:!cursor-text", drawing && "[&_.react-flow__pane]:!cursor-crosshair [&_.react-flow__node]:!cursor-crosshair")}
        onKeyDown={onKeyDown}
        onDoubleClick={onDoubleClick}
        onPointerDownCapture={onDrawStart}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onPaneClick={onPaneClick}
          edgesReconnectable
          selectionOnDrag={!drawing}
          selectionMode={SelectionMode.Partial}
          panOnDrag={[1, 2]}
          nodesDraggable={!drawing}
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
          minZoom={ZOOM_LIMITS.min}
          maxZoom={ZOOM_LIMITS.max}
          proOptions={{ hideAttribution: true }}
        >
          <InfiniteBackground />
          <MapControls onPresent={() => setPresenting(0)} history={history} />
          {presenting === null && <ToolPanel tool={tool} setTool={setTool} pen={pen} setPen={setPen} ai={<AiCommand getScope={aiScope} onApply={applyPlan} />} />}
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
          {selectedIdeas.length + selectedLinks.length >= 2 && !editingId && !focusId && presenting === null && (
            <Panel position="top-center">
              <MultiToolbar
                nodeCount={selectedIdeas.filter((n) => n.type === "idea").length}
                decorCount={selectedIdeas.filter((n) => n.type !== "idea").length}
                edgeCount={selectedLinks.length}
                sizing={sizing}
                onScale={(factor) => actions.scaleItems(selectedAll.map((n) => n.id), factor)}
                onHierarchy={organizeSelected}
                onReset={resetSize}
                onLayer={(move) => actions.moveLayers(selectedAll.map((n) => n.id), move)}
                onEdges={(patch) => setEdges((es) => es.map((e) => (e.selected ? { ...e, data: { ...(e.data as LinkData | undefined), ...patch } } : e)))}
                onGroup={groupSelected}
                onKind={(kind) => setNodes((ns) => ns.map((n) => (n.selected && n.type === "idea" ? { ...n, data: { ...n.data, kind } } : n)))}
                onStatus={(st) => {
                  for (const n of selectedIdeas) if (n.data.taskId) setTaskStatus(n.data.taskId, st)
                  setNodes((ns) => ns.map((n) => (n.selected && n.type === "idea" ? { ...n, data: { ...n.data, status: st === "afazer" ? undefined : st } } : n)))
                }}
                onDelete={() => {
                  const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id))
                  setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
                  setEdges((es) => es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)))
                }}
              />
            </Panel>
          )}
        </ReactFlow>
        {stroke && stroke.length > 1 && (
          <svg className="pointer-events-none absolute inset-0 z-10 size-full">
            <polyline
              points={stroke.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={inkColor(pen.hue)}
              strokeWidth={pen.size}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
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
          <Kbd>Duplo clique</Kbd> cria · <Kbd>Tab</Kbd> filho (lado escolhido em Filho ▾) · <Kbd>Enter</Kbd> irmão · <Kbd>Espaço</Kbd> edita · <Kbd>Del</Kbd> apaga · <Kbd>Arrastar no fundo</Kbd> seleciona vários · <Kbd>Botão direito</Kbd> move a tela · <Kbd>F</Kbd> foco · <Kbd>Rodinha</Kbd> zoom infinito · <Kbd>Z</Kbd> entra no selecionado · <Kbd>T</Kbd> texto · <Kbd>D</Kbd> desenhar ·
          arraste as bolinhas para conectar · clique na linha e arraste o ponto do meio para moldar · clique na linha para legenda ou desvincular · ○ no canto marca o andamento
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
  const internal = useInternalNode(id)
  const measured = !!internal?.measured.width
  // Tamanho escolhido pelo usuário (cantos ou P/M/G); "width" das props é o medido.
  const fixed = internal?.width ? { width: internal.width / scaleOf(data), ...(internal.height ? { height: internal.height / scaleOf(data) } : {}) } : undefined
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
  // Só balão com tamanho escolhido (cantos ou P/M/G) tem letra que "preenche" a caixa.
  // A caixa vem do que foi gravado, nunca do tamanho medido: medir → letra → medir
  // virava um ciclo que distorcia o balão (letra gigante, palavra quebrada).
  const sized = !!fixed
  // Zoom infinito: o balão inteiro (texto, bolinhas, ícones) é desenhado em escala.
  const s = scaleOf(data)
  const localW = fixed?.width
  const localH = fixed ? (fixed.height ?? fixed.width * 0.4) : undefined
  const notesOpen = selected && !editing && !map.multi && (!!data.notes?.length || map.notesFor === id)
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
        { width: localW!, height: localH! },
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
      {selected && !editing && !map.multi && <ScreenResizer minWidth={120 * s} minHeight={44 * s} />}
      <NodeToolbar isVisible={selected && !editing && !map.multi} position={Position.Top} className="flex gap-0.5 rounded-lg border bg-background p-0.5 shadow-md">
        <ChildButton nodeId={id} />
        <ToolbarButton onClick={() => map.setFocus(map.focusId === id ? null : id)} label="Modo foco: destaca este ramo (F)">
          <CrosshairIcon />
        </ToolbarButton>
        <AiMenu nodeId={id} label={data.label} description={data.description} />
        <KindPicker nodeId={id} kind={kind} chosen={!!data.kind} />
        {/* Tela larga: estilo e tudo mais ficam no painel lateral. */}
        <span className="lg:hidden">
          <StylePicker nodeId={id} data={data} width={internal?.width} />
        </span>
        <span className="hidden lg:inline-flex">
          <ToolbarButton onClick={map.openPanel} label="Detalhes: vínculo, estilo, conexões e contexto">
            <PanelRightIcon /> Detalhes
          </ToolbarButton>
        </span>
        {(!data.taskId || taskMissing) && <LinkPicker kind="task" nodeId={id} label={data.label} />}
        {!data.leadId && <LinkPicker kind="lead" nodeId={id} label={data.label} />}
        {!data.notes?.length && (
          <ToolbarButton onClick={() => map.setNotesFor(map.notesFor === id ? null : id)} label="Anotar: comentário, observação ou citação de app (fica escondido no balão)">
            <MessageSquarePlusIcon />
          </ToolbarButton>
        )}
        <ToolbarButton onClick={() => map.remove(id)} label="Apagar (Del)">
          <Trash2Icon />
        </ToolbarButton>
      </NodeToolbar>
      <div className="group/node relative" style={{ ...(s !== 1 ? { zoom: s } : {}), ...fixed }}>
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
        {kind === "decisao" && (data.decision?.decidedAt || data.decision?.ownerId) && !editing && (
          <p className="text-[11px] text-muted-foreground">
            Decidido{data.decision.decidedAt ? ` em ${data.decision.decidedAt.slice(8, 10)}/${data.decision.decidedAt.slice(5, 7)}` : ""}
            {data.decision.ownerId ? ` · ${getUser(data.decision.ownerId).name}` : ""}
          </p>
        )}
        {kind === "resumo" && summaryArea && !editing && <p className="text-[11px] text-muted-foreground">Resume: {summaryArea}</p>}
        {!!data.notes?.length && !editing && (
          <span
            className={cn("absolute bottom-1.5 left-2 flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground", notesOpen && "text-brand")}
            title={`${data.notes.length} anotação(ões) — clique no balão para ver`}
          >
            <MessageSquareIcon className="size-3" /> {data.notes.length}
          </span>
        )}
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
      {notesOpen && (
        <NoteBranches notes={data.notes} adding={map.notesFor === id} onChange={(notes) => map.setData(id, { notes })} onDoneAdding={() => map.setNotesFor(null)} />
      )}
      </div>
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

/** "+ Filho" com a direção escolhida por você (→ ↓ ← ↑). Tab usa a última escolhida. */
function ChildButton({ nodeId }: { nodeId: string }) {
  const map = useMap()
  return (
    <span className="flex items-center rounded-md">
      <ToolbarButton onClick={() => map.addChild(nodeId)} label={`Adicionar filho para ${DIR[map.childDir].label.toLowerCase()} (Tab)`}>
        <PlusIcon /> Filho {DIR[map.childDir].arrow}
      </ToolbarButton>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="xs" variant="ghost" className="px-1" title="Escolher para que lado o filho nasce" aria-label="Direção do filho">
            <ChevronDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="grid w-40 grid-cols-2 gap-1 p-1.5" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {DIRS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => map.addChild(nodeId, d.id)}
              className={cn("flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent", map.childDir === d.id && "bg-accent font-medium")}
            >
              <span className="w-4 text-center">{d.arrow}</span> {d.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </span>
  )
}

/**
 * Uma barra só quando há VÁRIOS itens selecionados (balões e/ou linhas): nenhum painel
 * individual abre. Ajustes valem para todos: balões (agrupar, tipo, andamento) e
 * linhas (hierarquia/relação, sentido). Apagar leva tudo que está selecionado.
 */
function MultiToolbar({
  nodeCount,
  decorCount,
  edgeCount,
  sizing,
  onScale,
  onHierarchy,
  onReset,
  onLayer,
  onGroup,
  onKind,
  onStatus,
  onEdges,
  onDelete,
}: {
  nodeCount: number
  /** Textos soltos e desenhos selecionados. */
  decorCount: number
  edgeCount: number
  /** IA pensando nos tamanhos. */
  sizing: boolean
  onScale: (factor: number) => void
  onHierarchy: () => void
  onReset: () => void
  onLayer: (move: LayerMove) => void
  onGroup: () => void
  onKind: (k: NodeKind | undefined) => void
  onStatus: (s: "afazer" | "andamento" | "feito") => void
  onEdges: (patch: LinkData) => void
  onDelete: () => void
}) {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <div className="flex max-w-[calc(100vw-2rem)] animate-enter flex-wrap items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-lift" onDoubleClick={(e) => e.stopPropagation()}>
      <span className="px-2 text-xs font-semibold">
        {[nodeCount && plural(nodeCount, "balão", "balões"), decorCount && plural(decorCount, "texto/desenho", "textos/desenhos"), edgeCount && plural(edgeCount, "linha", "linhas")]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {nodeCount + decorCount > 0 && (
        <span className="flex items-center gap-0.5 border-r pr-1">
          <ToolbarButton onClick={() => onScale(0.8)} label="Diminuir o conjunto (tudo junto, mantendo o desenho)">
            <MinusIcon />
          </ToolbarButton>
          <ZoomInIcon className="size-3.5 text-muted-foreground" aria-hidden />
          <ToolbarButton onClick={() => onScale(1.25)} label="Ampliar o conjunto (tudo junto, mantendo o desenho)">
            <PlusIcon />
          </ToolbarButton>
          {nodeCount >= 2 && (
            <Button size="xs" variant="ghost" disabled={sizing} onClick={onHierarchy} title="IA: organiza o conjunto pela importância — principal maior, detalhes menores, árvore clara da esquerda para a direita">
              {sizing ? <Loader2Icon className="animate-spin" /> : <NetworkIcon />} {sizing ? "Organizando…" : "Organizar"}
              {!sizing && <SparklesIcon className="text-brand" />}
            </Button>
          )}
          <Button size="xs" variant="ghost" className="px-1.5" onClick={onReset} title="Voltar ao tamanho normal (conserta balão distorcido)">
            100%
          </Button>
          <LayerPicker onMove={onLayer} />
        </span>
      )}
      {nodeCount > 0 && (
        <>
          {nodeCount + decorCount >= 2 && (
            <ToolbarButton onClick={onGroup} label="Agrupar os balões numa área">
              <BoxSelectIcon /> Agrupar
            </ToolbarButton>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="xs" variant="ghost" title="Tipo de todos os balões">
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
              <Button size="xs" variant="ghost" title="Andamento de todos os balões">
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
        </>
      )}
      {edgeCount > 0 && (
        <div className={cn("flex items-center gap-0.5", nodeCount > 0 && "ml-0.5 border-l pl-1")}>
          <Button size="xs" variant="ghost" onClick={() => onEdges({ kind: undefined })} title="Todas as linhas como hierarquia (sólida)">
            Hierarquia
          </Button>
          <Button size="xs" variant="ghost" onClick={() => onEdges({ kind: "relacao" })} title="Todas as linhas como relação (tracejada)">
            Relação
          </Button>
          {ARROWS.map((a) => (
            <Button key={a.id} size="xs" variant="ghost" className="px-1.5" onClick={() => onEdges({ arrow: a.id })} title={`Sentido de todas: ${a.hint}`}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
      <ToolbarButton onClick={onDelete} label="Apagar tudo que está selecionado (Del)">
        <Trash2Icon />
      </ToolbarButton>
    </div>
  )
}

/** Camada de vários itens (barra de seleção múltipla). */
function LayerPicker({ onMove }: { onMove: (move: LayerMove) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title="Camada: frente ou fundo do quadro">
          <LayersIcon /> Camada
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="grid w-56 gap-0.5 p-1">
        {LAYER_MOVES.map((m) => (
          <button key={m.id} type="button" onClick={() => onMove(m.id)} className="grid rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
            <span className="font-medium">{m.label}</span>
            <span className="text-[11px] text-muted-foreground">{m.hint}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
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
          <p className="t-label">Ampliação · zoom infinito</p>
          <div className="flex items-center gap-1.5">
            <Chip onClick={() => map.scaleItems([nodeId], 0.8)} title="Diminuir este balão">
              −
            </Chip>
            <span className="tabular w-14 text-center text-xs font-semibold">{Math.round(scaleOf(data) * 1000) / 10}%</span>
            <Chip onClick={() => map.scaleItems([nodeId], 1.25)} title="Ampliar este balão">
              +
            </Chip>
            {scaleOf(data) !== 1 && (
              <Chip onClick={() => map.scaleItems([nodeId], 1 / scaleOf(data))} title="Voltar ao tamanho normal">
                100%
              </Chip>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <p className="t-label">Descrição</p>
          <textarea
            defaultValue={data.description ?? ""}
            {...spellProps}
            onBlur={(e) => map.setData(nodeId, { description: correctText(e.target.value.trim()) || undefined })}
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
      {...spellProps}
      onChange={(e) => setValue(autocorrected(value, e.currentTarget))}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(correctText(value))}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Enter") finish(correctText(value))
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

/** Item com tamanho medido e ampliação: para ampliar conjuntos e tamanhos pela hierarquia. */
function sized(n: IdeaNode): SizedItem {
  const b = box(n)
  return { id: n.id, x: n.position.x, y: n.position.y, w: b.width, h: b.height, scale: n.data.scale, width: n.width, height: n.height }
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
      {selected && !editing && <ScreenResizer minWidth={180} minHeight={120} />}
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

/**
 * Texto solto no fundo do quadro (como no Canva): sem balão, com camada (frente/trás),
 * cor e tamanho. Duplo clique edita; Enter quebra linha; Esc ou clicar fora termina.
 */
function TextNodeView({ id, data, selected }: NodeProps<IdeaNode>) {
  const map = useMap()
  const editing = map.editingId === id
  const s = scaleOf(data)
  const size = data.stroke ?? TEXT_SIZE
  const [text, setText] = useState(data.label)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Item novo fica invisível até o React Flow medi-lo; só então o foco "pega".
  const measured = !!useInternalNode(id)?.measured.width
  useEffect(() => {
    if (editing) setText(data.label)
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editing && measured) ref.current?.focus()
  }, [editing, measured])
  function finish() {
    const v = correctText(text.trim())
    if (!v && !data.label) map.remove(id)
    else if (v) map.setLabel(id, v)
    map.setEditingId(null)
  }
  return (
    <>
      <NodeToolbar isVisible={selected && !editing && !map.multi} position={Position.Top} className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-md">
        <ToolbarButton onClick={() => map.setData(id, { stroke: Math.max(8, Math.round(size / 1.25)) })} label="Letra menor">
          <span className="text-[11px] font-semibold">A−</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => map.setData(id, { stroke: Math.min(160, Math.round(size * 1.25)) })} label="Letra maior">
          <span className="text-sm font-semibold">A+</span>
        </ToolbarButton>
        <InkPicker hue={data.hue} onPick={(hue) => map.setData(id, { hue })} />
        <LayerMenu ids={[id]} />
        <ToolbarButton onClick={() => map.setEditingId(id)} label="Editar texto (duplo clique)">
          <TypeIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => map.remove(id)} label="Apagar (Del)">
          <Trash2Icon />
        </ToolbarButton>
      </NodeToolbar>
      <div
        style={{ ...(s !== 1 ? { zoom: s } : {}), fontSize: size, color: inkColor(data.hue) }}
        className={cn(
          "rounded-md px-1 leading-tight font-semibold whitespace-pre-wrap",
          selected && !editing && "outline-2 outline-brand/50 outline-solid",
          !data.label && !editing && "text-muted-foreground",
        )}
        onDoubleClick={(e) => {
          e.stopPropagation()
          map.setEditingId(id)
        }}
      >
        {editing ? (
          <textarea
            ref={ref}
            value={text}
            rows={1}
            {...spellProps}
            onChange={(e) => setText(autocorrected(text, e.currentTarget))}
            onBlur={finish}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Escape") e.currentTarget.blur()
            }}
            placeholder="Escreva…"
            className="nodrag block field-sizing-content min-w-24 resize-none bg-transparent outline-none placeholder:text-muted-foreground"
            style={{ fontSize: "inherit", color: "inherit", fontWeight: "inherit", lineHeight: "inherit" }}
          />
        ) : (
          data.label || "Texto"
        )}
      </div>
    </>
  )
}

/** Traço feito à mão. Só a linha recebe clique (o fundo em volta é "vazado"). */
function DrawingNodeView({ id, data, selected }: NodeProps<IdeaNode>) {
  const map = useMap()
  const s = scaleOf(data)
  const path = data.path ?? []
  const stroke = data.stroke ?? 4
  const b = pathBox(path, stroke)
  const d = pathD(path)
  return (
    <>
      <NodeToolbar isVisible={selected && !map.multi} position={Position.Top} className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5 shadow-md">
        <InkPicker hue={data.hue} onPick={(hue) => map.setData(id, { hue })} />
        <LayerMenu ids={[id]} />
        <ToolbarButton onClick={() => map.scaleItems([id], 0.8)} label="Diminuir">
          <MinusIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => map.scaleItems([id], 1.25)} label="Aumentar">
          <PlusIcon />
        </ToolbarButton>
        <ToolbarButton onClick={() => map.remove(id)} label="Apagar (Del)">
          <Trash2Icon />
        </ToolbarButton>
      </NodeToolbar>
      <svg width={b.width} height={b.height} style={s !== 1 ? { zoom: s } : undefined} className={cn("block overflow-visible", selected && "drop-shadow-[0_0_3px_var(--brand)]")}>
        <path d={d} fill="none" stroke={inkColor(data.hue)} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        {/* Área de clique mais larga que o traço. */}
        <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, stroke + 10)} strokeLinecap="round" className="drawing-hit" />
      </svg>
    </>
  )
}

/** Cor da tinta (texto e desenho). */
function InkPicker({ hue, onPick }: { hue?: number; onPick: (hue: number | undefined) => void }) {
  return (
    <span className="flex items-center gap-1 px-1">
      {[undefined, ...INK_HUES].map((h) => (
        <button
          key={h ?? "auto"}
          type="button"
          onClick={() => onPick(h)}
          className={cn("size-4 rounded-full border", hue === h && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-background")}
          style={{ background: inkColor(h) }}
          aria-label={h === undefined ? "Cor do texto" : `Cor ${h}`}
        />
      ))}
    </span>
  )
}

/** Camada como no Canva: frente, avançar, recuar, trás. */
function LayerMenu({ ids }: { ids: string[] }) {
  const map = useMap()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="xs" variant="ghost" title="Camada: frente ou fundo do quadro">
          <LayersIcon /> Camada
        </Button>
      </PopoverTrigger>
      <PopoverContent align="center" className="grid w-56 gap-0.5 p-1" onDoubleClick={(e) => e.stopPropagation()}>
        {LAYER_MOVES.map((m) => (
          <button key={m.id} type="button" onClick={() => map.moveLayers(ids, m.id)} className="grid rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
            <span className="font-medium">{m.label}</span>
            <span className="text-[11px] text-muted-foreground">{m.hint}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Ferramentas do quadro: selecionar (V), texto (T) e desenhar (D).
 * Desenhando: cor e espessura da caneta.
 */
function ToolPanel({ tool, setTool, pen, setPen, ai }: { tool: Tool; setTool: (t: Tool) => void; pen: { hue?: number; size: number }; setPen: (p: { hue?: number; size: number }) => void; ai: React.ReactNode }) {
  const tools: { id: Tool; label: string; icon: React.ComponentType<{ className?: string }>; key: string }[] = [
    { id: "selecionar", label: "Selecionar e mover", icon: MousePointer2Icon, key: "V" },
    { id: "texto", label: "Texto no quadro: clique onde quer escrever", icon: TypeIcon, key: "T" },
    { id: "desenhar", label: "Desenhar à mão livre", icon: PencilIcon, key: "D" },
  ]
  return (
    <Panel position="top-left" className="flex items-start gap-2">
      <div className="flex flex-col gap-2">
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-lift">
        {tools.map((t, i) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTool(t.id)}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                className={cn(
                  "flex size-9 items-center justify-center text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
                  i > 0 && "border-t",
                  tool === t.id && "bg-brand/15 text-brand",
                )}
              >
                <t.icon className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t.label} ({t.key})
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {/* IA para pedidos gerais sobre o mapa. */}
      {ai}
      </div>
      {tool === "desenhar" && (
        <div className="flex animate-enter items-center gap-2 rounded-lg border bg-card p-1.5 shadow-lift">
          <InkPicker hue={pen.hue} onPick={(hue) => setPen({ ...pen, hue })} />
          <span className="flex gap-0.5 border-l pl-1.5">
            {PEN_SIZES.map((p) => (
              <Chip key={p.id} active={pen.size === p.id} onClick={() => setPen({ ...pen, size: p.id })}>
                {p.label}
              </Chip>
            ))}
          </span>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">Arraste para desenhar · V volta</span>
        </div>
      )}
      {tool === "texto" && <div className="animate-enter rounded-lg border bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-lift">Clique no quadro onde quer escrever</div>}
    </Panel>
  )
}

/** Grade de pontos do quadro infinito: o espaço se adapta ao zoom e o ponto tem sempre 1px na tela. */
function InfiniteBackground() {
  const zoom = useFlowStore((st) => st.transform[2])
  return <Background gap={gridGap(zoom)} size={1 / zoom} />
}

/**
 * Cantos de redimensionar sempre do mesmo tamanho na tela, em qualquer zoom
 * (os da biblioteca crescem junto quando a tela está muito aproximada).
 */
function ScreenResizer({ minWidth, minHeight }: { minWidth: number; minHeight: number }) {
  const zoom = useFlowStore((st) => st.transform[2])
  const px = (v: number) => v / zoom
  return (
    <NodeResizer
      isVisible
      autoScale={false}
      minWidth={minWidth}
      minHeight={minHeight}
      // Borda nunca fica abaixo de 1px no navegador (vira faixa grossa com zoom alto): linhas invisíveis
      // (o contorno de seleção do balão já mostra), cantos sem borda.
      lineStyle={{ borderColor: "transparent" }}
      handleStyle={{ width: px(9), height: px(9), border: "none", borderRadius: px(2), background: "var(--brand)" }}
    />
  )
}

const NODE_TYPES = { idea: IdeaNodeView, area: AreaNodeView, text: TextNodeView, drawing: DrawingNodeView }

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
function UnlinkEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, style, markerEnd, markerStart, data }: EdgeProps) {
  const { deleteElements, screenToFlowPosition } = useReactFlow()
  const map = useMap()
  // Zoom infinito: linha entre balões pequenos fica fina na mesma proporção (a seta acompanha).
  const sourceScale = (useInternalNode(source)?.data as IdeaData | undefined)?.scale ?? 1
  const targetScale = (useInternalNode(target)?.data as IdeaData | undefined)?.scale ?? 1
  const k = Math.min(sourceScale, targetScale)
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
  const solo = selected && !map.multi
  const below = { transform: `translate(-50%, 14px) translate(${labelX}px, ${labelY}px)`, zIndex: 1001 }
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={24 * k}
        style={{
          ...style,
          stroke: selected ? "var(--brand)" : relation ? "var(--muted-foreground)" : undefined,
          strokeWidth: (selected ? 2.5 : 1.5) * k,
          strokeDasharray: relation ? `${6 * k} ${4 * k}` : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {solo && (
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
        {solo ? (
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
        {...spellProps}
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
      n.scale ?? null,
      n.z ?? null,
      n.stroke ?? null,
      n.path ? n.path.join(",") : null,
      n.notes ? JSON.stringify(n.notes) : null,
    ]),
    edges.map((e) => [e.id, e.source, e.target, e.kind ?? null, e.label ?? null, e.sourceHandle ?? null, e.targetHandle ?? null, e.arrow ?? null, e.bend ? `${e.bend.dx},${e.bend.dy}` : null]),
  ])
}

/**
 * Zoom e enquadrar com o visual do app (os controles padrão da biblioteca ficavam
 * claro-sobre-claro no tema escuro). Nome de cada botão aparece ao passar o mouse.
 */
function MapControls({ onPresent, history }: { onPresent: () => void; history: Pick<ReturnType<typeof useMapHistory>, "undo" | "redo" | "canUndo" | "canRedo"> }) {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow()
  const zoom = useFlowStore((st) => st.transform[2])
  const buttons = [
    { label: "Desfazer (Ctrl+Z)", icon: Undo2Icon, onClick: history.undo, disabled: !history.canUndo },
    { label: "Refazer (Ctrl+Shift+Z)", icon: Redo2Icon, onClick: history.redo, disabled: !history.canRedo },
    { label: "Aproximar", icon: PlusIcon, onClick: () => zoomIn({ duration: 200 }) },
    { label: "Afastar", icon: MinusIcon, onClick: () => zoomOut({ duration: 200 }) },
    { label: "Enquadrar tudo", icon: MaximizeIcon, onClick: () => fitView({ padding: 0.3, maxZoom: 1, duration: 300 }) },
    { label: "Apresentar (← → para navegar)", icon: PresentationIcon, onClick: onPresent },
  ]
  return (
    <Panel position="bottom-right" className="!mb-16 flex flex-col overflow-hidden rounded-lg border bg-card shadow-lift">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => zoomTo(1, { duration: 300 })} className="tabular h-7 border-b px-1 text-[10px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground">
            {zoomLabel(zoom)}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">Zoom atual · clique volta para 100%</TooltipContent>
      </Tooltip>
      {buttons.map((b, i) => (
        <Tooltip key={b.label}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={b.onClick}
              aria-label={b.label}
              disabled={"disabled" in b && b.disabled}
              className={cn(
                "flex size-9 items-center justify-center text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
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

/** "100%", "2.500%", "0,4%" — zoom infinito em número legível. */
function zoomLabel(zoom: number) {
  const pct = zoom * 100
  return `${pct >= 10 ? Math.round(pct).toLocaleString("pt-BR") : pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
}
