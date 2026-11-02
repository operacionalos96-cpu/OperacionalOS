"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon, HandshakeIcon, InboxIcon, MessageCircleIcon, PlusIcon, TrophyIcon, XCircleIcon } from "lucide-react"
import { STAGES, stageColor } from "@/lib/domain/constants"
import type { Lead, Stage } from "@/lib/domain/types"
import { daysSince, leadUrgency, sum } from "@/lib/domain/rules"
import { moneyCompact } from "@/lib/format"
import { openLeadForm } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { moveLeadTo } from "@/components/dialogs/lead-flow-dialogs"
import { LeadCard } from "./lead-card"

/** Fechados há mais que isso saem do quadro (continuam acessíveis pela busca). */
const CLOSED_VISIBLE_DAYS = 30

const URGENCY_RANK = { vencida: 0, hoje: 1, parado: 2 } as const

/** Ordem automática: mais urgente em cima. Ninguém precisa ordenar cards à mão. */
function sortLeads(leads: Lead[], now: Date) {
  return [...leads].sort((a, b) => {
    const ua = leadUrgency(a, now)
    const ub = leadUrgency(b, now)
    const ra = ua ? URGENCY_RANK[ua] : 3
    const rb = ub ? URGENCY_RANK[ub] : 3
    return ra - rb || a.nextAction.dueDate.localeCompare(b.nextAction.dueDate)
  })
}

