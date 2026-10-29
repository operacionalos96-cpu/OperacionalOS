"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  reconnectEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useStore as useFlowStore,
  type Connection,
  type Edge,
  type FinalConnectionState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { toast } from "sonner"
import {
  ArrowUpRightIcon,
  CircleIcon,
  CopyIcon,
  DiamondIcon,
  FrameIcon,
  HandIcon,
  HelpCircleIcon,
  ImageIcon,
  LayersIcon,
  LinkIcon,
  MapIcon,
  MaximizeIcon,
  MinusIcon,
  MousePointer2Icon,
  PencilIcon,
  PlusIcon,
  Redo2Icon,
  ScanSearchIcon,
  SearchIcon,
  SquareIcon,
  StickyNoteIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  CheckSquareIcon,
  type LucideIcon,
} from "lucide-react"
import type { MindMap, MindMapNode } from "@/lib/domain/types"
import {
  BOARD_HUES,
  ELEMENT_SIZE,
  FONT_SIZES,
  HUE_NAMES,
  ROUTES,
  boardColor,
  linksOf,
  pickSides,
  searchBoard,
  type Side,
} from "@/lib/domain/board"
import { DRAW_LIMITS, LAYER_MOVES, ZOOM_LIMITS, drawingFromStroke, moveLayer } from "@/lib/domain/canvas"
import { areaAround, membersOf } from "@/lib/domain/mindmap"
import { processImage } from "@/lib/board-image"
import { uid } from "@/lib/format"
import { openTaskForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EntityChip, EntityPicker } from "@/components/entities/entity-bits"
import {
  InfiniteBackground,
  STORED_TYPE,
  toFlow,
  toMapEdge,
  toMapNode,
  useMapHistory,
  useMapSync,
  type IdeaData,
  type IdeaNode,
  type LinkData,
} from "@/components/mindmap/mind-map-editor"
import { BOARD_EDGE_TYPES, BOARD_NODE_TYPES, BoardCtx, type BoardActions } from "./board-nodes"

type Tool = "select" | "hand" | "pen" | "text" | "rect" | "ellipse" | "diamond" | "sticky" | "frame" | "arrow" | "image"

const TOOLS: { id: Tool; label: string; key: string; icon: LucideIcon; group: 0 | 1 | 2 }[] = [
  { id: "select", label: "Selecionar", key: "V", icon: MousePointer2Icon, group: 0 },
  { id: "hand", label: "Mover a tela", key: "H", icon: HandIcon, group: 0 },
  { id: "pen", label: "Desenhar", key: "P", icon: PencilIcon, group: 1 },
  { id: "text", label: "Texto", key: "T", icon: TypeIcon, group: 1 },
  { id: "sticky", label: "Nota", key: "N", icon: StickyNoteIcon, group: 1 },
  { id: "rect", label: "Retângulo", key: "R", icon: SquareIcon, group: 1 },
  { id: "ellipse", label: "Elipse", key: "O", icon: CircleIcon, group: 1 },
  { id: "diamond", label: "Losango (decisão)", key: "D", icon: DiamondIcon, group: 1 },
  { id: "arrow", label: "Seta: arraste de um elemento a outro", key: "A", icon: ArrowUpRightIcon, group: 2 },
  { id: "frame", label: "Moldura: agrupa e nomeia uma área", key: "F", icon: FrameIcon, group: 2 },
  { id: "image", label: "Imagem", key: "I", icon: ImageIcon, group: 2 },
]

const KEY_TOOL: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.key.toLowerCase(), t.id]))
const PLACE_TOOLS: Tool[] = ["text", "rect", "ellipse", "diamond", "sticky", "frame"]

const HINTS: Record<Tool, string> = {
  select: "Duplo clique escreve · arraste de um ponto do elemento para ligar · Espaço move a tela",
  hand: "Arraste para mover a tela · V volta a selecionar",
  pen: "Arraste para desenhar · V volta a selecionar",
  text: "Clique onde quer escrever",
  rect: "Clique ou arraste para criar",
  ellipse: "Clique ou arraste para criar",
  diamond: "Clique ou arraste para criar uma decisão",
  sticky: "Clique para soltar uma nota",
  frame: "Arraste para marcar a área da moldura",
  arrow: "Arraste de um elemento até outro (ou até o vazio para criar um novo)",
  image: "",
}

const PEN_SIZES = [
  { id: 3, label: "Fino" },
  { id: 5, label: "Médio" },
  { id: 9, label: "Grosso" },
]

const PAD = 0.2
const sideOpposite: Record<Side, Side> = { l: "r", r: "l", t: "b", b: "t" }

export function WhiteboardEditor({ map }: { map: MindMap }) {
  return (
    <ReactFlowProvider>
      <Board map={map} />
    </ReactFlowProvider>
  )
}

const boxOf = (n: IdeaNode) => ({ id: n.id, x: n.position.x, y: n.position.y, width: n.measured?.width ?? n.width ?? 120, height: n.measured?.height ?? n.height ?? 40 })

