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
import { PlusIcon } from "lucide-react"
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
      <div ref={board} className="page-container flex h-full gap-4 overflow-x-auto pt-2 pb-4">
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
      <DragOverlay dropAnimation={{ duration: 240, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}>{activeLead ? <LeadCard lead={activeLead} dragging showOwner={showOwner} /> : null}</DragOverlay>
    </DndContext>
  )
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

  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      className={cn(
        "flex max-h-full w-[272px] shrink-0 flex-col rounded-xl border bg-muted/40 transition-[background-color,box-shadow] duration-(--dur-2)",
        !open && "w-[248px] bg-muted/30",
        isOver && "bg-accent ring-2 ring-foreground/10",
        focused && "ring-2 ring-highlight/60",
      )}
    >
      <div className="sticky top-0 grid gap-1.5 rounded-t-xl px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: stageColor(stage) }} />
          <span className="text-sm font-semibold">{label}</span>
          <span className="tabular text-xs text-muted-foreground">{leads.length}</span>
          <span className="tabular ml-auto text-xs font-medium text-muted-foreground">{moneyCompact(total)}</span>
        </div>
        <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full transition-[width] duration-(--dur-4) ease-(--ease-std)" style={{ width: `${(total / maxTotal) * 100}%`, background: stageColor(stage) }} />
        </span>
      </div>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} showOwner={showOwner} />
        ))}
        {open && (
          <button
            onClick={() => openLeadForm({ prefill: { stage } })}
            className="flex h-8 items-center justify-center gap-1 rounded-lg text-xs text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <PlusIcon className="size-3.5" /> Adicionar
          </button>
        )}
        {!open && leads.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            Arraste aqui os leads {stage === "ganho" ? "fechados" : "perdidos"}.
          </p>
        )}
        {hidden > 0 && (
          <p className="px-2 py-1 text-center text-xs text-muted-foreground">+{hidden} fechados há mais de 30 dias</p>
        )}
      </div>
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
