"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  Position,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  useStore as useFlowStore,
  type EdgeProps,
  type NodeProps,
} from "@xyflow/react"
import { ELEMENT_SIZE, DEFAULT_FONT, TEXT_FONT, boardColor } from "@/lib/domain/board"
import { pathBox, pathD } from "@/lib/domain/canvas"
import { correctText } from "@/lib/domain/autocorrect"
import { autocorrected, spellProps } from "@/lib/use-autocorrect"
import type { IdeaData, IdeaNode, LinkData } from "@/components/mindmap/mind-map-editor"
import { EntityChip } from "@/components/entities/entity-bits"
import { linksOf } from "@/lib/domain/board"
import { cn } from "@/lib/utils"

/** O que os elementos da lousa precisam do editor (editar texto, apagar). */
export interface BoardActions {
  editingId: string | null
  setEditingId: (id: string | null) => void
  setLabel: (id: string, label: string) => void
  remove: (id: string) => void
  /** Ferramenta ativa: com "seta", os elementos mostram os pontos de ligação. */
  arrowTool: boolean
}
export const BoardCtx = createContext<BoardActions | null>(null)
const useBoard = () => useContext(BoardCtx)!

// ---------- pedaços compartilhados ----------

/** Pontos de ligação: grandes (16px), sempre visíveis ao passar o mouse, selecionar ou ligar. */
function Handles() {
  return (
    <>
      <Handle id="l" type="source" position={Position.Left} className="board-handle" />
      <Handle id="r" type="source" position={Position.Right} className="board-handle" />
      <Handle id="t" type="source" position={Position.Top} className="board-handle" />
      <Handle id="b" type="source" position={Position.Bottom} className="board-handle" />
    </>
  )
}

/** Cantos de redimensionar com tamanho fixo na tela, em qualquer zoom. */
function Resizer({ selected, minWidth = 90, minHeight = 60, keepAspectRatio = false }: { selected?: boolean; minWidth?: number; minHeight?: number; keepAspectRatio?: boolean }) {
  const zoom = useFlowStore((s) => s.transform[2])
  return (
    <NodeResizer
      isVisible={!!selected}
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspectRatio}
      autoScale={false}
      lineStyle={{ borderColor: "var(--brand)", borderWidth: 1.5 / zoom }}
      handleStyle={{ width: 12 / zoom, height: 12 / zoom, borderRadius: 3 / zoom, border: `${2 / zoom}px solid var(--background)`, background: "var(--brand)" }}
    />
  )
}

/** Vínculos do elemento (tarefa, lead, produto, meta…) como chips legíveis abaixo dele. */
function LinkChips({ data }: { data: IdeaData }) {
  const links = linksOf(data)
  if (!links.length) return null
  return (
    <div className="nodrag nopan absolute top-full left-0 z-10 mt-2 flex max-w-[22rem] flex-wrap gap-1.5">
      {links.map((l) => (
        <span key={`${l.type}:${l.id}`} className="inline-flex max-w-[16rem] rounded-full border border-brand/40 bg-card px-2.5 py-1 text-[13px] leading-none font-medium text-foreground shadow-sm">
          <EntityChip entity={l} showType={false} />
        </span>
      ))}
    </div>
  )
}

/** Texto editável no próprio elemento: duplo clique, Enter ou F2; Esc ou clicar fora confirma. */
function useInlineEdit(id: string, label: string) {
  const board = useBoard()
  const editing = board.editingId === id
  const [text, setText] = useState(label)
  const ref = useRef<HTMLTextAreaElement>(null)
  // Elemento novo só pode receber foco depois de medido pelo React Flow.
  const measured = !!useInternalNode(id)?.measured.width
  useEffect(() => {
    if (editing) setText(label)
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (editing && measured) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing, measured])
  const finish = () => {
    const v = correctText(text.trim())
    if (v !== label) board.setLabel(id, v)
    board.setEditingId(null)
  }
  return { editing, text, setText, ref, finish, board }
}

function Editor({ edit, placeholder, className, style }: { edit: ReturnType<typeof useInlineEdit>; placeholder: string; className?: string; style?: React.CSSProperties }) {
  return (
    <textarea
      ref={edit.ref}
      value={edit.text}
      {...spellProps}
      onChange={(e) => edit.setText(autocorrected(edit.text, e.currentTarget))}
      onBlur={edit.finish}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") e.currentTarget.blur()
      }}
      placeholder={placeholder}
      className={cn("nodrag nowheel nopan size-full resize-none bg-transparent text-center outline-none placeholder:text-muted-foreground/70", className)}
      style={{ fontSize: "inherit", color: "inherit", fontWeight: "inherit", lineHeight: "inherit", ...style }}
    />
  )
}

// ---------- forma ----------

