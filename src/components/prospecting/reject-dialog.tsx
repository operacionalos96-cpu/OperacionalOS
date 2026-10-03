"use client"

import { useState } from "react"
import { toast } from "sonner"
import { REJECTION_REASONS, type RejectionReason } from "@/lib/domain/prospecting"
import type { Lead } from "@/lib/domain/types"
import { rejectLead, undoReview } from "@/lib/services/ai-office"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * "Por que este lead foi descartado?" — o lead NÃO é apagado: motivo + comentário
 * ficam guardados (dado de aprendizado) e geram lead.rejected. Teclas 1–8 escolhem.
 */
export function RejectLeadDialog({ lead, open, onOpenChange, onDone }: { lead: Lead; open: boolean; onOpenChange: (v: boolean) => void; onDone?: () => void }) {
  const [reason, setReason] = useState<RejectionReason | null>(null)
  const [notes, setNotes] = useState("")

  function confirm() {
    if (!reason) return
    const previous = lead.review
    rejectLead(lead.id, reason, notes)
    toast(`${lead.name} descartado`, { description: "Guardado para aprendizado.", action: { label: "Desfazer", onClick: () => undoReview(lead.id, previous) } })
    setReason(null)
    setNotes("")
    onOpenChange(false)
    onDone?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(e) => {
          const target = e.target as HTMLElement
          if (target.tagName === "TEXTAREA") {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) confirm()
            return
          }
          const n = Number(e.key)
          if (n >= 1 && n <= REJECTION_REASONS.length) setReason(REJECTION_REASONS[n - 1].id)
          if (e.key === "Enter" && reason) confirm()
        }}
      >
        <DialogHeader>
          <DialogTitle>Por que este lead foi descartado?</DialogTitle>
          <DialogDescription>{lead.name} continua guardado — sua decisão ensina os próximos agentes.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {REJECTION_REASONS.map((r, i) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setReason(r.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                reason === r.id && "border-brand bg-accent font-medium",
              )}
            >
              <kbd className="w-4 rounded border bg-muted text-center font-sans text-[10px] text-muted-foreground">{i + 1}</kbd>
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Comentário (opcional). Ex.: visual não é moderno, mas funciona bem no celular e passa confiança."
          className="rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <Button onClick={confirm} disabled={!reason}>
          Descartar
        </Button>
      </DialogContent>
    </Dialog>
  )
}
