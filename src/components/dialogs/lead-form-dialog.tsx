"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { stageLabel } from "@/lib/domain/constants"
import type { Temperature } from "@/lib/domain/types"
import { dueShortcuts, moneyInputValue, parseMoney } from "@/lib/format"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  DueDateField,
  Field,
  MoneyInput,
  OwnerToggle,
  SubmitRow,
  TemperatureToggle,
  submitOnModEnter,
} from "@/components/shared/fields"

export function LeadFormDialog() {
  const form = useUI((s) => s.leadForm)
  const setUI = useUI((s) => s.set)
  const meId = useStore((s) => s.meId)
  const createLead = useStore((s) => s.createLead)
  const router = useRouter()

  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [contact, setContact] = useState("")
  const [valueText, setValueText] = useState("")
  const [ownerId, setOwnerId] = useState(meId)
  const [temperature, setTemperature] = useState<Temperature | undefined>()
  const [actionText, setActionText] = useState("")
  const [actionDate, setActionDate] = useState<string | undefined>()
  const [tried, setTried] = useState(false)

  const open = form !== null

  useEffect(() => {
    if (!form) return
    const p = form.prefill ?? {}
    setName(p.name ?? "")
    setCompany(p.company ?? "")
    setContact(p.contact ?? "")
    setValueText(moneyInputValue(p.valueCents))
    setOwnerId(p.ownerId ?? meId)
    setTemperature(p.temperature)
    setActionText(p.nextAction?.text ?? "")
    setActionDate(p.nextAction?.dueDate ?? dueShortcuts()[1].value)
    setTried(false)
  }, [form, meId])

  const valueCents = parseMoney(valueText)
  const errors = {
    name: !name.trim(),
    value: valueCents === null,
    action: !actionText.trim(),
    date: !actionDate,
  }
  const invalid = Object.values(errors).some(Boolean)

  function close() {
    setUI({ leadForm: null })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (invalid) {
      const first = errors.name ? "lead-name" : errors.value ? "lead-value" : errors.action ? "lead-action" : null
      if (first) document.getElementById(first)?.focus()
      return
    }
    const lead = createLead({
      name,
      company,
      contact,
      valueCents: valueCents!,
      ownerId,
      temperature,
      stage: form?.prefill?.stage,
      nextAction: { text: actionText, dueDate: actionDate! },
    })
    form?.onCreated?.(lead)
    close()
    toast.success(`Lead "${lead.name}" criado em ${stageLabel(lead.stage)}`, {
      action: { label: "Abrir", onClick: () => router.push(`/pipeline/${lead.id}`) },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>Só o essencial: quem é, quanto vale e qual o próximo passo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome *" htmlFor="lead-name">
              <Input
                id="lead-name"
                autoFocus
                placeholder="Ex.: Ana Souza"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={tried && errors.name}
              />
            </Field>
            <Field label="Empresa" htmlFor="lead-company">
              <Input id="lead-company" placeholder="Opcional" value={company} onChange={(e) => setCompany(e.target.value)} />
            </Field>
            <Field label="Valor estimado *" htmlFor="lead-value">
              <MoneyInput id="lead-value" value={valueText} onChange={(t) => setValueText(t)} />
            </Field>
            <Field label="Contato" htmlFor="lead-contact">
              <Input id="lead-contact" placeholder="WhatsApp ou e-mail" value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-3 rounded-lg border border-dashed bg-muted/40 p-3">
            <Field label="Próxima ação *" hint="obrigatória — todo lead precisa de um próximo passo" htmlFor="lead-action">
              <Input
                id="lead-action"
                placeholder="Ex.: Ligar para apresentar a proposta"
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                aria-invalid={tried && errors.action}
                className="bg-background"
              />
            </Field>
            <DueDateField value={actionDate} onChange={setActionDate} />
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <Field label="Responsável">
              <OwnerToggle value={ownerId} onChange={setOwnerId} />
            </Field>
            <Field label="Temperatura">
              <TemperatureToggle value={temperature} onChange={setTemperature} />
            </Field>
          </div>

          {tried && invalid && (
            <p className="text-sm text-destructive">
              Falta preencher:{" "}
              {[errors.name && "nome", errors.value && "valor", errors.action && "próxima ação", errors.date && "data da ação"]
                .filter(Boolean)
                .join(", ")}
              .
            </p>
          )}
          <SubmitRow onCancel={close} submitLabel="Criar lead" />
        </form>
      </DialogContent>
    </Dialog>
  )
}
