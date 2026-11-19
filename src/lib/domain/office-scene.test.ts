import { describe, expect, it } from "vitest"
import { DEFAULT_AREAS } from "./areas"
import { freshForScene, SEDE_ANDARES, sedeEventsFor, sedeKeyOf, sedeOcupados } from "./office-scene"

const ev = (event_type: string, entity_id = "lead123456", metadata: Record<string, unknown> = { name: "Costa Lion" }) =>
  ({ event_type, entity_id, metadata }) as Parameters<typeof sedeEventsFor>[0]

describe("Sede 3D: eventos novos", () => {
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

describe("Sede v2: evento real → torre", () => {
  const tipos = (t: string, entity = "lead123456", meta: Record<string, unknown> = { name: "Costa Lion" }) => sedeEventsFor(ev(t, entity, meta)).map((x) => `${x.type}@${x.area}`)

  it("lead corre pelo Comercial com a frase do feed", () => {
    expect(sedeEventsFor(ev("lead.created"))).toEqual([{ type: "lead.created", area: "comercial", label: "Lead Costa Lion cadastrado" }])
    expect(tipos("lead.contacted")).toEqual(["lead.contacted@comercial"])
    expect(tipos("lead.interested")).toEqual(["lead.replied@comercial"])
    expect(tipos("lead.converted")).toEqual(["lead.ganho@comercial"])
    expect(tipos("lead.lost")).toEqual(["lead.perdido@comercial"])
  })

  it("análise acende o farol; aprovar ou descartar apaga", () => {
    const a = sedeEventsFor(ev("lead.analyzed"))
    expect(a.map((x) => x.type)).toEqual(["lead.analyzed", "aprovacao.pedida"])
    expect(a[1]).toMatchObject({ area: "comercial", alerta: true })
    expect(tipos("lead.approved")).toEqual(["lead.approved@comercial", "aprovacao.decidida@comercial"])
    expect(tipos("lead.rejected")).toEqual(["lead.rejected@comercial", "aprovacao.decidida@comercial"])
  })

  it("convite sobe pelo elevador da Equipe", () => {
    expect(tipos("member.invited", "u9", { name: "Ana" })).toEqual(["member.invited@equipe"])
  })

  it("vídeo do Video Studio vira job.video; falha pede atenção; agente novo só entra no registro", () => {
    expect(tipos("agent.started", "video-studio", {})).toEqual(["job.video@comercial"])
    expect(sedeEventsFor(ev("agent.failed", "web-analyst", {}), "Web Analyst")[0]).toMatchObject({ type: "agent.failed", area: "comercial", label: "Web Analyst falhou", alerta: true })
    expect(tipos("agent.completed", "agente-x", {})).toEqual(["agent.completed@null"])
    expect(tipos("job.started", "j1", { job_type: "render_prospect_video" })).toEqual(["job.video@comercial"])
    expect(sedeEventsFor(ev("job.completed", "j1", { job_type: "analyze_website" }))[0].label).toBe("Job Analisar site concluído")
    expect(tipos("job.progress", "j1", { job_type: "analyze_website" })).toEqual([])
  })

  it("tarefas, conteúdo, entrada e decisões vão para o andar da área; entrada nunca mostra valor", () => {
    expect(tipos("tarefa.concluida", "t1", {})).toEqual(["tarefa.concluida@tarefas"])
    expect(tipos("conteudo.etapa", "c1", {})).toEqual(["conteudo.etapa@conteudos"])
    const entrada = sedeEventsFor(ev("entrada.lancada", "f1", { title: "R$ 5.000 do cliente X", valor: 5000 }))[0]
    expect(entrada).toMatchObject({ area: "financeiro", label: "Entrada lançada" })
    expect(tipos("aprovacao.pedida", "d1", { area: "conteudo" })).toEqual(["aprovacao.pedida@conteudos"])
    expect(tipos("aprovacao.decidida", "d1", { area: "contratos" })).toEqual(["aprovacao.decidida@contratos"])
  })

  it("o que não é do prédio não vira nada", () => {
    expect(tipos("learning.created")).toEqual([])
  })
})

describe("Sede v2: áreas → andares", () => {
  it("5 andares fixos e as outras áreas do 6º para cima, na ordem", () => {
    const o = sedeOcupados(DEFAULT_AREAS)
    expect(o.slice(0, 5).map((x) => x.key)).toEqual(["equipe", "tarefas", "comercial", "conteudos", "financeiro"])
    expect(o.slice(5).map((x) => `${x.andar}:${x.key}`)).toEqual(["6:contratos", "7:estrategia", "8:roteiros", "9:lancamentos", "10:trafego"])
    expect(o.slice(5).every((x) => x.nova)).toBe(true)
    expect(o.slice(0, 5).some((x) => x.nova)).toBe(false)
  })

  it("nunca passa de 14 andares; sem áreas, ficam só os fixos", () => {
    const muitas = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, name: `Área ${i}`, order: i }))
    expect(sedeOcupados(muitas)).toHaveLength(SEDE_ANDARES)
    expect(sedeOcupados([])).toHaveLength(5)
  })

  it("áreas do app com andar fixo", () => {
    expect(sedeKeyOf("conteudo")).toBe("conteudos")
    expect(sedeKeyOf("pessoas")).toBe("equipe")
    expect(sedeKeyOf("trafego")).toBe("trafego")
  })
})
