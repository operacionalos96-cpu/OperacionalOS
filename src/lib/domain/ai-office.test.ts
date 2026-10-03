import { describe, expect, it } from "vitest"
import { defaultAgents, describeEvent, makeEvent, moveHypothesis, type Hypothesis } from "./ai-office"

describe("AI Office", () => {
  it("4 agentes com ids fixos e campos obrigatórios, sem amarrar a um modelo", () => {
    const agents = defaultAgents("2026-10-03T00:00:00Z")
    expect(agents.map((a) => a.id)).toEqual(["prospector", "web-analyst", "intelligence", "knowledge-manager"])
    for (const a of agents) {
      expect(a.status).toBe("idle")
      expect(a.capabilities.length).toBeGreaterThan(0)
      expect(a.permissions.length).toBeGreaterThan(0)
    }
  })

  it("evento no formato da tabela e frase do feed", () => {
    const e = makeEvent({ type: "lead.rejected", entity: { type: "lead", id: "abc123456" }, actor: { type: "human", id: "u2" }, metadata: { name: "Costa Lion", reasonLabel: "Site já é bom" } }, "id-1", "t")
    expect(e).toEqual({ id: "id-1", event_type: "lead.rejected", entity_type: "lead", entity_id: "abc123456", actor_type: "human", actor_id: "u2", metadata: { name: "Costa Lion", reasonLabel: "Site já é bom" }, created_at: "t" })
    expect(describeEvent(e)).toBe("Lead Costa Lion descartado · Site já é bom")
    expect(describeEvent({ event_type: "lead.approved", entity_id: "xyz7890", metadata: {} })).toBe("Lead #xyz789 aprovado")
    expect(describeEvent({ event_type: "agent.completed", entity_id: "web-analyst", metadata: { task: "análise" } }, "Web Analyst")).toBe("Web Analyst concluiu análise")
  })

  it("hipótese só anda pelos passos permitidos e registra quem decidiu", () => {
    const h: Hypothesis = { id: "h", title: "", description: "", evidence: "", confidence: 0.5, proposedTest: "", status: "proposed", createdBy: "intelligence", createdAt: "" }
    expect(moveHypothesis(h, "validated", "u1", "t")).toBeNull() // pular etapa: não pode
    const ok = moveHypothesis(h, "approved", "u1", "t")!
    expect(ok).toMatchObject({ status: "approved", decidedBy: "u1" })
    expect(moveHypothesis({ ...h, status: "rejected" }, "approved", "u1", "t")).toBeNull()
  })
})
