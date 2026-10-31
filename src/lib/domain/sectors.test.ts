import { describe, expect, it } from "vitest"
import type { ContentItem } from "./content"
import { sectorSteps } from "./sectors"
import type { Lead, Transaction } from "./types"

const now = new Date("2026-11-02T10:00:00")
const lead = (over: Partial<Lead>): Lead =>
  ({ id: Math.random().toString(36).slice(2), name: "L", stage: "novo", ownerId: "u2", createdAt: "2026-10-01", lastActivityAt: "2026-11-01", nextAction: { text: "", dueDate: "2026-11-10" }, ...over }) as Lead
const content = (over: Partial<ContentItem>): ContentItem => ({ id: Math.random().toString(36).slice(2), title: "C", format: "reels", stage: "roteiro", ownerId: "u2", assets: [], posts: [], createdAt: "2026-10-01", ...over })

describe("próximo passo de cada setor", () => {
  it("cada cartão aponta para a aba exata da ação, com os números da própria tela", () => {
    const steps = sectorSteps("u2", now, {
      leads: [lead({}), lead({}), lead({ stage: "contato", nextAction: { text: "Ligar", dueDate: "2026-11-01" } }), lead({ ownerId: "u1" })],
      funnel: [],
      content: [content({ dueDate: "2026-11-01" }), content({ stage: "publicado" })],
      transactions: [{ id: "t", type: "saida", amountCents: 100, description: "DAS", category: "Impostos", date: "2026-10-28", dueDate: "2026-10-30", status: "previsto" } as Transaction],
      myAreaIds: ["conteudo"],
    })
    const by = Object.fromEntries(steps.map((s) => [s.id, s]))
    expect(steps[0].id).toBe("conteudo")
    expect(by.prospeccao).toMatchObject({ count: 2, href: "/prospeccao?aba=fila", text: "2 leads na fila para revisar" })
    expect(by.pipeline).toMatchObject({ count: 1, href: "/pipeline?view=acao&dono=meus" })
    expect(by.conteudo).toMatchObject({ count: 1, href: "/conteudos?aba=producao" })
    expect(by.financeiro).toMatchObject({ count: 1, href: "/financeiro?aba=pagar", text: "1 conta a pagar vencida" })
  })
})
