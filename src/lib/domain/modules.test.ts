import { describe, expect, it } from "vitest"
import type { Lead, Transaction } from "./types"
import { productStats, safeUrl } from "./products"
import { accountTree, engagementRate, metricsByAccount, safeFileName, type ContentAccount, type ContentItem } from "./content"

const NOW = new Date(2025, 9, 15, 10)

describe("produtos", () => {
  it("safeUrl aceita só http(s) e bloqueia javascript:", () => {
    expect(safeUrl("hotmart.com/produto")).toBe("https://hotmart.com/produto")
    expect(safeUrl("https://pay.kiwify.com.br/x")).toBe("https://pay.kiwify.com.br/x")
    expect(safeUrl("javascript:alert(1)")).toBeNull()
    expect(safeUrl("data:text/html,<script>")).toBeNull()
    expect(safeUrl("   ")).toBeNull()
  })

  it("productStats soma leads, conversão e financeiro do produto", () => {
    const lead = (p: Partial<Lead>): Lead => ({
      id: Math.random().toString(),
      name: "L",
      stage: "contato",
      ownerId: "u1",
      valueCents: 1000,
      nextAction: { text: "x", dueDate: "2025-10-15" },
      lastActivityAt: NOW.toISOString(),
      createdAt: NOW.toISOString(),
      productId: "p1",
      ...p,
    })
    const tx = (p: Partial<Transaction>): Transaction => ({
      id: Math.random().toString(),
      type: "entrada",
      amountCents: 0,
      category: "Serviços",
      description: "",
      date: "2025-10-10",
      createdById: "u1",
      productId: "p1",
      ...p,
    })
    const s = productStats(
      "p1",
      [lead({}), lead({ stage: "ganho" }), lead({ stage: "perdido" }), lead({ stage: "ganho" }), lead({ productId: "p2" })],
      [tx({ amountCents: 5000 }), tx({ amountCents: 2000, date: "2025-09-01" }), tx({ type: "saida", amountCents: 1500 }), tx({ productId: undefined, amountCents: 9 })],
      NOW,
    )
    expect(s).toMatchObject({
      leads: 4,
      openLeads: 1,
      wonLeads: 2,
      lostLeads: 1,
      pipelineCents: 1000,
      incomeCents: 7000,
      expenseCents: 1500,
      netCents: 5500,
      incomeMonthCents: 5000,
    })
    expect(s.conversion).toBeCloseTo(2 / 3)
  })
})

describe("conteúdos", () => {
  const acc = (p: Partial<ContentAccount>): ContentAccount => ({
    id: "a",
    name: "A",
    platform: "youtube",
    role: "principal",
    active: true,
    createdAt: NOW.toISOString(),
    ...p,
  })

  it("accountTree agrupa cortes sob a conta principal", () => {
    const t = accountTree([
      acc({ id: "p" }),
      acc({ id: "c1", role: "cortes", parentId: "p" }),
      acc({ id: "c2", role: "cortes", parentId: "p" }),
      acc({ id: "c3", role: "cortes" }),
    ])
    expect(t.groups[0].cuts.map((c) => c.id)).toEqual(["c1", "c2"])
    expect(t.orphanCuts.map((c) => c.id)).toEqual(["c3"])
  })

  it("metricsByAccount soma só publicações publicadas", () => {
    const item = (posts: ContentItem["posts"]): ContentItem => ({
      id: Math.random().toString(),
      title: "V",
      format: "short",
      stage: "publicado",
      ownerId: "u1",
      assets: [],
      posts,
      createdAt: NOW.toISOString(),
    })
    const m = metricsByAccount([
      item([{ id: "1", accountId: "a", status: "publicado", source: "manual", metrics: { views: 100, likes: 10, comments: 2, shares: 3, saves: 5 } }]),
      item([
        { id: "2", accountId: "a", status: "publicado", source: "manual", metrics: { views: 50, likes: 5, comments: 0, shares: 0, saves: 0 } },
        { id: "3", accountId: "b", status: "planejado", source: "manual" },
      ]),
    ])
    expect(m.get("a")).toEqual({ posts: 2, metrics: { views: 150, likes: 15, comments: 2, shares: 3, saves: 5 } })
    expect(m.has("b")).toBe(false)
    expect(engagementRate(m.get("a")!.metrics)).toBeCloseTo(25 / 150)
  })

  it("safeFileName remove acentos, espaços e caminhos", () => {
    expect(safeFileName("Vídeo Bruto Final (1).mp4")).toBe("Video-Bruto-Final-1-.mp4")
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd")
  })
})
