"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { stageLabel } from "@/lib/domain/constants"
import type { Temperature } from "@/lib/domain/types"
import { dueShortcuts, moneyInputValue, parseMoney } from "@/lib/format"
import { useStore } from "@/lib/store"
import { nextOwner, openCounts } from "@/lib/domain/distribution"
import { useTeam } from "@/lib/use-team"
import { safeUrl } from "@/lib/domain/products"
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
  submitOnModEnter, ProductSelect } from "@/components/shared/fields"

export function LeadFormDialog() {
  const TEAM = useTeam()
  const form = useUI((s) => s.leadForm)
  const setUI = useUI((s) => s.set)
  const meId = useStore((s) => s.meId)
  const allLeads = useStore((s) => s.leads)
  const createLead = useStore((s) => s.createLead)
  const router = useRouter()

  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [contact, setContact] = useState("")
  const [website, setWebsite] = useState("")
  const [valueText, setValueText] = useState("")
  const [ownerId, setOwnerId] = useState(meId)
  const [temperature, setTemperature] = useState<Temperature | undefined>()
  const [productId, setProductId] = useState<string | undefined>()
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
    setWebsite(p.website ?? "")
    setValueText(moneyInputValue(p.valueCents))
    // Sem dono definido: vai para quem tem menos leads abertos (divisão meio a meio).
    setOwnerId(p.ownerId ?? nextOwner(useStore.getState().leads, TEAM.map((u) => u.id), p.productId))
    setTemperature(p.temperature)
    setProductId(p.productId)
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
      website: safeUrl(website) ?? undefined,
      valueCents: valueCents!,
      ownerId,
      temperature,
      productId,
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
          <p className="t-label -mb-2">Quem é</p>
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
            <Field label="WhatsApp / contato" htmlFor="lead-contact">
              <Input id="lead-contact" placeholder="(11) 90000-0000 ou e-mail" value={contact} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label="Site" hint="opcional" htmlFor="lead-site">
              <Input id="lead-site" placeholder="https://…" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </Field>
            <Field label="Valor estimado *" htmlFor="lead-value">
              <MoneyInput id="lead-value" value={valueText} onChange={(t) => setValueText(t)} />
            </Field>
            <Field label="Produto de interesse" hint="opcional">
              <ProductSelect value={productId} onChange={setProductId} />
            </Field>
          </div>

          <p className="t-label -mb-2">Próximo passo</p>

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
            <Field
              label="Responsável"
              hint={`automático: quem tem menos (${TEAM.map((u) => `${u.name} ${openCounts(allLeads, TEAM.map((t) => t.id)).get(u.id)}`).join(" · ")})`}
            >
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