function Board({ map }: { map: MindMap }) {
  const initial = useMemo(() => toFlow(map), [map.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [nodes, setNodes, onNodesChange] = useNodesState<IdeaNode>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tool, setToolState] = useState<Tool>("select")
  const [pen, setPen] = useState<{ hue?: number; size: number }>({ size: 5 })
  const [minimap, setMinimap] = useState(true)
  const { screenToFlowPosition, getZoom, fitView, zoomIn, zoomOut, zoomTo, getNodes } = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const remoteApplied = useRef(false)
  useMapSync(map, nodes, edges, setNodes, setEdges, remoteApplied)
  const history = useMapHistory(nodes, edges, setNodes, setEdges, remoteApplied)

  const setTool = useCallback((t: Tool) => {
    if (t === "image") {
      fileRef.current?.click()
      return
    }
    setToolState(t)
  }, [])

  // ---------- criar elementos ----------

  const topZ = useRef(0)
  topZ.current = Math.max(topZ.current, ...nodes.map((n) => n.data.z ?? 0))
  const nextZ = () => ++topZ.current

  const addNodes = useCallback(
    (list: IdeaNode[], extraEdges: Edge[] = []) => {
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...list.map((n) => ({ ...n, selected: true }))])
      if (extraEdges.length) setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), ...extraEdges])
    },
    [setNodes, setEdges],
  )

  /** Elemento novo do tipo da ferramenta. `rect`: área escolhida; sem ela, nasce no tamanho padrão, centrado em `at`. */
  const makeNode = useCallback(
    (kind: Tool, at: { x: number; y: number }, rect?: { x: number; y: number; width: number; height: number }): IdeaNode => {
      const id = uid()
      const shape = kind === "rect" || kind === "ellipse" || kind === "diamond" ? kind : undefined
      const size = kind === "text" ? undefined : kind === "frame" ? ELEMENT_SIZE.frame : kind === "sticky" ? ELEMENT_SIZE.sticky : ELEMENT_SIZE[shape ?? "rect"]
      const w = rect?.width ?? size?.width
      const h = rect?.height ?? size?.height
      const position = rect ? { x: rect.x, y: rect.y } : { x: at.x - (w ?? 0) / 2, y: at.y - (h ?? 24) / 2 }
      if (kind === "frame") return { id, type: "area", zIndex: -2, position, width: w, height: h, data: { label: "Moldura", z: -2 } }
      if (kind === "text") return { id, type: "text", zIndex: nextZ(), position, data: { label: "", z: topZ.current } }
      const z = nextZ()
      if (kind === "sticky") return { id, type: "sticky", zIndex: z, position, width: w, height: h, data: { label: "", hue: 75, z } }
      return { id, type: "shape", zIndex: z, position, width: w, height: h, data: { label: "", shape, fill: "soft", z } }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const place = useCallback(
    (kind: Tool, at: { x: number; y: number }, rect?: { x: number; y: number; width: number; height: number }) => {
      const node = makeNode(kind, at, rect)
      addNodes([node])
      setEditingId(node.id)
      setToolState("select")
    },
    [makeNode, addNodes],
  )

  const addImage = useCallback(
    async (file: Blob, at?: { x: number; y: number }) => {
      const t = toast.loading("Preparando a imagem…")
      const img = await processImage(file)
      toast.dismiss(t)
      if (!img) {
        toast.error("Imagem pesada demais para a lousa", { description: "Use uma imagem menor ou com menos detalhes. Arquivos grandes entram na próxima etapa (Storage)." })
        return
      }
      const r = wrapRef.current!.getBoundingClientRect()
      const center = at ?? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
      const z = nextZ()
      addNodes([{ id: uid(), type: "image", zIndex: z, position: { x: center.x - img.width / 2, y: center.y - img.height / 2 }, width: img.width, height: img.height, data: { label: "", src: img.src, z } }])
      setToolState("select")
    },
    [screenToFlowPosition, addNodes], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // ---------- ações dos elementos ----------

  const actions: BoardActions = useMemo(
    () => ({
      editingId,
      setEditingId,
      setLabel: (id, label) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n))),
      remove: (id) => {
        setNodes((ns) => ns.filter((n) => n.id !== id))
        setEdges((es) => es.filter((e) => e.source !== id && e.target !== id))
      },
      arrowTool: tool === "arrow",
    }),
    [editingId, tool, setNodes, setEdges],
  )

  const patchNodes = useCallback((ids: Set<string>, patch: Partial<IdeaData>) => setNodes((ns) => ns.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, ...patch } } : n))), [setNodes])
  const patchEdges = useCallback((ids: Set<string>, patch: Partial<LinkData>) => setEdges((es) => es.map((e) => (ids.has(e.id) ? { ...e, data: { ...(e.data as LinkData | undefined), ...patch } } : e))), [setEdges])

  const selectedNodes = nodes.filter((n) => n.selected)
  const selectedEdges = edges.filter((e) => e.selected)

  function deleteSelected() {
    const ids = new Set(selectedNodes.map((n) => n.id))
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
    setEdges((es) => es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)))
  }

  // Copiar / colar / duplicar (dentro da lousa) e colar imagem ou texto de fora.
  const clip = useRef<{ nodes: IdeaNode[]; edges: Edge[] } | null>(null)
  const pasteCount = useRef(0)
  const copySelected = useCallback(() => {
    const sel = nodes.filter((n) => n.selected)
    if (!sel.length) return false
    const ids = new Set(sel.map((n) => n.id))
    clip.current = { nodes: sel, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) }
    pasteCount.current = 0
    return true
  }, [nodes, edges])
  const pasteClip = useCallback(() => {
    const c = clip.current
    if (!c) return
    const off = 36 * ++pasteCount.current
    const idMap = new Map(c.nodes.map((n) => [n.id, uid()]))
    const fresh = c.nodes.map((n) => {
      const z = n.type === "area" ? n.data.z : nextZ()
      return { ...n, id: idMap.get(n.id)!, position: { x: n.position.x + off, y: n.position.y + off }, selected: true, ...(z !== undefined ? { zIndex: z, data: { ...n.data, z } } : {}) }
    })
    addNodes(fresh, c.edges.map((e) => ({ ...e, id: uid(), source: idMap.get(e.source)!, target: idMap.get(e.target)!, selected: false })))
  }, [addNodes]) // eslint-disable-line react-hooks/exhaustive-deps
  const duplicate = () => {
    if (copySelected()) pasteClip()
  }

  useEffect(() => {
    const inField = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    }
    const onCopy = (e: ClipboardEvent) => {
      if (inField(e.target) || editingId) return
      if (copySelected()) {
        e.clipboardData?.setData("text/plain", "operacionalos-board")
        e.preventDefault()
        toast("Copiado", { duration: 1200 })
      }
    }
    const onCut = (e: ClipboardEvent) => {
      if (inField(e.target) || editingId) return
      if (copySelected()) {
        e.clipboardData?.setData("text/plain", "operacionalos-board")
        e.preventDefault()
        deleteSelected()
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target) || editingId) return
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"))
      const text = e.clipboardData?.getData("text/plain") ?? ""
      if (file) {
        e.preventDefault()
        void addImage(file)
      } else if (text === "operacionalos-board") {
        e.preventDefault()
        pasteClip()
      } else if (text.trim()) {
        e.preventDefault()
        const r = wrapRef.current!.getBoundingClientRect()
        const at = screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
        const node = { ...makeNode("text", at), data: { label: text.trim().slice(0, 2000), z: topZ.current } }
        addNodes([node])
      }
    }
    window.addEventListener("copy", onCopy)
    window.addEventListener("cut", onCut)
    window.addEventListener("paste", onPaste)
    return () => {
      window.removeEventListener("copy", onCopy)
      window.removeEventListener("cut", onCut)
      window.removeEventListener("paste", onPaste)
    }
  }) // sem dependências: sempre com os selecionados de agora

  // ---------- atalhos ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingId) return
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      if (t !== document.body && !wrapRef.current?.contains(t)) return
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (mod && (k === "z" || k === "y")) {
        e.preventDefault()
        if (k === "y" || e.shiftKey) history.redo()
        else history.undo()
      } else if (mod && k === "d") {
        e.preventDefault()
        duplicate()
      } else if (mod && k === "a") {
        e.preventDefault()
        setNodes((ns) => ns.map((n) => ({ ...n, selected: true })))
      } else if (mod || e.altKey) {
        return
      } else if (e.key === "Escape") {
        setToolState("select")
        setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)))
        setEdges((es) => es.map((x) => (x.selected ? { ...x, selected: false } : x)))
      } else if (e.shiftKey && e.key === "!") fitView({ padding: PAD, maxZoom: 1, duration: 350 })
      else if (e.shiftKey && e.key === "@") zoomToSelection()
      else if ((e.key === "Enter" || e.key === "F2") && selectedNodes.length === 1 && selectedNodes[0].type !== "drawing") {
        e.preventDefault()
        setEditingId(selectedNodes[0].id)
      } else if (KEY_TOOL[k] && !e.shiftKey) {
        e.preventDefault()
        setTool(KEY_TOOL[k])
      } else if (e.key.startsWith("Arrow") && selectedNodes.length) {
        e.preventDefault()
        const step = e.shiftKey ? 40 : 8
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!
        const ids = new Set(selectedNodes.map((n) => n.id))
        setNodes((ns) => ns.map((n) => (ids.has(n.id) ? { ...n, position: { x: n.position.x + d[0], y: n.position.y + d[1] } } : n)))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  // ---------- navegação ----------

  const zoomToSelection = useCallback(() => {
    const sel = getNodes().filter((n) => n.selected)
    if (sel.length) fitView({ nodes: sel.map((n) => ({ id: n.id })), padding: 0.5, maxZoom: 1.5, duration: 400 })
    else fitView({ padding: PAD, maxZoom: 1, duration: 350 })
  }, [getNodes, fitView])

  const goTo = useCallback(
    (id: string) => {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })))
      fitView({ nodes: [{ id }], padding: 0.6, maxZoom: 1.2, duration: 450 })
    },
    [fitView, setNodes],
  )

  // ---------- ligações ----------

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, id: uid(), data: { arrow: "fim" } }, es.map((e) => ({ ...e, selected: false })))), [setEdges])
  const onReconnect = useCallback((old: Edge, c: Connection) => setEdges((es) => reconnectEdge(old, c, es, { shouldReplaceId: false })), [setEdges])

  /** Soltou a seta no vazio: nasce um elemento ali, já ligado. */
  const onConnectEnd = useCallback(
    (ev: MouseEvent | TouchEvent, st: FinalConnectionState) => {
      if (st.isValid || !st.fromNode) return
      const pt = "changedTouches" in ev ? ev.changedTouches[0] : ev
      const p = screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
      const from = (st.fromHandle?.id as Side | undefined) ?? "r"
      const { width: w, height: h } = ELEMENT_SIZE.rect
      const pos = from === "r" ? { x: p.x, y: p.y - h / 2 } : from === "l" ? { x: p.x - w, y: p.y - h / 2 } : from === "b" ? { x: p.x - w / 2, y: p.y } : { x: p.x - w / 2, y: p.y - h }
      const node = makeNode("rect", p, { ...pos, width: w, height: h })
      addNodes([node], [{ id: uid(), source: st.fromNode.id, target: node.id, sourceHandle: from, targetHandle: sideOpposite[from], data: { arrow: "fim" } }])
      setEditingId(node.id)
    },
    [screenToFlowPosition, makeNode, addNodes],
  )

  // ---------- ferramentas com ponteiro: colocar, desenhar, ligar ----------

  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [stroke, setStroke] = useState<{ x: number; y: number }[] | null>(null)
  const [wire, setWire] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  function onPointerDownCapture(e: React.PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest(".board-ui, .react-flow__panel, .react-flow__minimap, input, textarea")) return
    const wrap = wrapRef.current!.getBoundingClientRect()
    const rel = (ev: { clientX: number; clientY: number }) => ({ x: ev.clientX - wrap.left, y: ev.clientY - wrap.top })
    const flowAt = (ev: { clientX: number; clientY: number }) => screenToFlowPosition({ x: ev.clientX, y: ev.clientY })

    if (tool === "pen") {
      e.preventDefault()
      e.stopPropagation()
      const screen = [rel(e)]
      const flow = [flowAt(e)]
      setStroke(screen)
      const move = (ev: PointerEvent) => {
        if (flow.length > DRAW_LIMITS.points * 4) return
        screen.push(rel(ev))
        flow.push(flowAt(ev))
        setStroke([...screen])
      }
      const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        setStroke(null)
        const d = drawingFromStroke(flow, getZoom(), pen.size)
        if (!d) return
        const z = nextZ()
        setNodes((ns) => [...ns, { id: uid(), type: "drawing", zIndex: z, position: { x: d.x, y: d.y }, data: { label: "", path: d.path, stroke: d.stroke, scale: d.scale, hue: pen.hue, z } }])
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      return
    }

    if (PLACE_TOOLS.includes(tool)) {
      e.preventDefault()
      e.stopPropagation()
      const start = { s: rel(e), f: flowAt(e) }
      let moved = false
      const move = (ev: PointerEvent) => {
        const c = rel(ev)
        if (Math.hypot(c.x - start.s.x, c.y - start.s.y) > 6) moved = true
        if (moved && tool !== "text" && tool !== "sticky") setGhost({ x: Math.min(start.s.x, c.x), y: Math.min(start.s.y, c.y), w: Math.abs(c.x - start.s.x), h: Math.abs(c.y - start.s.y) })
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        setGhost(null)
        const end = flowAt(ev)
        const big = moved && tool !== "text" && tool !== "sticky" && Math.abs(end.x - start.f.x) > 30 && Math.abs(end.y - start.f.y) > 24
        place(tool, start.f, big ? { x: Math.min(start.f.x, end.x), y: Math.min(start.f.y, end.y), width: Math.abs(end.x - start.f.x), height: Math.abs(end.y - start.f.y) } : undefined)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      return
    }

    if (tool === "arrow") {
      e.preventDefault()
      e.stopPropagation()
      const el = target.closest<HTMLElement>(".react-flow__node")
      const fromId = el?.dataset.id
      const from = fromId ? nodes.find((n) => n.id === fromId) : undefined
      if (!from || from.type === "drawing") {
        toast("Comece a seta em um elemento", { description: "Arraste de uma forma, nota, texto ou imagem até outro.", duration: 2500 })
        return
      }
      const b = el!.getBoundingClientRect()
      const o = { x: b.left + b.width / 2 - wrap.left, y: b.top + b.height / 2 - wrap.top }
      setWire({ x1: o.x, y1: o.y, x2: rel(e).x, y2: rel(e).y })
      const move = (ev: PointerEvent) => setWire({ x1: o.x, y1: o.y, x2: rel(ev).x, y2: rel(ev).y })
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        setWire(null)
        const hit = document
          .elementsFromPoint(ev.clientX, ev.clientY)
          .map((x) => (x as HTMLElement).closest?.<HTMLElement>(".react-flow__node"))
          .find((x) => x && x.dataset.id !== from.id && !x.classList.contains("react-flow__node-area") && !x.classList.contains("react-flow__node-drawing"))
        const targetNode = hit ? nodes.find((n) => n.id === hit.dataset.id) : undefined
        if (targetNode) {
          const s = pickSides(boxOf(from), boxOf(targetNode))
          setEdges((es) => [...es.map((x) => ({ ...x, selected: false })), { id: uid(), source: from.id, target: targetNode.id, sourceHandle: s.source, targetHandle: s.target, data: { arrow: "fim" }, selected: true }])
        } else if (Math.hypot(ev.clientX - (o.x + wrap.left), ev.clientY - (o.y + wrap.top)) > 60) {
          // Soltou no vazio: cria o elemento de destino ali.
          const p = flowAt(ev)
          const fb = boxOf(from)
          const s = pickSides(fb, { x: p.x - 10, y: p.y - 10, width: 20, height: 20 })
          const { width: w, height: h } = ELEMENT_SIZE.rect
          const pos = s.target === "l" ? { x: p.x, y: p.y - h / 2 } : s.target === "r" ? { x: p.x - w, y: p.y - h / 2 } : s.target === "t" ? { x: p.x - w / 2, y: p.y } : { x: p.x - w / 2, y: p.y - h }
          const node = makeNode("rect", p, { ...pos, width: w, height: h })
          addNodes([node], [{ id: uid(), source: from.id, target: node.id, sourceHandle: s.source, targetHandle: s.target, data: { arrow: "fim" } }])
          setEditingId(node.id)
        }
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    }
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (tool !== "select" || !(e.target as HTMLElement).classList.contains("react-flow__pane")) return
    place("text", screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  function onDrop(e: React.DragEvent) {
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"))
    if (!file) return
    e.preventDefault()
    void addImage(file, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }

  // Moldura: ao arrastar, o que está dentro dela vai junto.
  const frameDrag = useRef<{ id: string; start: { x: number; y: number }; members: Map<string, { x: number; y: number }> } | null>(null)
  const onNodeDragStart = useCallback(
    (_: unknown, node: IdeaNode) => {
      if (node.type !== "area") return
      const boxes = nodes.filter((n) => !n.selected || n.id === node.id).map(boxOf)
      const ids = new Set(membersOf(boxOf(node), boxes))
      frameDrag.current = { id: node.id, start: { ...node.position }, members: new Map(nodes.filter((n) => ids.has(n.id)).map((n) => [n.id, { ...n.position }])) }
    },
    [nodes],
  )
  const onNodeDrag = useCallback(
    (_: unknown, node: IdeaNode) => {
      const d = frameDrag.current
      if (!d || d.id !== node.id || !d.members.size) return
      const dx = node.position.x - d.start.x
      const dy = node.position.y - d.start.y
      setNodes((ns) => ns.map((n) => (d.members.has(n.id) ? { ...n, position: { x: d.members.get(n.id)!.x + dx, y: d.members.get(n.id)!.y + dy } } : n)))
    },
    [setNodes],
  )
  const onNodeDragStop = useCallback(() => {
    frameDrag.current = null
  }, [])

  function groupSelected() {
    const items = selectedNodes.filter((n) => n.type !== "area")
    if (items.length < 2) return
    const a = areaAround(items.map(boxOf))
    const id = uid()
    setNodes((ns) => [{ id, type: "area", zIndex: -2, position: { x: a.x, y: a.y }, width: a.width, height: a.height, data: { label: "Grupo", z: -2 }, selected: true }, ...ns.map((n) => ({ ...n, selected: false }))])
    setEditingId(id)
  }

  function moveLayers(move: (typeof LAYER_MOVES)[number]["id"]) {
    const ids = new Set(selectedNodes.map((n) => n.id))
    const next = moveLayer(nodes.map((n) => ({ id: n.id, z: n.data.z, type: STORED_TYPE[n.type ?? "idea"] })), ids, move)
    setNodes((ns) => ns.map((n) => (next.has(n.id) ? { ...n, zIndex: next.get(n.id), data: { ...n.data, z: next.get(n.id) } } : n)))
  }

  function newTaskFor(n: IdeaNode) {
    openTaskForm({ prefill: { title: n.data.label || "Nova tarefa" }, onCreated: (task) => setNodes((ns) => ns.map((x) => (x.id === n.id ? { ...x, data: { ...x.data, taskId: task.id } } : x))) })
  }

  /** Vincula qualquer entidade do OS ao elemento (tarefa e lead têm campo próprio; o resto vai em `ref`). */
  function linkTo(n: IdeaNode, ref: { type: string; id: string }) {
    if (ref.type === "task") patchNodes(new Set([n.id]), { taskId: ref.id })
    else if (ref.type === "lead") patchNodes(new Set([n.id]), { leadId: ref.id })
    else if (["product", "content", "note", "transaction", "map", "goal"].includes(ref.type)) patchNodes(new Set([n.id]), { ref: ref as MindMapNode["ref"] })
    else return toast("Esse tipo ainda não pode ser vinculado aqui")
    toast.success("Vínculo criado", { duration: 1500 })
  }

  // ---------- o que o React Flow mostra ----------

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const drawing = n.type === "drawing"
        const cls = cn(drawing && "map-drawing", n.type === "area" && "board-frame-node") || undefined
        return cls === n.className ? n : { ...n, className: cls }
      }),
    [nodes],
  )
  const displayEdges = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return edges.map((e) => {
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      const s = a && b ? pickSides(boxOf(a), boxOf(b)) : undefined
      return { ...e, type: "board", sourceHandle: e.sourceHandle ?? s?.source, targetHandle: e.targetHandle ?? s?.target }
    })
  }, [nodes, edges])

  const empty = nodes.length === 0
  const drawing = tool === "pen"
  const placing = PLACE_TOOLS.includes(tool)
  const modal = drawing || placing || tool === "arrow" || tool === "hand"
  const single = selectedNodes.length === 1 && !selectedEdges.length ? selectedNodes[0] : null

  return (
    <BoardCtx.Provider value={actions}>
      <div
        ref={wrapRef}
        className={cn(
          "relative h-full w-full overflow-hidden",
          (drawing || placing || tool === "arrow") && "[&_.react-flow__pane]:!cursor-crosshair [&_.react-flow__node]:!cursor-crosshair",
          tool === "text" && "[&_.react-flow__pane]:!cursor-text [&_.react-flow__node]:!cursor-text",
          tool === "hand" && "[&_.react-flow__pane]:!cursor-grab [&_.react-flow__node]:!cursor-grab",
          tool === "arrow" && "board-arrow-tool",
        )}
        onPointerDownCapture={onPointerDownCapture}
        onDoubleClick={onDoubleClick}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={BOARD_NODE_TYPES}
          edgeTypes={BOARD_EDGE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          onReconnect={onReconnect}
          edgesReconnectable
          connectionMode={ConnectionMode.Loose}
          connectionRadius={36}
          connectionLineStyle={{ stroke: "var(--brand)", strokeWidth: 3 }}
          selectionOnDrag={tool === "select"}
          selectionMode={SelectionMode.Partial}
          panOnDrag={tool === "hand" ? true : [1, 2]}
          panActivationKeyCode="Space"
          nodesDraggable={tool === "select"}
          nodesConnectable={tool === "select"}
          // Sempre selecionável: sem isso o React Flow desliga o ponteiro dos elementos e a ferramenta Seta não os "enxerga".
          elementsSelectable
          onPaneContextMenu={(e) => e.preventDefault()}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          elevateNodesOnSelect={false}
          zoomOnDoubleClick={false}
          autoPanOnNodeFocus={false}
          deleteKeyCode={editingId ? null : ["Delete", "Backspace"]}
          multiSelectionKeyCode={["Shift", "Meta", "Control"]}
          // Lousa vazia: sem enquadrar automático (senão a tela pula quando o 1º elemento nasce).
          fitView={initial.nodes.length > 0}
          fitViewOptions={{ padding: PAD, maxZoom: 1 }}
          minZoom={ZOOM_LIMITS.min * 10}
          maxZoom={8}
          proOptions={{ hideAttribution: true }}
        >
          <InfiniteBackground />
          {minimap && (
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              className="board-ui !m-3 !h-36 !w-52 overflow-hidden !rounded-xl !border-2 !border-border !bg-card"
              nodeStrokeWidth={3}
              nodeBorderRadius={4}
              maskColor="color-mix(in oklab, var(--foreground) 14%, transparent)"
              nodeColor={(n) => {
                const d = n.data as IdeaData
                return n.type === "area" ? "transparent" : d.hue === undefined ? "oklch(0.6 0 0)" : `oklch(0.66 0.17 ${d.hue})`
              }}
              nodeStrokeColor={(n) => ((n.data as IdeaData).hue === undefined ? "oklch(0.45 0 0)" : `oklch(0.5 0.17 ${(n.data as IdeaData).hue})`)}
            />
          )}
        </ReactFlow>

        {/* Pré-visualizações dos gestos */}
        {ghost && <div className="pointer-events-none absolute z-10 rounded-lg border-2 border-dashed border-brand bg-brand/10" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} />}
        {stroke && stroke.length > 1 && (
          <svg className="pointer-events-none absolute inset-0 z-10 size-full">
            <polyline points={stroke.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={boardColor(pen.hue, "ink")} strokeWidth={pen.size} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {wire && (
          <svg className="pointer-events-none absolute inset-0 z-10 size-full">
            <line x1={wire.x1} y1={wire.y1} x2={wire.x2} y2={wire.y2} stroke="var(--brand)" strokeWidth={3.5} strokeLinecap="round" strokeDasharray="2 8" />
            <circle cx={wire.x2} cy={wire.y2} r={7} fill="var(--brand)" />
          </svg>
        )}

        {empty && !modal && <EmptyHint />}

        <Toolbox tool={tool} setTool={setTool} />
        <FormatBar
          tool={tool}
          pen={pen}
          setPen={setPen}
          nodes={selectedNodes}
          edges={selectedEdges}
          single={single}
          patchNodes={patchNodes}
          patchEdges={patchEdges}
          onLayer={moveLayers}
          onDuplicate={duplicate}
          onDelete={deleteSelected}
          onGroup={groupSelected}
          onNewTask={newTaskFor}
          onLink={linkTo}
        />
        <TopRight nodes={nodes} onGoTo={goTo} minimap={minimap} setMinimap={setMinimap} />
        <Navigator history={history} onFit={() => fitView({ padding: PAD, maxZoom: 1, duration: 350 })} onSelection={zoomToSelection} zoomIn={() => zoomIn({ duration: 200 })} zoomOut={() => zoomOut({ duration: 200 })} zoomTo={() => zoomTo(1, { duration: 250 })} hasSelection={selectedNodes.length > 0} />

        <div className="board-ui pointer-events-none absolute bottom-4 left-1/2 hidden max-w-[calc(100%-40rem)] -translate-x-1/2 truncate rounded-full border bg-card/95 px-4 py-1.5 text-[13px] text-muted-foreground shadow-md backdrop-blur xl:block">{HINTS[tool] || HINTS.select}</div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (f) void addImage(f)
          }}
        />
      </div>
    </BoardCtx.Provider>
  )
}