export function Kanban({ leads, showOwner = true, focusStage }: { leads: Lead[]; showOwner?: boolean; focusStage?: Stage | null }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const now = new Date()
  const activeLead = leads.find((l) => l.id === activeId)
  // Mini-barra no cabeçalho de cada coluna: onde está o dinheiro do funil.
  const maxTotal = Math.max(1, ...STAGES.map((s) => sum(leads.filter((l) => l.stage === s.id).map((l) => l.valueCents))))
  // "?etapa=" (vindo da Início): rola até a coluna e a destaca por um instante.
  const board = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusStage) return
    board.current?.querySelector(`[data-stage="${focusStage}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [focusStage])

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const lead = leads.find((l) => l.id === e.active.id)
    const stage = e.over?.id as Stage | undefined
    if (lead && stage) moveLeadTo(lead, stage)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      {/* Uma rolagem horizontal do quadro; cada coluna rola na vertical, com o cabeçalho fixo. */}
      <div className="flex h-full min-h-0 flex-col">
      <div ref={board} className="page-container flex min-h-0 flex-1 gap-4 overflow-x-auto pt-2 pb-3 [scrollbar-width:none]">
        {STAGES.map((stage) => {
          let inStage = leads.filter((l) => l.stage === stage.id)
          let hidden = 0
          if (!stage.open) {
            const recent = inStage.filter((l) => !l.closedAt || daysSince(l.closedAt, now) <= CLOSED_VISIBLE_DAYS)
            hidden = inStage.length - recent.length
            inStage = recent
          }
          return (
            <Column key={stage.id} stage={stage.id} label={stage.label} open={stage.open} leads={sortLeads(inStage, now)} hidden={hidden} maxTotal={maxTotal} showOwner={showOwner} focused={focusStage === stage.id} />
          )
        })}
      </div>
      <BoardScroller board={board} />
      </div>
      <DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}>{activeLead ? <LeadCard lead={activeLead} dragging showOwner={showOwner} /> : null}</DragOverlay>
    </DndContext>
  )
}

/** Vazio de cada etapa: ícone e frase que ensinam o que entra ali. */
const EMPTY: Record<Stage, { icon: React.ComponentType<{ className?: string }>; title: string; text: string }> = {
  novo: { icon: InboxIcon, title: "Nenhum lead novo", text: "Arraste um lead para cá ou adicione um novo." },
  contato: { icon: MessageCircleIcon, title: "Nenhum contato feito", text: "Arraste um lead para cá depois do primeiro contato." },
  proposta: { icon: FileTextIcon, title: "Nenhuma proposta", text: "Arraste um lead para cá ou adicione uma nova proposta." },
  negociacao: { icon: HandshakeIcon, title: "Nenhuma negociação", text: "Arraste um lead para cá quando a conversa for de valor." },
  ganho: { icon: TrophyIcon, title: "Nenhum negócio ganho", text: "Os leads fechados aparecerão aqui." },
  perdido: { icon: XCircleIcon, title: "Nenhum perdido", text: "Arraste aqui os leads perdidos." },
}

function Column({
  stage,
  label,
  open,
  leads,
  hidden,
  maxTotal,
  showOwner,
  focused,
}: {
  stage: Stage
  label: string
  open: boolean
  leads: Lead[]
  hidden: number
  maxTotal: number
  showOwner: boolean
  focused: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = sum(leads.map((l) => l.valueCents))
  const color = stageColor(stage)
  const empty = EMPTY[stage]

  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      className={cn(
        "relative flex max-h-full w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card/70 shadow-card transition-[background-color,box-shadow] duration-(--dur-2)",
        stage === "perdido" && "w-[220px]",
        isOver && "bg-accent ring-2 ring-foreground/10",
        focused && "ring-2 ring-highlight/60",
      )}
    >
      {/* Brilho da etapa no topo da coluna (profundidade, como nos cards). */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-[0.04]" style={{ background: `linear-gradient(to bottom, ${color}, transparent)` }} />
      <div className="relative grid gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
          <span className="text-base font-semibold tracking-tight">{label}</span>
          <span className="tabular rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{leads.length + hidden}</span>
        </div>
        {stage !== "perdido" && <span className="tabular text-sm font-medium text-muted-foreground">{moneyCompact(total)}</span>}
        <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full transition-[width] duration-(--dur-4) ease-(--ease-std)" style={{ width: `${Math.max(total / maxTotal, leads.length ? 0.04 : 0) * 100}%`, background: color }} />
        </span>
      </div>

      <div className="relative flex min-h-24 flex-1 flex-col gap-2.5 overflow-y-auto px-3 pb-3">
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} showOwner={showOwner} />
        ))}
        {leads.length === 0 && stage !== "perdido" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <empty.icon className={cn("mb-1 size-9 stroke-[1.4]", stage === "ganho" ? "text-success" : "text-muted-foreground")} />
            <p className="text-sm font-semibold">{empty.title}</p>
            <p className="text-xs text-muted-foreground">{empty.text}</p>
            {open && (
              <button
                onClick={() => openLeadForm({ prefill: { stage } })}
                className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background/60 px-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                <PlusIcon className="size-4" /> Adicionar
              </button>
            )}
          </div>
        )}
        {leads.length > 0 && open && (
          <button
            onClick={() => openLeadForm({ prefill: { stage } })}
            className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <PlusIcon className="size-4" /> Adicionar lead
          </button>
        )}
        {hidden > 0 && <p className="px-2 py-1 text-center text-xs text-muted-foreground">+{hidden} fechados há mais tempo</p>}
      </div>
    </div>
  )
}

/** Rolagem do quadro embaixo: setas + trilho arrastável com a parte visível em laranja (a barra nativa fica escondida). */
function BoardScroller({ board }: { board: React.RefObject<HTMLDivElement | null> }) {
  const [bar, setBar] = useState({ left: 0, width: 1 })
  const [dragging, setDragging] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const grabAt = useRef(0)
  useEffect(() => {
    const el = board.current
    if (!el) return
    const update = () => setBar({ left: el.scrollLeft / el.scrollWidth, width: el.clientWidth / el.scrollWidth })
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [board])
  if (bar.width >= 0.999) return null
  const step = (dir: number) => board.current?.scrollBy({ left: dir * 320, behavior: "smooth" })

  // Posição do ponteiro no trilho → scrollLeft do quadro (mantém o ponto pego da barra sob o mouse).
  function scrollToPointer(clientX: number, grab: number) {
    const el = board.current
    const t = track.current?.getBoundingClientRect()
    if (!el || !t) return
    const ratio = (clientX - t.left) / t.width - grab
    el.scrollLeft = Math.max(0, Math.min(1 - bar.width, ratio)) * el.scrollWidth
  }
  function onTrackDown(e: React.PointerEvent<HTMLDivElement>) {
    const t = track.current?.getBoundingClientRect()
    if (!t) return
    const at = (e.clientX - t.left) / t.width
    // Pegou a barra: arrasta do ponto onde pegou. Clicou fora: centraliza a barra ali e já arrasta.
    const onThumb = at >= bar.left && at <= bar.left + bar.width
    grabAt.current = onThumb ? at - bar.left : bar.width / 2
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    scrollToPointer(e.clientX, grabAt.current)
  }
  function onTrackMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging) scrollToPointer(e.clientX, grabAt.current)
  }
  function onTrackUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDragging(false)
  }
  const arrow = "flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground"
  return (
    <div className="page-container flex items-center gap-3 pb-3">
      <button type="button" onClick={() => step(-1)} aria-label="Colunas à esquerda" className={arrow}>
        <ChevronLeftIcon className="size-4" />
      </button>
      {/* Trilho: arrastar a barra laranja ou clicar num ponto rola o quadro (área de toque de 24 px). */}
      <div
        ref={track}
        onPointerDown={onTrackDown}
        onPointerMove={onTrackMove}
        onPointerUp={onTrackUp}
        onPointerCancel={onTrackUp}
        className="group/track relative flex h-6 flex-1 cursor-pointer touch-none items-center"
        aria-hidden
      >
        <div className="relative h-1.5 w-full rounded-full bg-muted transition-[height] group-hover/track:h-2">
          <span
            className={cn("absolute inset-y-0 rounded-full bg-highlight", dragging ? "cursor-grabbing" : "cursor-grab")}
            style={{ left: `${bar.left * 100}%`, width: `${bar.width * 100}%` }}
          />
        </div>
      </div>
      <button type="button" onClick={() => step(1)} aria-label="Colunas à direita" className={arrow}>
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  )
}

function DraggableCard({ lead, showOwner }: { lead: Lead; showOwner: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <Link
      ref={setNodeRef}
      href={`/pipeline/${lead.id}`}
      {...listeners}
      {...attributes}
      className={cn(
        "block touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Espaço reservado tracejado enquanto o card está no ar.
        isDragging && "rounded-lg outline-2 outline-foreground/20 outline-dashed [&>*]:invisible",
      )}
    >
      <LeadCard lead={lead} showOwner={showOwner} />
    </Link>
  )
}
