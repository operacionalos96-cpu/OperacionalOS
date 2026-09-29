"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PRODUCT_KINDS, PRODUCT_STATUSES, type Product, type ProductKind, type ProductStatus } from "@/lib/domain/products"
import { moneyInputValue, parseMoney, uid } from "@/lib/format"
import { useProducts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Chip, Field, MoneyInput, OwnerToggle, SubmitRow, submitOnModEnter } from "@/components/shared/fields"

/** Criar (product = null) ou editar um produto. */
export function ProductFormDialog({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean
  product: Product | null
  onClose: () => void
  onSaved?: (p: Product) => void
}) {
  const meId = useStore((s) => s.meId)
  const save = useProducts((s) => s.save)
  const [name, setName] = useState("")
  const [kind, setKind] = useState<ProductKind>("infoproduto")
  const [status, setStatus] = useState<ProductStatus>("ativo")
  const [priceText, setPriceText] = useState("")
  const [description, setDescription] = useState("")
  const [ownerId, setOwnerId] = useState(meId)

  useEffect(() => {
    if (!open) return
    setName(product?.name ?? "")
    setKind(product?.kind ?? "infoproduto")
    setStatus(product?.status ?? "ativo")
    setPriceText(moneyInputValue(product?.priceCents))
    setDescription(product?.description ?? "")
    setOwnerId(product?.ownerId ?? meId)
  }, [open, product, meId])

  const priceCents = priceText.trim() ? parseMoney(priceText) : undefined
  const valid = name.trim().length > 0 && priceCents !== null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const saved = save({
      id: product?.id ?? uid(),
      links: product?.links ?? [],
      createdAt: product?.createdAt ?? new Date().toISOString(),
      name: name.trim(),
      kind,
      status,
      priceCents: priceCents ?? undefined,
      description: description.trim() || undefined,
      ownerId,
    })
    toast.success(product ? "Produto atualizado" : `Produto "${saved.name}" criado`)
    onSaved?.(saved)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>Links, leads e lançamentos você liga depois, na página do produto.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Field label="Nome *">
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Mentoria Operação Enxuta" className="h-10 text-base" />
          </Field>
          <Field label="Tipo">
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_KINDS.map((k) => (
                <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                  {k.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Status">
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_STATUSES.map((s) => (
                <Chip key={s.id} active={status === s.id} onClick={() => setStatus(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preço" hint="opcional">
              <MoneyInput value={priceText} onChange={(t) => setPriceText(t)} />
            </Field>
            <Field label="Responsável">
              <OwnerToggle value={ownerId} onChange={setOwnerId} />
            </Field>
          </div>
          <Field label="Descrição" hint="o que é, para quem, promessa">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" />
          </Field>
          <SubmitRow onCancel={onClose} submitLabel={product ? "Salvar" : "Criar produto"} disabled={!valid} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
