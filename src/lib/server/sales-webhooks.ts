import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Vendas que chegam sozinhas (Hotmart, Kiwify…) viram ENTRADA no financeiro.
 * Cada plataforma = um item em SALES_PROVIDERS: como verificar que veio dela e
 * como ler a venda. Integração nova = mais um item aqui (o resto é igual).
 *
 * Segurança: sem o segredo configurado na Vercel, a rota recusa tudo (falha fechada).
 * Idempotente: o id do lançamento vem do id da venda — a mesma venda 2x não duplica.
 */
export interface Sale {
  /** id da venda na plataforma */
  externalId: string
  amountCents: number
  productName?: string
  buyerName?: string
  buyerEmail?: string
  /** YYYY-MM-DD */
  date: string
}

export interface SalesProvider {
  id: string
  label: string
  /** Variável de ambiente com o segredo/token da plataforma. */
  secretEnv: string
  verify(req: { headers: Headers; url: string; rawBody: string }, secret: string): boolean
  /** null = evento que não é venda aprovada (ignorado com 200). */
  parse(body: unknown): Sale | null
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {})
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined)
const toDate = (v: unknown) => {
  const d = typeof v === "number" ? new Date(v) : typeof v === "string" ? new Date(v.replace(" ", "T")) : new Date()
  return (isNaN(d.getTime()) ? new Date() : d).toISOString().slice(0, 10)
}

export const SALES_PROVIDERS: SalesProvider[] = [
  {
    id: "hotmart",
    label: "Hotmart",
    secretEnv: "HOTMART_HOTTOK",
    // Hotmart manda o "hottok" no cabeçalho X-HOTMART-HOTTOK.
    verify: (req, secret) => safeEqual(req.headers.get("x-hotmart-hottok") ?? "", secret),
    parse(body) {
      const b = obj(body)
      if (!["PURCHASE_APPROVED", "PURCHASE_COMPLETE"].includes(String(b.event))) return null
      const data = obj(b.data)
      const purchase = obj(data.purchase)
      const price = obj(purchase.price)
      const value = Number(price.value)
      const externalId = str(purchase.transaction)
      if (!externalId || !(value > 0)) return null
      const buyer = obj(data.buyer)
      return {
        externalId,
        amountCents: Math.round(value * 100),
        productName: str(obj(data.product).name),
        buyerName: str(buyer.name),
        buyerEmail: str(buyer.email),
        date: toDate(purchase.approved_date),
      }
    },
  },
  {
    id: "kiwify",
    label: "Kiwify",
    secretEnv: "KIWIFY_TOKEN",
    // Kiwify assina o corpo: ?signature= HMAC-SHA1(corpo, token) em hex.
    verify: (req, secret) => {
      const sig = new URL(req.url).searchParams.get("signature") ?? ""
      return safeEqual(sig, createHmac("sha1", secret).update(req.rawBody).digest("hex"))
    },
    parse(body) {
      const b = obj(body)
      if (String(b.order_status) !== "paid") return null
      const externalId = str(b.order_id)
      const commissions = obj(b.Commissions)
      // Valor que fica para nós (comissão) se vier; senão o valor cobrado. Já vem em centavos.
      const cents = Number(commissions.my_commission ?? commissions.charge_amount)
      if (!externalId || !(cents > 0)) return null
      const customer = obj(b.Customer)
      return {
        externalId,
        amountCents: Math.round(cents),
        productName: str(obj(b.Product).product_name),
        buyerName: str(customer.full_name),
        buyerEmail: str(customer.email),
        date: toDate(b.approved_date ?? b.created_at),
      }
    },
  },
]

export const salesProvider = (id: string) => SALES_PROVIDERS.find((p) => p.id === id)

/** Lançamento de entrada a partir da venda (produto casado pelo nome, sem diferenciar maiúsculas). */
export function saleToTransaction(provider: SalesProvider, sale: Sale, products: { id: string; name: string }[], createdById: string) {
  const norm = (s: string) => s.trim().toLowerCase()
  const product = sale.productName ? products.find((p) => norm(p.name) === norm(sale.productName!)) : undefined
  return {
    id: `${provider.id}-${sale.externalId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96),
    type: "entrada" as const,
    amountCents: sale.amountCents,
    category: "Vendas",
    description: [sale.productName ?? `Venda ${provider.label}`, sale.buyerName].filter(Boolean).join(" · "),
    date: sale.date,
    productId: product?.id,
    createdById,
    source: provider.id,
  }
}
