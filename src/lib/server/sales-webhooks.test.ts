import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import { saleToTransaction, salesProvider } from "./sales-webhooks"

const hotmart = salesProvider("hotmart")!
const kiwify = salesProvider("kiwify")!
const req = (headers: Record<string, string>, url = "https://x/api/webhooks/hotmart", rawBody = "") => ({ headers: new Headers(headers), url, rawBody })

describe("webhooks de vendas", () => {
  it("Hotmart: só aceita o hottok certo", () => {
    expect(hotmart.verify(req({ "x-hotmart-hottok": "abc" }), "abc")).toBe(true)
    expect(hotmart.verify(req({ "x-hotmart-hottok": "abd" }), "abc")).toBe(false)
    expect(hotmart.verify(req({}), "abc")).toBe(false)
  })

  it("Hotmart: compra aprovada vira venda; outros eventos são ignorados", () => {
    const body = {
      event: "PURCHASE_APPROVED",
      data: { product: { name: "Curso X" }, buyer: { name: "Ana", email: "a@a.com" }, purchase: { transaction: "HP123", price: { value: 297.5 }, approved_date: Date.UTC(2026, 8, 30, 12) } },
    }
    expect(hotmart.parse(body)).toEqual({ externalId: "HP123", amountCents: 29750, productName: "Curso X", buyerName: "Ana", buyerEmail: "a@a.com", date: "2026-09-30" })
    expect(hotmart.parse({ ...body, event: "PURCHASE_REFUNDED" })).toBeNull()
  })

  it("Kiwify: confere a assinatura do corpo e lê o pedido pago", () => {
    const raw = JSON.stringify({ order_id: "K9", order_status: "paid", Product: { product_name: "Mentoria" }, Customer: { full_name: "Bia" }, Commissions: { my_commission: 45000 }, approved_date: "2026-09-29 10:00" })
    const sig = createHmac("sha1", "tok").update(raw).digest("hex")
    expect(kiwify.verify(req({}, `https://x/api/webhooks/kiwify?signature=${sig}`, raw), "tok")).toBe(true)
    expect(kiwify.verify(req({}, `https://x/api/webhooks/kiwify?signature=${sig}`, raw + " "), "tok")).toBe(false)
    expect(kiwify.parse(JSON.parse(raw))).toMatchObject({ externalId: "K9", amountCents: 45000, productName: "Mentoria", date: "2026-09-29" })
    expect(kiwify.parse({ order_id: "K9", order_status: "refunded" })).toBeNull()
  })

  it("vira entrada com id estável (não duplica) e produto casado pelo nome", () => {
    const tx = saleToTransaction(hotmart, { externalId: "HP 1", amountCents: 100, productName: "curso x", buyerName: "Ana", date: "2026-09-30" }, [{ id: "p1", name: "Curso X" }], "u2")
    expect(tx).toMatchObject({ id: "hotmart-HP_1", type: "entrada", productId: "p1", description: "curso x · Ana", createdById: "u2" })
  })
})
