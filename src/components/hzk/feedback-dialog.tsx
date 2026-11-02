"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { BugIcon, LightbulbIcon, MessageSquareWarningIcon } from "lucide-react"
import { sendFeedback, type FeedbackKind } from "@/lib/feedback"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

const KINDS: { id: FeedbackKind; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "bug", label: "Algo deu errado", hint: "O que você fez e o que aconteceu?", icon: BugIcon },
  { id: "sugestao", label: "Ideia de melhoria", hint: "O que deixaria seu trabalho mais fácil?", icon: LightbulbIcon },
]

/**
 * "Relatar bug ou ideia" (Guia do dia): duas escolhas grandes e um campo. A página em que a pessoa
 * está vai junto, para quem desenvolve achar o problema (src/lib/feedback.ts).
 */
export function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-highlight hover:text-highlight", className)}
      >
        <MessageSquareWarningIcon className="size-3.5" /> Relatar bug ou ideia
      </button>
      {open && <FeedbackDialog onClose={() => setOpen(false)} />}
    </>
  )
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const meId = useStore((s) => s.meId)
  const path = usePathname()
  const [kind, setKind] = useState<FeedbackKind>("bug")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const current = KINDS.find((k) => k.id === kind)!

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    try {
      await sendFeedback({ kind, text, meId, path })
      toast.success("Recebido, obrigado!", { description: "Vai direto para quem cuida do sistema." })
      onClose()
    } catch {
      toast.error("Não foi possível enviar. Tente de novo.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Relatar bug ou ideia</DialogTitle>
          <DialogDescription>Conte com suas palavras. A tela em que você está vai junto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className={cn(
                  "flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors",
                  kind === k.id ? "border-highlight bg-highlight-soft/40 text-foreground" : "text-muted-foreground hover:border-foreground/30",
                )}
              >
                <k.icon className={cn("size-5", kind === k.id && "text-highlight")} />
                {k.label}
              </button>
            ))}
          </div>
          <Textarea autoFocus rows={5} placeholder={current.hint} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="brand" disabled={busy || !text.trim()}>
              {busy ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
