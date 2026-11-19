import { describe, expect, it } from "vitest"
import { areaLevel, canGrant, canReadArea, canSeeTask, canWriteArea, grantActive, grantableLevels, type AreaGrant, type AreaLevel } from "./area-access"

const now = new Date("2026-11-09T12:00:00Z")
const fin = { id: "financeiro", restricted: true }
const com = { id: "comercial" }
const grant = (p: Partial<AreaGrant>): AreaGrant => ({
  id: "g1", memberId: "u4", areaId: "financeiro", level: "ver", grantedBy: "u1", grantedAt: "2026-11-01T00:00:00Z", ...p,
})

describe("nível efetivo por área", () => {
  it("owner gere todas as áreas, restritas ou não", () => {
    expect(areaLevel({ id: "u1", level: "owner" }, fin, [], now)).toBe("gerir")
    expect(areaLevel({ id: "u1", level: "owner" }, com, [], now)).toBe("gerir")
  })

  it("área não restrita: vale o nível da empresa", () => {
    expect(areaLevel({ id: "u3", level: "admin" }, com, [], now)).toBe("aprovar")
    expect(areaLevel({ id: "u4", level: "operator" }, com, [], now)).toBe("operar")
    expect(areaLevel({ id: "u5", level: "viewer" }, com, [], now)).toBe("ver")
  })

  it("área não restrita: concessão só sobe o nível, nunca rebaixa", () => {
    expect(areaLevel({ id: "u4", level: "operator" }, com, [grant({ areaId: "comercial", level: "gerir" })], now)).toBe("gerir")
    expect(areaLevel({ id: "u4", level: "operator" }, com, [grant({ areaId: "comercial", level: "ver" })], now)).toBe("operar")
  })

  it("área restrita: sem concessão fica na vitrine, mesmo sendo admin", () => {
    expect(areaLevel({ id: "u3", level: "admin" }, fin, [], now)).toBe("vitrine")
    expect(areaLevel({ id: "u4", level: "operator" }, fin, [], now)).toBe("vitrine")
  })

  it("área restrita: vale a concessão da própria pessoa", () => {
    expect(areaLevel({ id: "u4", level: "operator" }, fin, [grant({ level: "operar" })], now)).toBe("operar")
    expect(areaLevel({ id: "u9", level: "operator" }, fin, [grant({ level: "operar" })], now)).toBe("vitrine")
  })

  it("concessão vencida não vale", () => {
    const vencida = grant({ level: "operar", expiresAt: "2026-11-08T00:00:00Z" })
    expect(grantActive(vencida, now)).toBe(false)
    expect(areaLevel({ id: "u4", level: "operator" }, fin, [vencida], now)).toBe("vitrine")
    expect(grantActive(grant({ expiresAt: "2026-12-01T00:00:00Z" }), now)).toBe(true)
  })
})

describe("ler e gravar", () => {
  it("vitrine não lê; ver lê", () => {
    expect(canReadArea("vitrine")).toBe(false)
    expect(canReadArea("ver")).toBe(true)
  })

  it("gravar exige operar na área e não ser viewer na empresa", () => {
    expect(canWriteArea({ level: "operator" }, "ver")).toBe(false)
    expect(canWriteArea({ level: "operator" }, "operar")).toBe(true)
    expect(canWriteArea({ level: "viewer" }, "gerir")).toBe(false)
  })
})

describe("quem concede", () => {
  it("owner concede qualquer nível", () => {
    expect(canGrant({ level: "owner" }, "gerir", "gerir")).toBe(true)
  })

  it("construtor (gerir na área) concede até operar", () => {
    expect(canGrant({ level: "operator" }, "gerir", "operar")).toBe(true)
    expect(canGrant({ level: "operator" }, "gerir", "aprovar")).toBe(false)
    expect(canGrant({ level: "admin" }, "gerir", "gerir")).toBe(false)
  })

  it("sem gerir na área não concede nada, nem sendo admin", () => {
    expect(canGrant({ level: "admin" }, "aprovar", "ver")).toBe(false)
  })

  it("opções da tela: owner tudo menos vitrine; construtor até operar; demais nada", () => {
    expect(grantableLevels({ level: "owner" }, "gerir")).toEqual(["ver", "operar", "aprovar", "gerir"])
    expect(grantableLevels({ level: "operator" }, "gerir")).toEqual(["ver", "operar"])
    expect(grantableLevels({ level: "admin" }, "aprovar")).toEqual([])
  })
})

describe("tarefas", () => {
  const level = (a: string): AreaLevel => (a === "financeiro" ? "vitrine" : "operar")
  it("sem área: todos veem", () => {
    expect(canSeeTask({}, "u4", level)).toBe(true)
  })
  it("área restrita: só quem tem acesso, o responsável e os colaboradores", () => {
    expect(canSeeTask({ areaId: "financeiro", ownerId: "u1" }, "u4", level)).toBe(false)
    expect(canSeeTask({ areaId: "financeiro", ownerId: "u4" }, "u4", level)).toBe(true)
    expect(canSeeTask({ areaId: "financeiro", ownerId: "u1", collaborators: ["u4"] }, "u4", level)).toBe(true)
    expect(canSeeTask({ areaId: "comercial", ownerId: "u1" }, "u4", level)).toBe(true)
  })
})
