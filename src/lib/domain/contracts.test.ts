import { describe, expect, it } from "vitest"
import { activeValueCents, contractFileProblem, contractStatus, contractsDue, daysToEnd, endLabel, renewalTask, type Contract } from "./contracts"

const now = new Date("2026-11-24T15:00:00")
const c = (over: Partial<Contract> = {}): Contract => ({ id: "c1", title: "Coprodução Curso X", party: "Fulano Ltda", kind: "parceiro", files: [], createdById: "u1", createdAt: "x", signedAt: "2026-01-10", ...over })

describe("situação do contrato sai das datas", () => {
  it("sem assinatura é rascunho; assinado sem fim é vigente", () => {
    expect(contractStatus(c({ signedAt: undefined, endsAt: "2026-12-31" }), now)).toBe("rascunho")
    expect(contractStatus(c(), now)).toBe("vigente")
  })

  it("avisa dentro do prazo de aviso, e o último dia ainda é vigência", () => {
    expect(contractStatus(c({ endsAt: "2027-06-30" }), now)).toBe("vigente")
    expect(contractStatus(c({ endsAt: "2026-12-24" }), now)).toBe("vence-em-breve") // 30 dias: padrão
    expect(contractStatus(c({ endsAt: "2026-12-25" }), now)).toBe("vigente")
    expect(contractStatus(c({ endsAt: "2026-12-25", noticeDays: 60 }), now)).toBe("vence-em-breve")
    expect(contractStatus(c({ endsAt: "2026-11-24" }), now)).toBe("vence-em-breve")
    expect(contractStatus(c({ endsAt: "2026-11-23" }), now)).toBe("vencido")
  })

  it("encerrado vale mais que qualquer data", () => {
    expect(contractStatus(c({ endsAt: "2026-11-01", closedAt: "2026-10-15" }), now)).toBe("encerrado")
  })

  it("conta dias de calendário, sem depender da hora", () => {
    expect(daysToEnd(c({ endsAt: "2026-11-25" }), new Date("2026-11-24T23:59:00"))).toBe(1)
    expect(daysToEnd(c(), now)).toBeUndefined()
  })
})

describe("o que pede atenção", () => {
  it("lista os que vencem em breve e os vencidos, do mais apertado ao mais folgado", () => {
    const list = [c({ id: "longe", endsAt: "2027-06-30" }), c({ id: "breve", endsAt: "2026-12-10" }), c({ id: "vencido", endsAt: "2026-11-01" }), c({ id: "fechado", endsAt: "2026-11-01", closedAt: "2026-11-02" }), c({ id: "rascunho", signedAt: undefined, endsAt: "2026-11-30" })]
    expect(contractsDue(list, now).map((x) => x.id)).toEqual(["vencido", "breve"])
  })

  it("descreve o prazo em palavras", () => {
    expect(endLabel(c({ endsAt: "2026-12-06" }), now)).toBe("vence em 12 dias")
    expect(endLabel(c({ endsAt: "2026-11-25" }), now)).toBe("vence em 1 dia")
    expect(endLabel(c({ endsAt: "2026-11-24" }), now)).toBe("vence hoje")
    expect(endLabel(c({ endsAt: "2026-11-21" }), now)).toBe("venceu há 3 dias")
    expect(endLabel(c({ endsAt: "2026-12-06", autoRenews: true }), now)).toBe("renova em 12 dias")
    expect(endLabel(c(), now)).toBe("sem prazo para acabar")
  })

  it("soma só o que está em vigor", () => {
    const list = [c({ valueCents: 100_00 }), c({ valueCents: 50_00, endsAt: "2026-12-01" }), c({ valueCents: 999_00, endsAt: "2026-11-01" }), c({ valueCents: 999_00, signedAt: undefined })]
    expect(activeValueCents(list, now)).toBe(150_00)
  })
})

describe("tarefa de renovação", () => {
  it("vai para a área de Contratos com prazo no dia em que o aviso começa", () => {
    const t = renewalTask(c({ endsAt: "2027-03-31" }), now)
    expect(t).toMatchObject({ title: "Renovar ou encerrar: Coprodução Curso X", dueDate: "2027-03-01", areaId: "contratos" })
    expect(t?.description).toContain("31/03/2027")
  })

  it("se o aviso já começou, o prazo é hoje; renovação automática muda a pergunta", () => {
    expect(renewalTask(c({ endsAt: "2026-12-01" }), now)?.dueDate).toBe("2026-11-24")
    expect(renewalTask(c({ endsAt: "2026-12-01", autoRenews: true }), now)?.title).toBe("Decidir se renova: Coprodução Curso X")
  })

  it("não cria sem prazo, para contrato encerrado ou quando já existe uma", () => {
    expect(renewalTask(c(), now)).toBeNull()
    expect(renewalTask(c({ endsAt: "2026-12-01", closedAt: "2026-11-20" }), now)).toBeNull()
    expect(renewalTask(c({ endsAt: "2026-12-01", renewalTaskId: "t9" }), now)).toBeNull()
  })
})

describe("arquivo do contrato", () => {
  it("aceita PDF, Word e foto até 20 MB", () => {
    expect(contractFileProblem({ size: 1024, type: "application/pdf" })).toBeNull()
    expect(contractFileProblem({ size: 1024, type: "video/mp4" })).toMatch(/Tipo de arquivo/)
    expect(contractFileProblem({ size: 21 * 1024 * 1024, type: "application/pdf" })).toMatch(/20 MB/)
  })
})
