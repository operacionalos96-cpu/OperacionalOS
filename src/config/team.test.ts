import { describe, expect, it } from "vitest"
import { TEAM, colorFor, getUser, syncTeamMembers, teamFrom } from "./team"

const ana = { teamId: "u_ana", displayName: "Ana Souza", email: "ana@hzk.test", joinedAt: "2026-05-01" }
const bia = { teamId: "u_bia", email: "bia@hzk.test", joinedAt: "2026-03-01" }
const gabriel = { teamId: "u1", displayName: "Gabriel", email: "g@hzk.test", joinedAt: "2026-01-01" }

describe("pessoas da equipe: uma fonte só", () => {
  it("a mesma pessoa tem a mesma cor e nome, em qualquer ordem da lista", () => {
    const a = teamFrom([ana, bia, gabriel])
    const b = teamFrom([gabriel, bia, ana])
    expect(a).toEqual(b)
    expect(a.find((u) => u.id === "u_ana")?.color).toBe(colorFor("u_ana"))
  })

  it("fundadores mantêm a cor de sempre; o nome do banco vence o padrão", () => {
    expect(colorFor("u1")).toBe("#2f6fb0")
    expect(teamFrom([{ ...gabriel, displayName: "Gabriel R." }])[0].name).toBe("Gabriel R.")
  })

  it("sem nome cadastrado, usa o começo do e-mail; iniciais vêm do nome", () => {
    const [u] = teamFrom([ana])
    expect(u.initials).toBe("AS")
    expect(teamFrom([bia])[0].name).toBe("bia")
  })

  it("desativado sai das listas, mas continua com nome no histórico", () => {
    syncTeamMembers([gabriel, { ...ana, active: false }])
    expect(TEAM.map((u) => u.id)).toEqual(["u1"])
    expect(getUser("u_ana").name).toBe("Ana Souza")
  })

  it("cada carga substitui a lista (nunca acumula quem saiu)", () => {
    syncTeamMembers([gabriel, ana])
    syncTeamMembers([gabriel])
    expect(TEAM.map((u) => u.id)).toEqual(["u1"])
  })

  it("sem id (item sem dono) mostra Ninguém em vez de quebrar a tela", () => {
    expect(getUser(undefined).name).toBe("Ninguém")
    expect(getUser("").initials).toBe("?")
  })
})
