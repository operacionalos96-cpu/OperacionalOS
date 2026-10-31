import { describe, expect, it } from "vitest"
import { DEFAULT_AREAS, ownerOfArea, peopleFrom, type PeopleContext } from "./areas"
import { captureItem, decisionOverdue, decisionsWaitingFor, inInbox, inboxAlert, isWorkTask, routeDecision, triage } from "./items"
import type { Task } from "./types"

const NOW = new Date("2026-10-31T12:00:00Z")
const semCeo: PeopleContext = { founderIds: ["u1", "u2"] }
const comCeo: PeopleContext = { ceoId: "u_ceo", founderIds: ["u1", "u2"] }
const ctx = (people = semCeo) => ({ areas: DEFAULT_AREAS, people })

describe("pessoas e áreas", () => {
  it("CEO e founders vêm dos cargos atribuídos", () => {
    expect(peopleFrom([{ memberId: "u1", roleId: "founder" }, { memberId: "u2", roleId: "founder" }, { memberId: "x", roleId: "ceo" }])).toEqual({ ceoId: "x", founderIds: ["u1", "u2"] })
  })
  it("área da CEO sem CEO definida fica sem dono; com CEO, é dela", () => {
    const fin = DEFAULT_AREAS.find((a) => a.id === "financeiro")
    expect(ownerOfArea(fin, semCeo)).toBeUndefined()
    expect(ownerOfArea(fin, comCeo)).toBe("u_ceo")
    expect(ownerOfArea(DEFAULT_AREAS.find((a) => a.id === "conteudo"), semCeo)).toBe("u1")
  })
})

describe("captura e caixa de entrada", () => {
  const cap = captureItem({ kind: "idea", title: "  Série sobre coprodução ", byId: "u2" }, "i1", NOW)

  it("captura cai na caixa de entrada de quem capturou", () => {
    expect(cap).toMatchObject({ title: "Série sobre coprodução", kind: "idea", ownerId: "u2", inbox: true, origin: "captura" })
    expect(inInbox(cap)).toBe(true)
    expect(isWorkTask(cap)).toBe(false)
  })

  it("tarefa antiga sem prazo NÃO entra na caixa (é backlog, não captura)", () => {
    const antiga = { id: "t", title: "x", ownerId: "u1", done: false, createdAt: "2026-01-01" } as Task
    expect(inInbox(antiga)).toBe(false)
    expect(isWorkTask(antiga)).toBe(true)
  })

  it("item sem dono está na caixa", () => {
    expect(inInbox({ id: "t", title: "x", ownerId: "", done: false, createdAt: "2026-10-31" } as Task)).toBe(true)
  })

  it("selo de alerta depois de 48 h na caixa", () => {
    expect(inboxAlert({ ...cap, createdAt: "2026-10-29T11:00:00Z" }, NOW)).toBe(true)
    expect(inboxAlert({ ...cap, createdAt: "2026-10-30T13:00:00Z" }, NOW)).toBe(false)
  })

  it("triagem para tarefa: dono vem da área; sai da caixa e vira tarefa de trabalho", () => {
    const patch = triage(cap, { to: "task", areaId: "comercial" }, ctx(), NOW)
    expect(patch).toMatchObject({ kind: "task", areaId: "comercial", ownerId: "u2", inbox: false })
    expect(isWorkTask({ ...cap, ...patch })).toBe(true)
  })

  it("triagem para área da CEO sem CEO: mantém quem capturou como dono", () => {
    expect(triage(cap, { to: "task", areaId: "financeiro" }, ctx(), NOW).ownerId).toBe("u2")
  })

  it("arquivar tira de todas as listas", () => {
    const arquivado = { ...cap, ...triage(cap, { to: "archive" }, ctx(), NOW) }
    expect(inInbox(arquivado)).toBe(false)
    expect(isWorkTask(arquivado)).toBe(false)
  })
})

describe("decisões: porta de mão dupla × mão única", () => {
  const base = { door: "reversivel" as const, involves: [] as ("dinheiro" | "contrato" | "contratacao" | "estrategia")[] }

  it("reversível dentro da área: o dono da área decide", () => {
    const r = routeDecision(base, "conteudo", { ...ctx(comCeo), proposerId: "u2" })
    expect(r).toMatchObject({ deciderIds: ["u1"], goesToCeo: false })
  })

  it("contrato, contratação, estratégia ou irreversível vão para a CEO", () => {
    for (const d of [{ ...base, involves: ["contrato" as const] }, { ...base, involves: ["contratacao" as const] }, { ...base, involves: ["estrategia" as const] }, { ...base, door: "irreversivel" as const }]) {
      expect(routeDecision(d, "conteudo", { ...ctx(comCeo), proposerId: "u1" }).deciderIds).toEqual(["u_ceo"])
    }
  })

  it("dinheiro: sem limite configurado não vai para a CEO; acima do limite vai", () => {
    const d = { ...base, involves: ["dinheiro" as const], amountCents: 500_000 }
    expect(routeDecision(d, "trafego", { ...ctx(comCeo), proposerId: "u2", limitCents: null }).goesToCeo).toBe(false)
    expect(routeDecision(d, "trafego", { ...ctx(comCeo), proposerId: "u2", limitCents: 200_000 }).deciderIds).toEqual(["u_ceo"])
    expect(routeDecision(d, "trafego", { ...ctx(comCeo), proposerId: "u2", limitCents: 600_000 }).goesToCeo).toBe(false)
  })

  it("sem CEO definida: o que iria para a CEO vai para os founders, com aviso", () => {
    const r = routeDecision({ ...base, involves: ["contrato"] }, "comercial", { ...ctx(semCeo), proposerId: "u2" })
    expect(r.deciderIds).toEqual(["u1", "u2"])
    expect(r.reason).toMatch(/não há CEO/)
  })

  it("afeta a área do outro founder: ele precisa dar ok", () => {
    const r = routeDecision({ ...base, affectsAreaIds: ["roteiros"] }, "trafego", { ...ctx(comCeo), proposerId: "u2" })
    expect(r).toMatchObject({ deciderIds: ["u2"], okFromIds: ["u1"] })
  })

  it("prazo vencido sem resposta = atrasada; aparece para quem decide", () => {
    const d = { id: "d", title: "Contratar editor?", kind: "decision", ownerId: "u2", done: false, createdAt: "2026-10-20", dueDate: "2026-10-30", decision: { ...base, options: [], status: "pendente", deciderId: "u1" } } as Task
    expect(decisionOverdue(d, NOW)).toBe(true)
    expect(decisionsWaitingFor("u1", [d])).toHaveLength(1)
    expect(decisionsWaitingFor("u2", [d])).toHaveLength(0)
    expect(decisionOverdue({ ...d, decision: { ...d.decision!, status: "decidida" } }, NOW)).toBe(false)
  })

  it("quando os dois founders decidem, a decisão espera pelos dois", () => {
    const d = { id: "d2", title: "Fechar com coprodutor?", kind: "decision", ownerId: "u2", done: false, createdAt: "2026-10-30", decision: { ...base, options: [], status: "pendente", deciderId: "u1", deciderIds: ["u1", "u2"] } } as Task
    expect(decisionsWaitingFor("u1", [d])).toHaveLength(1)
    expect(decisionsWaitingFor("u2", [d])).toHaveLength(1)
  })
})
