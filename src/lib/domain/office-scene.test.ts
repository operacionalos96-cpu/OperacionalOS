import { describe, expect, it } from "vitest"
import { enqueueScene, freshForScene, sceneActionFor, type SceneAction } from "./office-scene"

const ev = (event_type: string, entity_id = "lead123456", metadata: Record<string, unknown> = { name: "Costa Lion" }) =>
  ({ event_type, entity_id, metadata }) as Parameters<typeof sceneActionFor>[0]

describe("Sede 3D: evento real → ação da cena", () => {
  it("lead novo entra pelo funil, com a frase do feed", () => {
    expect(sceneActionFor(ev("lead.created"))).toEqual({ kind: "arrive", floor: "funil", entity: "lead123456", text: "Lead Costa Lion cadastrado", tone: "lead" })
  })

  it("a jornada do lead passa pelos andares certos", () => {
    const kinds = ["lead.created", "lead.analyzed", "lead.approved", "lead.contacted", "lead.replied", "lead.proposal", "lead.converted"].map((t) => {
      const a = sceneActionFor(ev(t))!
      return a.kind === "transfer" ? `${a.kind}:${a.from}>${a.to}` : a.kind === "send" ? `${a.kind}:${a.from}` : a.kind === "arrive" ? `${a.kind}:${a.floor}` : a.kind
    })
    expect(kinds).toEqual(["arrive:funil", "transfer:funil>analise", "resolve", "send:funil", "arrive:funil", "transfer:funil>producao", "send:producao"])
  })

  it("análise deixa o lead esperando decisão; aprovar/descartar resolve", () => {
    expect(sceneActionFor(ev("lead.analyzed"))).toMatchObject({ kind: "transfer", await: true })
    expect(sceneActionFor(ev("lead.approved"))).toMatchObject({ kind: "resolve", approved: true })
    expect(sceneActionFor(ev("lead.rejected"))).toMatchObject({ kind: "resolve", approved: false })
  })

  it("só a venda acende o painel da HZK", () => {
    expect(sceneActionFor(ev("lead.converted"))).toMatchObject({ kind: "send", celebrate: true })
    expect(sceneActionFor(ev("lead.contacted"))).not.toHaveProperty("celebrate")
  })

  it("agentes aparecem no andar do seu trabalho; agente novo vai para dados", () => {
    expect(sceneActionFor(ev("agent.failed", "web-analyst", {}), "Web Analyst")).toEqual({ kind: "agent", floor: "analise", agent: "web-analyst", state: "failed", text: "Web Analyst falhou" })
    expect(sceneActionFor(ev("agent.started", "agente-x", {}))).toMatchObject({ floor: "dados", state: "working" })
  })

  it("eventos que não são do prédio não viram nada", () => {
    expect(sceneActionFor(ev("member.invited"))).toBeNull()
    expect(sceneActionFor(ev("learning.created"))).toBeNull()
  })
})

describe("Sede 3D: fila e eventos novos", () => {
  const a = (n: number): SceneAction => ({ kind: "discard", floor: "funil", entity: `e${n}`, text: "" })

  it("rajada: guarda os mais novos e conta os que pulou", () => {
    let q = { items: [] as SceneAction[], skipped: 0 }
    for (let i = 0; i < 5; i++) q = enqueueScene(q, a(i), 3)
    expect(q.items.map((x) => (x as { entity: string }).entity)).toEqual(["e2", "e3", "e4"])
    expect(q.skipped).toBe(2)
  })

  it("não reencena o histórico nem o que já viu; ordem cronológica", () => {
    const events = [
      { id: "3", created_at: "2026-11-10T10:00:03Z" },
      { id: "1", created_at: "2026-11-10T09:59:00Z" },
      { id: "2", created_at: "2026-11-10T10:00:01Z" },
      { id: "4", created_at: "2026-11-10T10:00:04Z" },
    ]
    expect(freshForScene(events, new Set(["4"]), "2026-11-10T10:00:00Z").map((e) => e.id)).toEqual(["2", "3"])
  })
})
