import { describe, expect, it } from "vitest"
import { deliveryKey, deriveOfficeState, officeStateInput, pickRecipients, validateAgentChange, type OfficeAgent, type OfficeJob, type OfficeStateInput } from "./office"

describe("linhas do banco → estado", () => {
  it("ignora jobs terminados, acha quem delegou pelo job-pai e usa o sinal mais recente da Ponte", () => {
    const input = officeStateInput({
      office: { consent_at: "2026-11-10T10:00:00Z" },
      agents: [{ id: "C", kind: "co_lider", parent_agent_id: null, name: "Coord", title: "Coordenador", paused: false }],
      jobs: [
        { id: "u-pai", public_id: "job_pai", agent_id: "C", entity_id: "thr", status: "completed", claimed_at: null, started_at: null, parent_job_id: null, created_at: "t0" },
        { id: "u-filho", public_id: "job_filho", agent_id: "F", entity_id: "thr", status: "queued", claimed_at: null, started_at: null, parent_job_id: "u-pai", created_at: "t1" },
      ],
      threads: [{ id: "thr", kind: "direta" }],
      workers: [
        { last_seen_at: "2026-11-10T11:00:00Z", enabled: true },
        { last_seen_at: "2026-11-10T11:59:00Z", enabled: true },
        { last_seen_at: "2026-11-10T12:00:00Z", enabled: false },
      ],
    })
    expect(input.consent).toBe(true)
    expect(input.jobs).toEqual([expect.objectContaining({ publicId: "job_filho", parentAgentId: "C", status: "queued" })])
    expect(input.bridge).toEqual({ lastSeenAt: "2026-11-10T11:59:00Z" })
    expect(officeStateInput({ office: null, agents: [], jobs: [], threads: [], workers: [] })).toMatchObject({ consent: false, bridge: null })
  })
})

const ag = (id: string, kind: OfficeAgent["kind"], parentAgentId: string | null, paused = false): OfficeAgent => ({ id, kind, parentAgentId, name: id, title: id, paused })
// co-líder C → funcionário F1 → funcionário F2 (3 níveis)
const team = [ag("C", "co_lider", null), ag("F1", "funcionario", "C"), ag("F2", "funcionario", "F1")]

describe("organograma", () => {
  it("aceita a estrutura normal e recusa o 4º nível", () => {
    expect(validateAgentChange(team, { kind: "funcionario", parentAgentId: "C" })).toBeNull()
    expect(validateAgentChange(team, { kind: "funcionario", parentAgentId: "F2" })).toBe("limit_depth")
  })

  it("um co-líder só, sem chefe; funcionário sempre com chefe", () => {
    expect(validateAgentChange(team, { kind: "co_lider", parentAgentId: null })).toBe("one_co_lider")
    expect(validateAgentChange([], { kind: "co_lider", parentAgentId: "X" })).toBe("parent_not_allowed")
    expect(validateAgentChange(team, { kind: "funcionario", parentAgentId: null })).toBe("parent_required")
    expect(validateAgentChange(team, { kind: "funcionario", parentAgentId: "nao-existe" })).toBe("parent_not_found")
  })

  it("limite de 20 agentes", () => {
    const many = [ag("C", "co_lider", null), ...Array.from({ length: 19 }, (_, i) => ag(`F${i}`, "funcionario", "C"))]
    expect(validateAgentChange(many, { kind: "funcionario", parentAgentId: "C" })).toBe("limit_agents")
  })

  it("ao mover: sem ciclo, sem trocar o tipo, e a subárvore inteira cabe nos 3 níveis", () => {
    expect(validateAgentChange(team, { id: "F1", kind: "funcionario", parentAgentId: "F2" })).toBe("cycle")
    expect(validateAgentChange(team, { id: "F1", kind: "co_lider", parentAgentId: null })).toBe("kind_immutable")
    const wide = [...team, ag("F3", "funcionario", "C")]
    expect(validateAgentChange(wide, { id: "F1", kind: "funcionario", parentAgentId: "F3" })).toBe("limit_depth") // F1+F2 abaixo de F3 = 4 níveis
    expect(validateAgentChange(wide, { id: "F2", kind: "funcionario", parentAgentId: "F3" })).toBeNull()
  })
})

describe("destinatários e entregas", () => {
  const canal = { id: "thr", kind: "canal" as const, agentIds: ["C", "F1", "F2"], leadAgentId: "C" }

  it("menção > resposta > único > líder", () => {
    expect(pickRecipients(canal, { mentions: ["F1", "F2", "F1", "fora"] })).toEqual(["F1", "F2"])
    expect(pickRecipients(canal, { replyToAgent: "F2" })).toEqual(["F2"])
    expect(pickRecipients(canal)).toEqual(["C"])
    expect(pickRecipients({ id: "d", kind: "direta", agentIds: ["F1"], leadAgentId: "F1" })).toEqual(["F1"])
  })

  it("chave de entrega estável", () => {
    expect(deliveryKey("msg_1", "agt_2")).toBe("dlv:msg_1:agt_2")
  })
})