// ---------- caixa de ferramentas ----------

function Toolbox({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
  return (
    <div className="board-ui pointer-events-auto absolute top-3 left-3 z-20 flex flex-col rounded-xl border-2 bg-card p-1 shadow-lift" role="toolbar" aria-label="Ferramentas da lousa" aria-orientation="vertical">
      {TOOLS.map((t, i) => (
        <div key={t.id} className={cn(i > 0 && TOOLS[i - 1].group !== t.group && "mt-1 border-t pt-1")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTool(t.id)}
                aria-label={`${t.label} (${t.key})`}
                aria-pressed={tool === t.id}
                className={cn("relative flex size-11 items-center justify-center rounded-lg text-foreground/85 transition-colors hover:bg-accent hover:text-foreground", tool === t.id && "bg-brand text-brand-foreground hover:bg-brand hover:text-brand-foreground")}
              >
                <t.icon className="size-5" />
                <span className={cn("absolute right-1 bottom-0.5 text-[10px] leading-none font-semibold opacity-60", tool === t.id && "opacity-90")}>{t.key}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t.label} <kbd className="ml-1 rounded border px-1 text-[11px]">{t.key}</kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      ))}
    </div>
  )
}

// ---------- barra de formatação (contextual) ----------

type Api = {
  tool: Tool
  pen: { hue?: number; size: number }
  setPen: (p: { hue?: number; size: number }) => void
  nodes: IdeaNode[]
  edges: Edge[]
  single: IdeaNode | null
  patchNodes: (ids: Set<string>, patch: Partial<IdeaData>) => void
  patchEdges: (ids: Set<string>, patch: Partial<LinkData>) => void
  onLayer: (m: (typeof LAYER_MOVES)[number]["id"]) => void
  onDuplicate: () => void
  onDelete: () => void
  onGroup: () => void
  onNewTask: (n: IdeaNode) => void
  onLink: (n: IdeaNode, ref: { type: string; id: string }) => void
}

