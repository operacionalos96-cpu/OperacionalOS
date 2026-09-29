"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2Icon, PartyPopperIcon } from "lucide-react"
import { STAGES, isOpenStage, stageLabel } from "@/lib/domain/constants"
import type { Lead, Stage } from "@/lib/domain/types"
import { dueShortcuts, money, moneyInputValue, parseMoney, today } from "@/lib/format"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Chip, DueDateField, Field, MoneyInput, SubmitRow, submitOnModEnter } from "@/components/shared/fields"

/**
 * Lead do diálogo aberto. Mantém o último lead visível durante a animação de
 * fechamento (senão o conteúdo some e o diálogo "pisca" vazio).
 */
function useDialogLead(leadId: string | null) {
  const current = useStore((s) => s.leads.find((l) => l.id === leadId))
  const last = useRef<Lead | undefined>(current)
  if (current) last.current = current
  return { lead: last.current, open: !!current }
}

/**
 * Único caminho para mudar o estágio de um lead (arrastar, botão, menu).
 * Ganho → oferece registrar entrada. Perdido → pede motivo. Outros → desfazer.
 */
export function moveLeadTo(lead: Lead, stage: Stage) {
  if (lead.stage === stage) return
  const { moveLead } = useStore.getState()
  const ui = useUI.getState()
  if (stage === "perdido") {
    ui.set({ lostFor: lead.id })
    return
  }
  const previous = lead.stage
  moveLead(lead.id, stage)
  if (stage === "ganho") {
    ui.set({ wonFor: lead.id })
    return
  }
  toast(`${lead.name} → ${stageLabel(stage)}`, {
    action: { label: "Desfazer", onClick: () => useStore.getState().moveLead(lead.id, previous) },
  })
}

/** Conclui a próxima ação e já pede a seguinte (o lead nunca fica sem próximo passo). */
export function NextActionDialog() {
  const leadId = useUI((s) => s.nextActionFor)
  const setUI = useUI((s) => s.set)
  const { lead, open } = useDialogLead(leadId)
  const completeNextAction = useStore((s) => s.completeNextAction)

  const [text, setText] = useState("")
  const [date, setDate] = useState<string | undefined>()
  const [stage, setStage] = useState<Stage>("novo")

  useEffect(() => {
    if (!leadId || !lead) return
    setText("")
    setDate(dueShortcuts()[2].value)
    setStage(lead.stage)
    // só reinicia ao abrir para outro lead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  function close() {
    setUI({ nextActionFor: null })
  }

  const closing = !isOpenStage(stage)
  const valid = closing || (!!text.trim() && !!date)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || !valid) return
    completeNextAction(lead.id, closing ? undefined : { text, dueDate: date! })
    const fresh = useStore.getState().leads.find((l) => l.id === lead.id)!
    close()
    if (stage !== lead.stage) moveLeadTo(fresh, stage)
    else toast.success("Ação concluída", { description: `Próxima: ${text.trim()}` })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2Icon className="size-4 text-emerald-600" /> Feito! E agora?
              </DialogTitle>
              <DialogDescription>
                <span className="line-through">{lead.nextAction.text}</span> · {lead.name}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
              <Field label="O lead mudou de estágio?">
                <div className="flex flex-wrap gap-1.5">
                  {STAGES.map((s) => (
                    <Chip key={s.id} active={stage === s.id} onClick={() => setStage(s.id)}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </Field>
              {!closing && (
                <>
                  <Field label="Próxima ação *">
                    <Input autoFocus placeholder="Ex.: Enviar proposta revisada" value={text} onChange={(e) => setText(e.target.value)} />
                  </Field>
                  <DueDateField value={date} onChange={setDate} />
                </>
              )}
              <SubmitRow onCancel={close} submitLabel="Salvar" disabled={!valid} />
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Negócio ganho → registrar a entrada no financeiro, já vinculada. */
export function WonDialog() {
  const leadId = useUI((s) => s.wonFor)
  const setUI = useUI((s) => s.set)
  const { lead, open } = useDialogLead(leadId)
  const createTransaction = useStore((s) => s.createTransaction)
  const [valueText, setValueText] = useState("")

  useEffect(() => {
    if (leadId && lead) setValueText(moneyInputValue(lead.valueCents))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  function close() {
    setUI({ wonFor: null })
  }

  const cents = parseMoney(valueText)

  function register(e: React.FormEvent) {
    e.preventDefault()
    if (!lead || !cents) return
    createTransaction({
      type: "entrada",
      amountCents: cents,
      category: "Serviços",
      description: `${lead.name}${lead.company ? ` — ${lead.company}` : ""}`,
      date: today(),
      leadId: lead.id,
    })
    close()
    toast.success(`Entrada de ${money(cents)} registrada no financeiro`)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-sm">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PartyPopperIcon className="size-4 text-emerald-600" /> Negócio ganho!
              </DialogTitle>
              <DialogDescription>
                {lead.name} foi para Ganho. Quer registrar a entrada no caixa agora?
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={register} className="grid gap-4">
              <Field label="Valor recebido (hoje)">
                <MoneyInput value={valueText} onChange={(t) => setValueText(t)} autoFocus />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={close}>
                  Ainda não recebi
                </Button>
                <Button type="submit" disabled={!cents}>
                  Registrar entrada
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const LOST_REASONS = ["Preço", "Timing", "Escolheu concorrente", "Sem resposta", "Não era o perfil"]

export function LostDialog() {
  const leadId = useUI((s) => s.lostFor)
  const setUI = useUI((s) => s.set)
  const { lead, open } = useDialogLead(leadId)
  const moveLead = useStore((s) => s.moveLead)
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (leadId) setReason("")
  }, [leadId])

  function close() {
    setUI({ lostFor: null })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lead) return
    const previous = lead.stage
    moveLead(lead.id, "perdido", { lostReason: reason.trim() })
    close()
    toast(`${lead.name} marcado como perdido`, {
      action: { label: "Desfazer", onClick: () => useStore.getState().moveLead(lead.id, previous) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-sm">
        {lead && (
          <>
            <DialogHeader>
              <DialogTitle>Marcar {lead.name} como perdido?</DialogTitle>
              <DialogDescription>O motivo é opcional, mas ajuda a aprender com o pipeline.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="grid gap-3">
              <div className="flex flex-wrap gap-1.5">
                {LOST_REASONS.map((r) => (
                  <Chip key={r} active={reason === r} onClick={() => setReason(r)}>
                    {r}
                  </Chip>
                ))}
              </div>
              <Input placeholder="Outro motivo…" value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={close}>
                  Cancelar
                </Button>
                <Button type="submit" variant="destructive">
                  Marcar como perdido
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