describe("estados (office-state/v1)", () => {
  const now = new Date("2026-11-10T12:00:00Z")
  const job = (publicId: string, agentId: string, status: OfficeJob["status"], extra: Partial<OfficeJob> = {}): OfficeJob => ({ publicId, agentId, threadId: "thr_d", status, createdAt: "2026-11-10T11:00:00Z", ...extra })
  const base = (over: Partial<OfficeStateInput> = {}): OfficeStateInput => ({
    consent: true,
    agents: [ag("C", "co_lider", null), ag("F1", "funcionario", "C"), ag("F2", "funcionario", "C", true)],
    jobs: [],
    threads: [{ id: "thr_d", kind: "direta" }, { id: "thr_c", kind: "canal" }],
    bridge: { lastSeenAt: "2026-11-10T11:59:30Z" },
    ...over,
  })
  const states = (s: ReturnType<typeof deriveOfficeState>) => Object.fromEntries(s.agents.map((a) => [a.id, a.state]))

  it("ocioso, pausado, trabalhando, conversando, na fila", () => {
    const s = deriveOfficeState(base({ jobs: [job("j1", "C", "running", { claimedAt: "2026-11-10T11:58:00Z" }), job("j2", "F1", "claimed", { threadId: "thr_c" }), job("j3", "F2", "queued")] }), now)
    expect(states(s)).toEqual({ C: "trabalhando", F1: "conversando", F2: "pausado" })
    expect(s.agents[0]).toMatchObject({ queue: { queued: 0, running: 1 }, current: { job_id: "j1", thread_id: "thr_d", started_at: "2026-11-10T11:58:00Z" } })
    const idle = deriveOfficeState(base({ jobs: [job("j4", "F1", "queued")] }), now)
    expect(states(idle)).toEqual({ C: "ocioso", F1: "na_fila", F2: "pausado" })
  })

  it("Ponte sem sinal há mais de 2 min: fila vira ponte_desligada", () => {
    const s = deriveOfficeState(base({ jobs: [job("j1", "C", "queued")], bridge: { lastSeenAt: "2026-11-10T11:50:00Z" } }), now)
    expect(s.bridge).toEqual({ online: false, last_seen_at: "2026-11-10T11:50:00Z" })
    expect(states(s).C).toBe("ponte_desligada")
    expect(states(deriveOfficeState(base({ jobs: [job("j1", "C", "queued")], bridge: null }), now)).C).toBe("ponte_desligada")
  })

  it("aprovações (P3) vêm antes de tudo: bloqueio > lote; manutenção só quando ocioso", () => {
    const s = deriveOfficeState(base({ jobs: [job("j1", "C", "running")], approvals: [{ agentId: "C", gate: "bloqueio" }, { agentId: "F1", gate: "lote" }], maintenance: ["F1", "F2"] }), now)
    expect(states(s)).toEqual({ C: "bloqueado", F1: "aguardando_aprovacao", F2: "pausado" })
    expect(states(deriveOfficeState(base({ maintenance: ["F1"] }), now)).F1).toBe("manutencao")
  })

  it("handoffs saem da delegação, em ordem; o JSON não leva texto de conversa", () => {
    const s = deriveOfficeState(base({ jobs: [job("j2", "F1", "queued", { parentAgentId: "C", createdAt: "2026-11-10T11:30:00Z" }), job("j1", "C", "running")] }), now)
    expect(s.handoffs).toEqual([{ from_agent: "C", to_agent: "F1", job_id: "j2", at: "2026-11-10T11:30:00Z" }])
    expect(s.schema).toBe("office-state/v1")
    expect(Object.keys(s.agents[0]).sort()).toEqual(["connection_id", "current", "id", "kind", "name", "parent_agent_id", "queue", "state", "title"])
  })

  it("IA indisponível: usa a reserva; sem nenhuma, diz se falta cota ou conexão", () => {
    const con = (id: string, status: "conectada" | "sem_cota" | "erro" | "desligada" | "pendente", quotaResetsAt: string | null = null) => ({ id, provider: id, kind: "chave" as const, status, quotaResetsAt })
    const agents = [
      { ...ag("C", "co_lider", null), connectionId: "cota", backupModels: [{ connectionId: "ok", model: "m" }] }, // principal sem cota, reserva ok
      { ...ag("F1", "funcionario", "C"), connectionId: "cota", backupModels: [{ connectionId: "off", model: "m" }] }, // tudo parado, há falta de cota
      { ...ag("F2", "funcionario", "C"), connectionId: "off" }, // conexão desligada
      { ...ag("F3", "funcionario", "C"), connectionId: null }, // sem IA escolhida
    ]
    const jobs = ["C", "F1", "F2", "F3"].map((a, i) => job(`j${i}`, a, "queued"))
    const s = deriveOfficeState(base({ agents, jobs, connections: [con("cota", "sem_cota", "2026-11-10T13:00:00Z"), con("ok", "conectada"), con("off", "desligada")] }), now)
    expect(states(s)).toEqual({ C: "na_fila", F1: "sem_cota", F2: "sem_conexao", F3: "sem_conexao" })
    expect(s.connections.map((c) => c.status)).toEqual(["sem_cota", "conectada", "desligada"])
    // a cota voltou (horário passou): o agente sai de sem_cota
    const later = deriveOfficeState(base({ agents, jobs, connections: [con("cota", "sem_cota", "2026-11-10T11:00:00Z"), con("off", "desligada")] }), now)
    expect(states(later).F1).toBe("na_fila")
    // sem a lista de conexões (dado antigo), não julga a IA
    expect(states(deriveOfficeState(base({ agents, jobs }), now)).F3).toBe("na_fila")
  })
})
