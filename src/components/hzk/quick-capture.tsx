"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { uid } from "@/lib/format"
import { ITEM_KINDS, captureItem, type ItemKind } from "@/lib/domain/items"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { SubmitRow, submitOnModEnter } from "@/components/shared/fields"
import { KIND_ICON } from "./item-bits"
import { SmartCapture } from "./smart-capture"
import { SparklesIcon, TextCursorInputIcon } from "lucide-react"

/**
 * Captura rápida (HZK OS): tarefa, ideia, nota ou decisão em uma linha, de qualquer tela.
 * Vai para a caixa de entrada de quem capturou; a triagem decide área, dono e prazo depois.
 * Modo "Estruturar com IA" (ADR 0019): texto livre → prévia de tarefas para revisar e criar.
 */
export function QuickCapture() {
  const capture = useUI((s) => s.capture)
  const setUI = useUI((s) => s.set)
  const meId = useStore((s) => s.meId)
  const createItem = useStore((s) => s.createItem)
  const [kind, setKind] = useState<ItemKind>("task")
  const [title, setTitle] = useState("")
  const [mode, setMode] = useState<"linha" | "ia">("linha")

  useEffect(() => {
    if (!capture) return
    setKind(capture.kind ?? "task")
    setTitle(capture.title ?? "")
    setMode(capture.mode ?? "linha")
  }, [capture])

  const close = () => setUI({ capture: null })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    createItem(captureItem({ kind, title, byId: meId }, uid(), new Date()))
    toast.success("Guardado na sua caixa de entrada", { description: "Depois é só triar: dar área, dono e prazo." })
    setTitle("")
    close()
  }

  return (
    <Dialog open={capture !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className={cn("transition-[max-width] duration-300", mode === "ia" ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>Captura rápida</DialogTitle>
          <DialogDescription>
            {mode === "ia" ? "Escreva do seu jeito, uma ou várias tarefas. Você revisa tudo antes de criar." : "Escreva em uma linha. Vai para a sua caixa de entrada."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1" role="tablist" aria-label="Modo da captura">
          {(
            [
              { id: "linha", label: "Uma linha", Icon: TextCursorInputIcon },
              { id: "ia", label: "Estruturar com IA", Icon: SparklesIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
                mode === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        {mode === "ia" ? (
          <SmartCapture onClose={close} />
        ) : (
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo">
            {ITEM_KINDS.map((k) => {
              const Icon = KIND_ICON[k.id]
              const on = kind === k.id
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={k.hint}
                  onClick={() => setKind(k.id)}
                  className={cn(
                    "flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
                    on ? "border-brand bg-brand-soft text-brand" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {k.label}
                </button>
              )
            })}
          </div>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "decision" ? "O que precisa ser decidido?" : kind === "idea" ? "Qual é a ideia?" : kind === "note" ? "O que você quer registrar?" : "O que precisa ser feito?"}
            className="h-12 text-base"
            maxLength={200}
          />
          <SubmitRow onCancel={close} submitLabel="Guardar" disabled={!title.trim()} />
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
