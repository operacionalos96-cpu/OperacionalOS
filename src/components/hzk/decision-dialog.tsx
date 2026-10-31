"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { PlusIcon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { emptyDecision, routeDecision } from "@/lib/domain/items"
import type { DecisionData, Task } from "@/lib/domain/types"
import { moneyInputValue, uid } from "@/lib/format"
import { notify } from "@/lib/notifications"
import { useStore } from "@/lib/store"
import { useAreaList, useCeoLimit, usePeople } from "@/lib/use-hzk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DueDateField, Field, MoneyInput, SubmitRow, submitOnModEnter } from "@/components/shared/fields"
import { AreaSelect } from "./item-bits"

const INVOLVES: { id: DecisionData["involves"][number]; label: string }[] = [
  { id: "dinheiro", label: "Dinheiro" },
  { id: "contrato", label: "Contrato" },
  { id: "contratacao", label: "Contratação" },
  { id: "estrategia", label: "Estratégia" },
]

/**
 * Formulário da decisão: pergunta, contexto, opções, recomendação, prazo e tipo de porta.
 * Mostra ao vivo QUEM vai decidir e POR QUÊ (regra em src/lib/domain/items.ts › routeDecision).
 * Salvar = a decisão sai da caixa de entrada e quem decide é avisado.
 */
export function DecisionDialog({ item, open, onOpenChange }: { item?: Task; open: boolean; onOpenChange: (o: boolean) => void }) {
  const meId = useStore((s) => s.meId)
  const createItem = useStore((s) => s.createItem)
  const updateItem = useStore((s) => s.updateItem)
  const areas = useAreaList()
  const people = usePeople()
  const limitCents = useCeoLimit()

  const [title, setTitle] = useState("")
  const [areaId, setAreaId] = useState<string | undefined>()
  const [dueDate, setDueDate] = useState<string | undefined>()
  const [d, setD] = useState<DecisionData>(emptyDecision())
  const [newOption, setNewOption] = useState("")
  const [amountText, setAmountText] = useState("")

  useEffect(() => {
    if (!open) return
    setTitle(item?.title ?? "")
    setAreaId(item?.areaId)
    setDueDate(item?.dueDate)
    setD(item?.decision ?? emptyDecision())
    setAmountText(moneyInputValue(item?.decision?.amountCents))
  }, [open, item])

  const route = useMemo(() => routeDecision(d, areaId, { areas, people, limitCents, proposerId: meId }), [d, areaId, areas, people, limitCents, meId])
  const patch = (p: Partial<DecisionData>) => setD((x) => ({ ...x, ...p }))

  function addOption() {
    const label = newOption.trim()
    if (!label) return
    patch({ options: [...d.options, { id: uid(), label }] })
    setNewOption("")
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const deciderId = route.deciderIds[0]
    const decision: DecisionData = { ...d, deciderId, deciderIds: route.deciderIds, deciderReason: route.reason, status: d.status === "mais_contexto" ? "pendente" : d.status }
    const fields = { title: title.trim(), kind: "decision" as const, areaId, dueDate, decision, inbox: false, ownerId: item?.ownerId || meId, triagedAt: new Date().toISOString().slice(0, 10) }
    const id = item?.id ?? uid()
    if (item) updateItem(item.id, fields)
    else createItem({ id, createdAt: new Date().toISOString(), done: false, createdById: meId, origin: "manual", ...fields })
    notify([...route.deciderIds, ...route.okFromIds], { kind: "decisao", title: `Decisão para você: ${title.trim()}`, href: "/decisoes", fromId: meId })
    toast.success("Decisão enviada", { description: route.deciderIds.map((x) => getUser(x).name).join(" e ") + " vai decidir." })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{item ? "Detalhar decisão" : "Nova decisão"}</DialogTitle>
          <DialogDescription>Algo a escolher. Quem decide é definido pela regra da HZK, mostrada abaixo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Field label="Pergunta" htmlFor="dec-q">
            <Input id="dec-q" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Contratar um editor de vídeo fixo?" autoFocus maxLength={200} />
          </Field>
          <Field label="Contexto" hint="o que quem decide precisa saber">
            <Textarea value={d.context ?? ""} onChange={(e) => patch({ context: e.target.value })} rows={3} />
          </Field>

          <Field label="Opções">
            <div className="grid gap-2">
              {d.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ recommendation: d.recommendation === o.id ? undefined : o.id })}
                    className={cn("h-10 flex-1 rounded-lg border px-3 text-left text-sm", d.recommendation === o.id ? "border-brand bg-brand-soft" : "bg-card")}
                    title="Clique para marcar como sua recomendação"
                  >
                    {o.label} {d.recommendation === o.id && <span className="ml-1 text-xs font-semibold text-brand">· recomendada</span>}
                  </button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Tirar ${o.label}`} onClick={() => patch({ options: d.options.filter((x) => x.id !== o.id), recommendation: d.recommendation === o.id ? undefined : d.recommendation })}>
                    <XIcon />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input value={newOption} onChange={(e) => setNewOption(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())} placeholder="Escreva uma opção e aperte Enter" />
                <Button type="button" variant="outline" onClick={addOption} aria-label="Adicionar opção">
                  <PlusIcon />
                </Button>
              </div>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Área" htmlFor="dec-area">
              <AreaSelect id="dec-area" value={areaId} onChange={setAreaId} />
            </Field>
            <Field label="Prazo para decidir">
              <DueDateField value={dueDate} onChange={setDueDate} />
            </Field>
          </div>

          <Field label="Dá para desfazer depois?">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["reversivel", "Sim, dá para voltar atrás"],
                  ["irreversivel", "Não, é difícil desfazer"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" onClick={() => patch({ door: id })} className={cn("h-11 rounded-lg border text-sm", d.door === id ? "border-brand bg-brand-soft font-medium text-brand" : "bg-card text-muted-foreground")}>
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Envolve">
            <div className="flex flex-wrap gap-2">
              {INVOLVES.map((x) => {
                const on = d.involves.includes(x.id)
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => patch({ involves: on ? d.involves.filter((y) => y !== x.id) : [...d.involves, x.id] })}
                    className={cn("h-10 rounded-full border px-4 text-sm", on ? "border-brand bg-brand-soft font-medium text-brand" : "bg-card text-muted-foreground")}
                  >
                    {x.label}
                  </button>
                )
              })}
            </div>
          </Field>
          {d.involves.includes("dinheiro") && (
            <Field label="Valor" hint={limitCents == null ? "ainda não há limite para ir à CEO" : undefined}>
              <MoneyInput
                value={amountText}
                onChange={(text, cents) => {
                  setAmountText(text)
                  patch({ amountCents: cents ?? undefined })
                }}
              />
            </Field>
          )}

          {/* Quem decide, ao vivo: a regra explicada em uma frase. */}
          <div className="rounded-xl border bg-muted/50 p-3 text-sm">
            <p className="font-medium">
              Quem decide: {route.deciderIds.map((x) => getUser(x).name).join(" e ")}
              {route.okFromIds.length > 0 && <> · precisa do ok de {route.okFromIds.map((x) => getUser(x).name).join(" e ")}</>}
            </p>
            <p className="t-desc mt-0.5">{route.reason}</p>
          </div>

          <SubmitRow onCancel={() => onOpenChange(false)} submitLabel="Enviar para decidir" disabled={!title.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
