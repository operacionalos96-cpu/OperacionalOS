"use client"

import { useState } from "react"
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

export function Kanban({ leads }: { leads: Lead[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const now = new Date()
  const activeLead = leads.find((l) => l.id === activeId)

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
      <div className="flex h-full gap-3 overflow-x-auto p-4 sm:px-6">
        {STAGES.map((stage) => {
          let inStage = leads.filter((l) => l.stage === stage.id)
          let hidden = 0
          if (!stage.open) {
            const recent = inStage.filter((l) => !l.closedAt || daysSince(l.closedAt, now) <= CLOSED_VISIBLE_DAYS)
            hidden = inStage.length - recent.length
            inStage = recent
          }
          return (
            <Column key={stage.id} stage={stage.id} label={stage.label} open={stage.open} leads={sortLeads(inStage, now)} hidden={hidden} />
          )
        })}
      </div>
      <DragOverlay dropAnimation={null}>{activeLead ? <LeadCard lead={activeLead} dragging /> : null}</DragOverlay>
    </DndContext>
  )
}

function Column({
  stage,
  label,
  open,
  leads,
  hidden,
}: {
  stage: Stage
  label: string
  open: boolean
  leads: Lead[]
  hidden: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const total = sum(leads.map((l) => l.valueCents))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-xl border bg-muted/40 transition-colors",
        !open && "w-56 bg-muted/30",
        isOver && "bg-accent ring-2 ring-foreground/10",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2 rounded-full" style={{ background: stageColor(stage) }} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="tabular text-xs text-muted-foreground">{leads.length}</span>
        <span className="tabular ml-auto text-xs font-medium text-muted-foreground">{moneyCompact(total)}</span>
      </div>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {leads.map((lead) => (
          <DraggableCard key={lead.id} lead={lead} />
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
          <p className="px-2 py-1 text-center text-[11px] text-muted-foreground">+{hidden} fechados há mais de 30 dias</p>
        )}
      </div>
    </div>
  )
}

function DraggableCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <Link
      ref={setNodeRef}
      href={`/pipeline/${lead.id}`}
      {...listeners}
      {...attributes}
      className={cn("block touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", isDragging && "opacity-30")}
    >
      <LeadCard lead={lead} />
    </Link>
  )
}
