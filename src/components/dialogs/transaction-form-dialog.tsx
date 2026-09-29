"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CATEGORIES } from "@/lib/domain/constants"
import type { TransactionType } from "@/lib/domain/types"
import { money, moneyInputValue, parseMoney, toDateKey, today } from "@/lib/format"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { CalendarChip, Chip, Field, LeadSelect, MoneyInput, ProductSelect, Segmented, SubmitRow, submitOnModEnter } from "@/components/shared/fields"
import { addDays } from "date-fns"

export function TransactionFormDialog() {
  const form = useUI((s) => s.txForm)
  const setUI = useUI((s) => s.set)
  const createTransaction = useStore((s) => s.createTransaction)

  const [type, setType] = useState<TransactionType>("entrada")
  const [valueText, setValueText] = useState("")
  const [category, setCategory] = useState(CATEGORIES.entrada[0])
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(today())
  const [leadId, setLeadId] = useState<string | undefined>()
  const [productId, setProductId] = useState<string | undefined>()
  const leads = useStore((s) => s.leads)

  useEffect(() => {
    if (!form) return
    const p = form.prefill ?? {}
    const t = p.type ?? "entrada"
    setType(t)
    setValueText(moneyInputValue(p.amountCents))
    setCategory(p.category ?? CATEGORIES[t][0])
    setDescription(p.description ?? "")
    setDate(p.date ?? today())
    setLeadId(p.leadId)
    setProductId(p.productId)
  }, [form])

  const cents = parseMoney(valueText)
  const valid = cents !== null && cents > 0

  function close() {
    setUI({ txForm: null })
  }

  function changeType(t: TransactionType) {
    setType(t)
    setCategory(CATEGORIES[t][0])
    if (t === "saida") setLeadId(undefined)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const tx = createTransaction({
      type,
      amountCents: cents!,
      category,
      description: description.trim() || category,
      date,
      leadId: type === "entrada" ? leadId : undefined,
      productId,
    })
    form?.onCreated?.(tx)
    close()
    toast.success(`${type === "entrada" ? "Entrada" : "Saída"} de ${money(tx.amountCents)} registrada`)
  }

  const yesterday = toDateKey(addDays(new Date(), -1))

  return (
    <Dialog open={form !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lançamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Segmented
            value={type}
            onChange={changeType}
            className="w-fit"
            options={[
              { value: "entrada", label: "↓ Entrada" },
              { value: "saida", label: "↑ Saída" },
            ]}
          />
          <Field label="Valor *">
            <MoneyInput value={valueText} onChange={(t) => setValueText(t)} autoFocus />
          </Field>
          <Field label="Categoria">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES[type].map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Descrição">
            <Input placeholder={category} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Data">
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={date === today()} onClick={() => setDate(today())}>
                Hoje
              </Chip>
              <Chip active={date === yesterday} onClick={() => setDate(yesterday)}>
                Ontem
              </Chip>
              <CalendarChip value={date} onChange={setDate} highlight={date !== today() && date !== yesterday} />
            </div>
          </Field>
          {type === "entrada" && (
            <Field label="Veio de um negócio do pipeline?" hint="opcional">
              <LeadSelect
                value={leadId}
                onChange={(id) => {
                  setLeadId(id)
                  // O produto do lead vira o produto do lançamento (dá para trocar).
                  const lp = leads.find((l) => l.id === id)?.productId
                  if (lp && !productId) setProductId(lp)
                }}
                includeClosed
              />
            </Field>
          )}
          <Field label="Produto" hint="opcional · para ver entradas e saídas por produto">
            <ProductSelect value={productId} onChange={setProductId} />
          </Field>
          <SubmitRow onCancel={close} submitLabel="Registrar" disabled={!valid} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