export function ShapeView({ id, data, selected }: NodeProps<IdeaNode>) {
  const edit = useInlineEdit(id, data.label)
  const shape = data.shape ?? "rect"
  const fill = data.fill ?? "soft"
  const stroke = boardColor(data.hue, "stroke")
  const bg = fill === "none" ? "transparent" : fill === "solid" ? boardColor(data.hue, "solid") : boardColor(data.hue, "fill")
  const ink = fill === "solid" ? boardColor(undefined, "onSolid") : "var(--foreground)"
  const font = data.fontSize ?? DEFAULT_FONT
  const pad = shape === "diamond" ? "px-[22%] py-[18%]" : shape === "ellipse" ? "px-[12%] py-[8%]" : "px-4 py-3"
  return (
    <div className="board-node group/el relative size-full" style={{ minWidth: 90, minHeight: 60 }} onDoubleClick={(e) => (e.stopPropagation(), edit.board.setEditingId(id))}>
      <Resizer selected={selected} />
      {shape === "diamond" ? (
        <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <polygon points="50,1 99,50 50,99 1,50" fill={bg} stroke={stroke} strokeWidth={3} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      ) : (
        <div className={cn("absolute inset-0 border-[3px]", shape === "ellipse" ? "rounded-[50%]" : "rounded-xl")} style={{ background: bg, borderColor: stroke }} />
      )}
      <div className={cn("relative flex size-full items-center justify-center overflow-hidden text-center leading-snug font-semibold break-words whitespace-pre-wrap", pad)} style={{ fontSize: font, color: ink }}>
        {edit.editing ? <Editor edit={edit} placeholder="Escreva…" /> : data.label || <span className="font-normal opacity-50">Duplo clique para escrever</span>}
      </div>
      <LinkChips data={data} />
      <Handles />
    </div>
  )
}

// ---------- nota (post-it) ----------

export function StickyView({ id, data, selected }: NodeProps<IdeaNode>) {
  const edit = useInlineEdit(id, data.label)
  const font = data.fontSize ?? DEFAULT_FONT
  return (
    <div
      className="board-node group/el relative size-full rounded-md shadow-[0_6px_14px_-6px_rgb(0_0_0/0.45),0_1px_2px_rgb(0_0_0/0.25)]"
      style={{ background: boardColor(data.hue, "solid"), minWidth: 100, minHeight: 90 }}
      onDoubleClick={(e) => (e.stopPropagation(), edit.board.setEditingId(id))}
    >
      <Resizer selected={selected} minWidth={110} minHeight={100} />
      <div className="flex size-full items-start justify-start overflow-hidden p-4 leading-snug font-medium break-words whitespace-pre-wrap" style={{ fontSize: font, color: boardColor(undefined, "onSolid") }}>
        {edit.editing ? <Editor edit={edit} placeholder="Escreva a ideia…" className="text-left" /> : data.label || <span className="opacity-50">Duplo clique para escrever</span>}
      </div>
      <LinkChips data={data} />
      <Handles />
    </div>
  )
}

// ---------- texto solto ----------

export function TextView({ id, data, selected }: NodeProps<IdeaNode>) {
  const edit = useInlineEdit(id, data.label)
  const size = data.fontSize ?? data.stroke ?? TEXT_FONT
  return (
    <div
      className={cn("board-node group/el relative rounded-md px-2 py-1 leading-tight font-semibold whitespace-pre-wrap", selected && !edit.editing && "outline-2 outline-brand/60 outline-dashed outline-offset-2")}
      style={{ fontSize: size, color: boardColor(data.hue, "ink") }}
      onDoubleClick={(e) => (e.stopPropagation(), edit.board.setEditingId(id))}
    >
      {edit.editing ? (
        <textarea
          ref={edit.ref}
          value={edit.text}
          rows={1}
          {...spellProps}
          onChange={(e) => edit.setText(autocorrected(edit.text, e.currentTarget))}
          onBlur={edit.finish}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Escape") e.currentTarget.blur()
          }}
          placeholder="Escreva…"
          className="nodrag nowheel block field-sizing-content min-w-32 resize-none bg-transparent outline-none placeholder:text-muted-foreground"
          style={{ fontSize: "inherit", color: "inherit", fontWeight: "inherit", lineHeight: "inherit" }}
        />
      ) : (
        data.label || <span className="font-normal opacity-50">Texto</span>
      )}
      <LinkChips data={data} />
      <Handles />
    </div>
  )
}

// ---------- desenho ----------

export function DrawingView({ data, selected }: NodeProps<IdeaNode>) {
  const s = data.scale ?? 1
  const path = data.path ?? []
  const stroke = data.stroke ?? 4
  const b = pathBox(path, stroke)
  const d = pathD(path)
  return (
    <svg width={b.width} height={b.height} style={s !== 1 ? { zoom: s } : undefined} className={cn("block overflow-visible", selected && "drop-shadow-[0_0_4px_var(--brand)]")}>
      <path d={d} fill="none" stroke={boardColor(data.hue, "ink")} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(18, stroke + 12)} strokeLinecap="round" className="drawing-hit" />
    </svg>
  )
}

// ---------- imagem ----------

