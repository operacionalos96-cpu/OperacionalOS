import { describe, expect, it } from "vitest"
import {
  avatarGlyph,
  connectionFor,
  connectorBlock,
  effectiveClass,
  effectiveVersion,
  endpointOk,
  grantAllowed,
  levelReleased,
  approvalPhase,
  approvalVisible,
  pendingCount,
  signalLooksPersonal,
  skillBlock,
  updateWaiting,
  type DockSkillVersion,
} from "./dock"

const ver = (version: number, minLevel = 0, requiredConnectors: string[] = [], hasScripts = false): DockSkillVersion => ({
  skillId: "s1", version, label: `1.${version}`, whatChanged: "x", minLevel, requiredConnectors, hasScripts, examples: [], publishedAt: "", approvedBy: null,
})

describe("primeira leva", () => {
  it("só os níveis 0 e 1 estão liberados", () => {
    expect([0, 1, 2, 3].map(levelReleased)).toEqual([true, true, false, false])
  })
})

describe("skills", () => {
  const skills = [{ id: "s1", scope: "area" as const, areaId: "producao", name: "S", description: "", inKit: true, currentVersion: 3, archived: false, createdBy: "u1" }]

  it("bloqueia por nível e por app que falta", () => {
    const d = { versions: [ver(3, 1, ["github"])], agentConnectors: [] }
    expect(skillBlock(d, { id: "b", accessLevel: 0 }, skills[0])).toBe("pede nível 1")
    expect(skillBlock(d, { id: "b", accessLevel: 1 }, skills[0])).toBe("usa o app github")
    expect(skillBlock({ ...d, agentConnectors: [{ agentId: "b", connectorId: "github", readOnly: true, status: "conectado" }] }, { id: "b", accessLevel: 1 }, skills[0])).toBeNull()
  })

  it("versão nova que pede mais espera o dono, e o bot fica na última compatível (não volta)", () => {
    const d = { skills, versions: [ver(1, 1), ver(2, 1), ver(3, 1, ["github"])] }
    const inst = { agentId: "b", skillId: "s1", pinnedVersion: null, seenVersion: 1 }
    expect(effectiveVersion(d, inst, 1)).toBe(2)
    expect(updateWaiting(d, inst, 1)).toBe(true)
    expect(effectiveVersion(d, { ...inst, seenVersion: 3 }, 1)).toBe(3)
    expect(effectiveVersion(d, { ...inst, pinnedVersion: 1 }, 1)).toBe(1)
    expect(effectiveVersion(d, inst, 0)).toBeNull()
  })
})

describe("conectores e porteiro", () => {
  it("volume acima do teto vira D; 'sempre permitir' só em C sem envio nem dinheiro", () => {
    expect(effectiveClass({ actionClass: "A", maxItems: 1 }, 600)).toBe("D")
    expect(effectiveClass({ actionClass: "C", maxItems: 10 }, 5)).toBe("C")
    expect(grantAllowed({ actionClass: "C", sendsOutside: false, money: false, enabled: true })).toBe(true)
    expect(grantAllowed({ actionClass: "D", sendsOutside: false, money: false, enabled: true })).toBe(false)
    expect(grantAllowed({ actionClass: "C", sendsOutside: true, money: false, enabled: true })).toBe(false)
  })

  it("conector: aprovado, disponível na leva e nível suficiente", () => {
    expect(connectorBlock({ status: "rascunho", wave: 1, minLevel: 0 }, { accessLevel: 1 })).toBe("ainda não aprovado")
    expect(connectorBlock({ status: "aprovado", wave: 0, minLevel: 0 }, { accessLevel: 1 })).toBe("a confirmar")
    expect(connectorBlock({ status: "aprovado", wave: 1, minLevel: 1 }, { accessLevel: 0 })).toBe("pede nível 1")
    expect(connectorBlock({ status: "aprovado", wave: 1, minLevel: 1 }, { accessLevel: 1 })).toBeNull()
  })
})

describe("conversa e pendências", () => {
  it("a troca de IA na conversa vale antes da IA do bot", () => {
    const d = { agents: [{ id: "b", connectionId: "c1", model: "m1" }] as never, threadModels: [{ threadId: "t", agentId: "b", connectionId: "c2", model: "m2" }] }
    expect(connectionFor(d, "t", "b")).toEqual({ connectionId: "c2", model: "m2", override: true })
    expect(connectionFor(d, "outra", "b")).toEqual({ connectionId: "c1", model: "m1", override: false })
  })

  it("conta só aprovação aberta das últimas 48 h; propostas para responsável; pedidos para founder", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    const past = new Date(Date.now() - 1000).toISOString()
    const now = new Date().toISOString()
    const old = new Date(Date.now() - 49 * 3_600_000).toISOString()
    const d = {
      approvals: [
        { status: "pendente", createdAt: now, expiresAt: future },
        { status: "pendente", createdAt: old, expiresAt: future },
        { status: "pendente", createdAt: old, expiresAt: past },
        { status: "aprovada", createdAt: now, expiresAt: future },
      ] as never,
      proposals: [{ status: "aberta" }] as never,
      requests: [{ status: "aberto" }] as never,
    }
    expect(pendingCount(d, { lead: false, founder: false }).total).toBe(1)
    expect(pendingCount(d, { lead: true, founder: true }).total).toBe(3)
  })
})

