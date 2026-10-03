import { describe, expect, it } from "vitest"
import { approvePatch, contactedPatch, dayStats, duration, greeting, isDiscarded, prospectQueue, rejectPatch, rejectionLabel } from "./prospecting"
import type { Lead } from "./types"

const lead = (p: Partial<Lead>): Lead => ({
  id: Math.random().toString(36).slice(2),
  name: "Empresa",
  stage: "novo",
  ownerId: "u1",
  valueCents: 0,
  nextAction: { text: "Primeiro contato", dueDate: "2026-10-01" },
  lastActivityAt: "2026-10-01T10:00:00Z",
  createdAt: "2026-10-01T10:00:00Z",
  ...p,
})

describe("prospecção", () => {
  it("fila: só pendentes, abertos, não contatados e do responsável; melhor oportunidade primeiro", () => {
    const a = lead({ id: "a", analysis: { qualificationScore: 6, siteScore: 3 } })
    const b = lead({ id: "b", analysis: { qualificationScore: 9, siteScore: 5 } })
    const c = lead({ id: "c", analysis: { qualificationScore: 6, siteScore: 2 } })
    const old = lead({ id: "d", createdAt: "2026-09-01T00:00:00Z" })
    const outros = [
      lead({ id: "rej", review: { status: "rejected" } }),
      lead({ id: "apr", review: { status: "approved" } }),
      lead({ id: "contatado", contactStatus: "contacted" }),
      lead({ id: "ganho", stage: "ganho" }),
      lead({ id: "dele", ownerId: "u2" }),
    ]
    expect(prospectQueue([a, b, c, old, ...outros], "u1").map((l) => l.id)).toEqual(["b", "c", "a", "d"])
    expect(prospectQueue([a, outros[4]]).map((l) => l.id)).toEqual(["a", "dele"])
  })

  it("saudação pelo horário local", () => {
    expect(greeting(new Date(2026, 9, 3, 11, 59))).toBe("Bom dia, tudo bem?")
    expect(greeting(new Date(2026, 9, 3, 12, 0))).toBe("Boa tarde, tudo bem?")
  })

  it("aprovar e descartar guardam quem/quando/por quê sem apagar a análise", () => {
    const l = lead({ analysis: { siteScore: 4, problems: ["lento"] } })
    const ap = approvePatch(l, "u2", "2026-10-03T10:00:00Z")
    expect(ap.review).toEqual({ status: "approved", approvedAt: "2026-10-03T10:00:00Z", approvedBy: "u2" })
    const rj = rejectPatch(l, "u1", "2026-10-03T11:00:00Z", "simples_funcional", "  funciona bem no celular  ")
    expect(rj.review).toMatchObject({ status: "rejected", rejectedBy: "u1", rejectionReason: "simples_funcional", rejectionNotes: "funciona bem no celular" })
    expect(isDiscarded({ ...l, ...rj })).toBe(true)
    expect({ ...l, ...rj }.analysis).toEqual({ siteScore: 4, problems: ["lento"] })
    expect(rejectionLabel("ia_errou")).toBe("Análise da IA estava errada")
  })

  it("contato confirmado: lead novo vira 'contato feito'; etapa mais avançada não volta", () => {
    expect(contactedPatch({ stage: "novo" }, "Bom dia, tudo bem?", "2026-10-03T10:00:00Z")).toEqual({
      contactStatus: "contacted",
      firstContactAt: "2026-10-03T10:00:00Z",
      firstContactMessage: "Bom dia, tudo bem?",
      firstContactChannel: "whatsapp",
      stage: "contato",
    })
    expect(contactedPatch({ stage: "proposta" }, "x", "t").stage).toBe("proposta")
  })

  it("contadores do dia e duração", () => {
    const now = new Date(2026, 9, 3, 15)
    const today = new Date(2026, 9, 3, 9).toISOString()
    const leads = [
      lead({ firstContactAt: today, review: { status: "approved", approvedAt: today, approvedBy: "u1" } }),
      lead({ review: { status: "rejected", rejectedAt: today, rejectedBy: "u1" } }),
      lead({ review: { status: "rejected", rejectedAt: "2026-10-01T09:00:00Z", rejectedBy: "u1" } }),
    ]
    expect(dayStats(leads, now, "u1")).toEqual({ contacted: 1, rejected: 1, approved: 1 })
    expect(duration(185_000)).toBe("3 min 05 s")
    expect(duration(42_000)).toBe("42 s")
  })
})