export function ImageView({ id, data, selected }: NodeProps<IdeaNode>) {
  const edit = useInlineEdit(id, data.label)
  return (
    <div className="board-node group/el relative size-full" style={{ minWidth: 60, minHeight: 40 }} onDoubleClick={(e) => (e.stopPropagation(), edit.board.setEditingId(id))}>
      <Resizer selected={selected} minWidth={60} minHeight={40} keepAspectRatio />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.src} alt={data.label || "Imagem da lousa"} draggable={false} className="size-full rounded-lg border-2 border-foreground/25 bg-card object-fill shadow-md select-none" />
      {(data.label || edit.editing) && (
        <div className="absolute inset-x-0 top-full mt-1 text-center text-sm font-medium text-foreground">
          {edit.editing ? <Editor edit={edit} placeholder="Legenda…" className="h-7 text-center" /> : data.label}
        </div>
      )}
      <LinkChips data={data} />
      <Handles />
    </div>
  )
}

// ---------- moldura (agrupa e nomeia uma área) ----------

export function FrameView({ id, data, selected }: NodeProps<IdeaNode>) {
  const edit = useInlineEdit(id, data.label)
  const hue = data.hue
  return (
    <div className="board-frame relative size-full rounded-2xl border-[3px] border-dashed" style={{ borderColor: boardColor(hue, "stroke"), background: hue === undefined ? "color-mix(in oklab, var(--foreground) 3%, transparent)" : `oklch(0.62 0.17 ${hue} / 0.07)` }}>
      <Resizer selected={selected} minWidth={160} minHeight={120} />
      {/* Faixas da borda: o miolo da moldura é vazado, só a borda e o título pegam o mouse. */}
      {["top-0 inset-x-0 h-4", "bottom-0 inset-x-0 h-4", "left-0 inset-y-0 w-4", "right-0 inset-y-0 w-4"].map((c) => (
        <div key={c} className={`pointer-events-auto absolute cursor-move ${c}`} />
      ))}
      <div
        className="pointer-events-auto absolute -top-0.5 left-4 -translate-y-1/2 rounded-lg border-2 bg-card px-3 py-1 text-base font-bold shadow-sm"
        style={{ borderColor: boardColor(hue, "stroke") }}
        onDoubleClick={(e) => (e.stopPropagation(), edit.board.setEditingId(id))}
      >
        {edit.editing ? (
          <input
            ref={edit.ref as unknown as React.RefObject<HTMLInputElement>}
            value={edit.text}
            onChange={(e) => edit.setText(e.target.value)}
            onBlur={edit.finish}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur()
            }}
            className="nodrag w-48 bg-transparent outline-none"
            placeholder="Nome da moldura"
          />
        ) : (
          data.label || <span className="font-normal opacity-50">Moldura</span>
        )}
      </div>
    </div>
  )
}

export const BOARD_NODE_TYPES = { shape: ShapeView, sticky: StickyView, text: TextView, drawing: DrawingView, image: ImageView, area: FrameView }

// ---------- conexão (seta) ----------

/**
 * Seta da lousa: traço de 2,5px na cor do texto (contraste alto), ponta grande,
 * rota curva/reta/ângulo, tracejado, cor e legenda. Área de clique de 28px.
 * A ponta é um <marker> próprio de cada linha (a mesma cor do traço).
 */
export function BoardEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data }: EdgeProps) {
  const link = (data ?? {}) as LinkData
  const color = selected ? "var(--brand)" : boardColor(link.hue, "stroke")
  const route = link.route ?? "curva"
  const args = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }
  const [path, lx, ly] = route === "reta" ? getStraightPath(args) : route === "angulo" ? getSmoothStepPath({ ...args, borderRadius: 14, offset: 28 }) : getBezierPath(args)
  const arrow = link.arrow ?? "fim"
  const end = arrow === "fim" || arrow === "ambos"
  const start = arrow === "inicio" || arrow === "ambos"
  const w = selected ? 3.5 : 2.5
  return (
    <>
      <defs>
        <marker id={`bm-${id}`} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse" markerUnits="strokeWidth">
          <path d="M0.5 0.5 L9.5 5 L0.5 9.5 Z" fill={color} stroke={color} strokeLinejoin="round" strokeWidth="1" />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={28}
        markerEnd={end ? `url(#bm-${id})` : undefined}
        markerStart={start ? `url(#bm-${id})` : undefined}
        style={{ stroke: color, strokeWidth: w, strokeDasharray: link.dashed ? "9 7" : undefined, strokeLinecap: "round" }}
      />
      {link.label && (
        <EdgeLabelRenderer>
          <span
            className="nodrag nopan pointer-events-none absolute rounded-md border-2 bg-card px-2 py-0.5 text-sm leading-tight font-semibold whitespace-nowrap text-foreground"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, borderColor: color }}
          >
            {link.label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const BOARD_EDGE_TYPES = { board: BoardEdge }

/** Tamanho padrão de cada ferramenta de colocar elemento. */
export { ELEMENT_SIZE }