describe("prazo do pedido de aprovação", () => {
  const H = 3_600_000, D = 24 * H, t0 = Date.UTC(2026, 10, 19, 12)
  const ap = (createdH: number, status = "pendente") => ({ status, createdAt: new Date(t0).toISOString(), expiresAt: new Date(t0 + 7 * D).toISOString(), at: t0 + createdH * H }) as const

  it("à vista nas primeiras 48 h, guardado até o 7º dia, vencido depois", () => {
    for (const [h, phase] of [[0, "a_vista"], [47.9, "a_vista"], [48, "guardado"], [6 * 24 + 23, "guardado"], [7 * 24, "vencido"]] as const) {
      const a = ap(h)
      expect(approvalPhase(a as never, a.at)).toBe(phase)
    }
  })

  it("decidido não conta, em qualquer tempo", () => {
    const a = ap(1, "aprovada")
    expect(approvalPhase(a as never, a.at)).toBe("decidido")
    expect(approvalVisible(a as never, a.at)).toBe(false)
  })
})

describe("textos", () => {
  it("sinal com cara de dado pessoal é recusado", () => {
    expect(signalLooksPersonal("Mandei para joao@cliente.com.br")).toBe(true)
    expect(signalLooksPersonal("Ver https://x.com")).toBe(true)
    expect(signalLooksPersonal("CPF 12345678900")).toBe(true)
    expect(signalLooksPersonal("Conferir a tela no celular antes de terminar")).toBe(false)
  })

  it("endereço personalizado: https fora do PC, http só no próprio PC, nada de senha", () => {
    expect(endpointOk("https://ia.exemplo.com/v1")).toBe(true)
    expect(endpointOk("http://localhost:1234/v1")).toBe(true)
    expect(endpointOk("http://ia.exemplo.com/v1")).toBe(false)
    expect(endpointOk("https://user:senha@ia.exemplo.com")).toBe(false)
    expect(endpointOk("https://ia.exemplo.com/v1?key=abc")).toBe(false)
  })

  it("glifo do avatar: ícone, letra escolhida ou a inicial", () => {
    expect(avatarGlyph("Pesquisadora", "")).toBe("P")
    expect(avatarGlyph("Pesquisadora", "x")).toBe("X")
    expect(avatarGlyph("Dev", "codigo")).toBe("codigo")
  })
})

describe("isTyping: o bot aparece digitando até a resposta chegar", () => {
  const now = Date.parse("2026-11-26T21:00:00Z")
  const at = (s: number) => new Date(now - s * 1000).toISOString()
  const human = (s: number) => ({ authorType: "human" as const, kind: "texto" as const, createdAt: at(s) })
  const bot = (s: number) => ({ authorType: "agent" as const, kind: "texto" as const, createdAt: at(s) })

  it("última mensagem da pessoa, recente e o bot na fila ou trabalhando: digitando", async () => {
    const { isTyping } = await import("./dock")
    expect(isTyping([human(5)], "na_fila", now)).toBe(true)
    expect(isTyping([bot(60), human(3)], "trabalhando", now)).toBe(true)
    expect(isTyping([human(1)], "ocioso", now)).toBe(true) // o estado do servidor ainda não chegou
  })

  it("o bot respondeu: para de digitar (o progresso do bot não conta como resposta)", async () => {
    const { isTyping } = await import("./dock")
    expect(isTyping([human(10), bot(2)], "trabalhando", now)).toBe(false)
    expect(isTyping([human(10), { authorType: "agent", kind: "progresso", createdAt: at(2) }], "trabalhando", now)).toBe(true)
  })

  it("pausado, sem cota ou PC desligado: não finge que está digitando", async () => {
    const { isTyping } = await import("./dock")
    for (const s of ["pausado", "sem_cota", "ponte_desligada", "bloqueado", "aguardando_aprovacao"] as const) expect(isTyping([human(5)], s, now)).toBe(false)
  })

  it("mensagem de mais de 5 minutos sem resposta: para (algo travou; o estado explica)", async () => {
    const { isTyping } = await import("./dock")
    expect(isTyping([human(6 * 60)], "na_fila", now)).toBe(false)
    expect(isTyping([], "na_fila", now)).toBe(false)
  })
})