function Swatches({ hue, onPick, label = "Cor" }: { hue?: number; onPick: (h: number | undefined) => void; label?: string }) {
  return (
    <span className="flex items-center gap-1.5 px-1" role="group" aria-label={label}>
      {[undefined, ...BOARD_HUES].map((h) => (
        <button
          key={h ?? "n"}
          type="button"
          onClick={() => onPick(h)}
          aria-label={h === undefined ? "Neutro" : HUE_NAMES[h]}
          title={h === undefined ? "Neutro" : HUE_NAMES[h]}
          aria-pressed={hue === h}
          className={cn("size-6 rounded-full border-2 transition-transform hover:scale-110", hue === h ? "scale-110 border-foreground ring-2 ring-brand ring-offset-2 ring-offset-card" : "border-foreground/30")}
          style={{ background: h === undefined ? "var(--foreground)" : boardColor(h, "stroke") }}
        />
      ))}
    </span>
  )
}

function Seg<T extends string | number>({ value, options, onPick, label }: { value: T | undefined; options: { id: T; label: React.ReactNode; title?: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <span className="flex rounded-lg border-2 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" title={o.title} aria-pressed={value === o.id} onClick={() => onPick(o.id)} className={cn("h-8 min-w-8 rounded-md px-2 text-[13px] font-semibold transition-colors hover:bg-accent", value === o.id && "bg-brand text-brand-foreground hover:bg-brand")}>
          {o.label}
        </button>
      ))}
    </span>
  )
}

function Sep() {
  return <span className="mx-1 h-7 w-px bg-border" aria-hidden />
}

function IconBtn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} aria-label={label} className={cn("flex size-9 items-center justify-center rounded-lg transition-colors hover:bg-accent", danger && "hover:text-danger")}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function FormatBar(a: Api) {
  const { tool, nodes, edges, single } = a
  const sel = new Set(nodes.map((n) => n.id))
  const hasTextual = nodes.some((n) => n.type === "shape" || n.type === "sticky" || n.type === "text")
  const shapes = nodes.filter((n) => n.type === "shape")
  const only = (t: IdeaNode["type"]) => nodes.length > 0 && nodes.every((n) => n.type === t)

  let body: React.ReactNode = null

  if (tool === "pen") {
    body = (
      <>
        <Swatches hue={a.pen.hue} onPick={(hue) => a.setPen({ ...a.pen, hue })} label="Cor da caneta" />
        <Sep />
        <Seg value={a.pen.size} options={PEN_SIZES} onPick={(size) => a.setPen({ ...a.pen, size })} label="Espessura" />
      </>
    )
  } else if (edges.length && !nodes.length) {
    const eids = new Set(edges.map((e) => e.id))
    const first = (edges[0].data ?? {}) as LinkData
    body = (
      <>
        <Seg value={first.route ?? "curva"} options={ROUTES.map((r) => ({ id: r.id!, label: r.label }))} onPick={(route) => a.patchEdges(eids, { route })} label="Traçado" />
        <Seg
          value={first.arrow ?? "fim"}
          options={[
            { id: "nenhuma", label: "—", title: "Sem seta" },
            { id: "fim", label: "→", title: "Seta no destino" },
            { id: "inicio", label: "←", title: "Seta na origem" },
            { id: "ambos", label: "↔", title: "Seta nas duas pontas" },
          ]}
          onPick={(arrow) => a.patchEdges(eids, { arrow })}
          label="Pontas"
        />
        <Seg value={first.dashed ? "t" : "s"} options={[{ id: "s", label: "Contínua" }, { id: "t", label: "Tracejada" }]} onPick={(v) => a.patchEdges(eids, { dashed: v === "t" || undefined })} label="Linha" />
        <Sep />
        <Swatches hue={first.hue} onPick={(hue) => a.patchEdges(eids, { hue })} label="Cor da seta" />
        {edges.length === 1 && (
          <>
            <Sep />
            <input
              key={edges[0].id}
              defaultValue={first.label ?? ""}
              placeholder="Legenda da seta"
              aria-label="Legenda da seta"
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === "Enter") e.currentTarget.blur()
              }}
              onBlur={(e) => a.patchEdges(eids, { label: e.currentTarget.value.trim() || undefined })}
              className="h-9 w-44 rounded-lg border-2 bg-background px-2.5 text-sm outline-none focus:border-brand"
            />
          </>
        )}
        <Sep />
        <IconBtn label="Apagar seta (Del)" danger onClick={a.onDelete}>
          <Trash2Icon className="size-[18px]" />
        </IconBtn>
      </>
    )
  } else if (nodes.length) {
    const first = nodes[0].data
    body = (
      <>
        {!only("image") && <Swatches hue={first.hue} onPick={(hue) => a.patchNodes(sel, { hue })} />}
        {hasTextual && (
          <>
            <Sep />
            <Seg value={first.fontSize ?? (nodes[0].type === "text" ? 24 : 18)} options={FONT_SIZES.map((f) => ({ id: f.id as number, label: f.label, title: `Letra ${f.id}px` }))} onPick={(fontSize) => a.patchNodes(sel, { fontSize, ...(only("text") ? { stroke: undefined } : {}) })} label="Tamanho da letra" />
          </>
        )}
        {shapes.length > 0 && (
          <>
            <Sep />
            <Seg
              value={shapes[0].data.shape ?? "rect"}
              options={[
                { id: "rect", label: <SquareIcon className="size-4" />, title: "Retângulo" },
                { id: "ellipse", label: <CircleIcon className="size-4" />, title: "Elipse" },
                { id: "diamond", label: <DiamondIcon className="size-4" />, title: "Losango" },
              ]}
              onPick={(shape) => a.patchNodes(new Set(shapes.map((n) => n.id)), { shape })}
              label="Forma"
            />
            <Seg value={shapes[0].data.fill ?? "soft"} options={[{ id: "soft", label: "Leve" }, { id: "solid", label: "Cheio" }, { id: "none", label: "Vazado" }]} onPick={(fill) => a.patchNodes(new Set(shapes.map((n) => n.id)), { fill })} label="Preenchimento" />
          </>
        )}
        <Sep />
        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Camada" className="flex size-9 items-center justify-center rounded-lg hover:bg-accent">
                  <LayersIcon className="size-[18px]" />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Camada: frente ou fundo</TooltipContent>
          </Tooltip>
          <PopoverContent align="center" className="board-ui grid w-60 gap-0.5 p-1">
            {LAYER_MOVES.map((m) => (
              <button key={m.id} type="button" onClick={() => a.onLayer(m.id)} className="grid rounded-md px-2.5 py-2 text-left hover:bg-accent">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
        {nodes.filter((n) => n.type !== "area").length > 1 && (
          <IconBtn label="Agrupar em uma moldura" onClick={a.onGroup}>
            <FrameIcon className="size-[18px]" />
          </IconBtn>
        )}
        <IconBtn label="Duplicar (Ctrl+D)" onClick={a.onDuplicate}>
          <CopyIcon className="size-[18px]" />
        </IconBtn>
        {single && single.type !== "drawing" && single.type !== "area" && (
          <>
            <Sep />
            <EntityPicker
              types={["task", "lead", "product", "goal", "content", "note", "map"]}
              placeholder="Vincular a tarefa, lead, produto, meta…"
              onPick={(ref) => a.onLink(single, ref)}
              trigger={
                <Button size="sm" variant="outline" className="h-9 gap-1.5 border-2 text-[13px]">
                  <LinkIcon /> Vincular
                </Button>
              }
            />
            {!single.data.taskId && (
              <Button size="sm" variant="outline" className="h-9 gap-1.5 border-2 text-[13px]" onClick={() => a.onNewTask(single)}>
                <CheckSquareIcon /> Criar tarefa
              </Button>
            )}
          </>
        )}
        <Sep />
        <IconBtn label="Apagar (Del)" danger onClick={a.onDelete}>
          <Trash2Icon className="size-[18px]" />
        </IconBtn>
      </>
    )
  }

  if (!body) return null
  const links = single ? linksOf(single.data) : []
  return (
    <div className="board-ui pointer-events-auto absolute top-3 left-1/2 z-20 flex max-w-[calc(100%-26rem)] min-w-0 -translate-x-1/2 flex-col items-center gap-2 max-lg:max-w-[calc(100%-8rem)]">
      <div className="flex flex-wrap items-center justify-center gap-0.5 rounded-xl border-2 bg-card p-1.5 shadow-lift">{body}</div>
      {links.length > 0 && single && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border-2 bg-card px-2.5 py-1.5 text-[13px] shadow-lift">
          <span className="font-semibold text-muted-foreground">Vinculado a</span>
          {links.map((l) => (
            <span key={`${l.type}:${l.id}`} className="inline-flex max-w-60 items-center gap-1 rounded-full border border-brand/40 bg-background py-1 pr-1 pl-2.5">
              <EntityChip entity={l} showType={false} className="text-[13px]" />
              <button
                type="button"
                aria-label="Desvincular"
                title="Desvincular"
                onClick={() => a.patchNodes(new Set([single.id]), l.type === "task" ? { taskId: undefined } : l.type === "lead" ? { leadId: undefined } : { ref: undefined })}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- busca, ajuda e minimapa ----------

function TopRight({ nodes, onGoTo, minimap, setMinimap }: { nodes: IdeaNode[]; onGoTo: (id: string) => void; minimap: boolean; setMinimap: (v: boolean) => void }) {
  const [q, setQ] = useState("")
  const [open, setOpen] = useState(false)
  const flat = useMemo(() => nodes.map(toMapNode), [nodes])
  const results = useMemo(() => searchBoard(flat, q), [flat, q])
  const frames = flat.filter((n) => n.type === "group" && n.label.trim())
  return (
    <div className="board-ui pointer-events-auto absolute top-3 right-3 z-20 flex items-center gap-1 rounded-xl border-2 bg-card p-1 shadow-lift">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="h-9 gap-2 px-3 text-[13px]" aria-label="Ir para um elemento">
            <SearchIcon className="size-[18px]" /> Ir para…
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="board-ui w-80 p-0" onKeyDown={(e) => e.stopPropagation()}>
          <Command shouldFilter={false}>
            <CommandInput value={q} onValueChange={setQ} placeholder="Buscar texto na lousa…" />
            <CommandList className="max-h-72">
              {q.trim() ? (
                <>
                  <CommandEmpty>Nada encontrado.</CommandEmpty>
                  {results.map((r) => (
                    <CommandItem key={r.id} value={r.id} onSelect={() => (onGoTo(r.id), setOpen(false))}>
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{r.kind}</span>
                    </CommandItem>
                  ))}
                </>
              ) : frames.length ? (
                <CommandGroup heading="Molduras">
                  {frames.map((f) => (
                    <CommandItem key={f.id} value={f.id} onSelect={() => (onGoTo(f.id), setOpen(false))}>
                      <FrameIcon /> {f.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <p className="p-4 text-center text-sm text-muted-foreground">Digite para achar uma nota, forma ou texto. Molduras nomeadas aparecem aqui como atalhos.</p>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-pressed={minimap} aria-label="Minimapa" onClick={() => setMinimap(!minimap)} className={cn("flex size-9 items-center justify-center rounded-lg hover:bg-accent", minimap && "bg-accent")}>
            <MapIcon className="size-[18px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Minimapa</TooltipContent>
      </Tooltip>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Atalhos" className="flex size-9 items-center justify-center rounded-lg hover:bg-accent">
            <HelpCircleIcon className="size-[18px]" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="board-ui w-80 text-sm">
          <p className="mb-2 font-semibold">Atalhos da lousa</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
            {[
              ["V · H", "Selecionar · mover a tela"],
              ["P · T · N", "Desenhar · texto · nota"],
              ["R · O · D", "Retângulo · elipse · losango"],
              ["A · F · I", "Seta · moldura · imagem"],
              ["Duplo clique", "Escreve no fundo ou edita o elemento"],
              ["Enter / F2", "Edita o selecionado"],
              ["Espaço + arrastar", "Move a tela"],
              ["Rodinha", "Aproxima e afasta"],
              ["Shift+1 · Shift+2", "Enquadra tudo · enquadra o selecionado"],
              ["Ctrl+C · V · D", "Copiar · colar · duplicar"],
              ["Ctrl+Z · Y", "Desfazer · refazer"],
              ["Ctrl+V (imagem)", "Cola imagem ou texto da área de transferência"],
              ["Setas", "Movem o selecionado (Shift = mais)"],
              ["Del", "Apaga"],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold whitespace-nowrap">{k}</dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function Navigator({ history, onFit, onSelection, zoomIn, zoomOut, zoomTo, hasSelection }: { history: Pick<ReturnType<typeof useMapHistory>, "undo" | "redo" | "canUndo" | "canRedo">; onFit: () => void; onSelection: () => void; zoomIn: () => void; zoomOut: () => void; zoomTo: () => void; hasSelection: boolean }) {
  const zoom = useFlowStore((s) => s.transform[2])
  const pct = Math.round(zoom * 100)
  const B = ({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} onClick={onClick} disabled={disabled} className="flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-30">
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
  return (
    <div className="board-ui pointer-events-auto absolute bottom-3 left-3 z-20 flex items-center gap-0.5 rounded-xl border-2 bg-card p-1 shadow-lift">
      <B label="Desfazer (Ctrl+Z)" onClick={history.undo} disabled={!history.canUndo}>
        <Undo2Icon className="size-5" />
      </B>
      <B label="Refazer (Ctrl+Shift+Z)" onClick={history.redo} disabled={!history.canRedo}>
        <Redo2Icon className="size-5" />
      </B>
      <Sep />
      <B label="Afastar" onClick={zoomOut}>
        <MinusIcon className="size-5" />
      </B>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={zoomTo} className="tabular h-10 min-w-14 rounded-lg px-1 text-sm font-semibold hover:bg-accent" aria-label="Zoom atual: clique para voltar a 100%">
            {pct}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Clique para 100%</TooltipContent>
      </Tooltip>
      <B label="Aproximar" onClick={zoomIn}>
        <PlusIcon className="size-5" />
      </B>
      <Sep />
      <B label="Enquadrar tudo (Shift+1)" onClick={onFit}>
        <MaximizeIcon className="size-5" />
      </B>
      <B label={hasSelection ? "Aproximar do selecionado (Shift+2)" : "Selecione algo para aproximar"} onClick={onSelection} disabled={!hasSelection}>
        <ScanSearchIcon className="size-5" />
      </B>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center">
      <div className="max-w-md rounded-2xl border-2 border-dashed bg-card/80 px-8 py-6 text-center backdrop-blur-sm">
        <ZoomInIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="text-lg font-bold">Lousa em branco</p>
        <p className="mt-1 text-[15px] text-muted-foreground">Escolha uma ferramenta à esquerda, dê duplo clique para escrever, cole uma imagem (Ctrl+V) ou arraste um arquivo para cá.</p>
      </div>
    </div>
  )
}

export { toMapEdge }
