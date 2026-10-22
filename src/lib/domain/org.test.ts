import { describe, expect, it } from "vitest"
import {
  ROLE_LEVELS,
  buildHierarchyTree,
  isAtLeast,
  leaderOfMember,
  primaryRole,
  rankOf,
  rolesOfMember,
  wouldCreateHierarchyCycle,
  type MemberRole,
  type OrgRole,
} from "./org"

describe("Estrutura Organizacional e Hierarquia — Regras de Negócio", () => {
  const roles: OrgRole[] = [
    { id: "founder", title: "Founder", level: "owner", active: true },
    { id: "ceo", title: "CEO", level: "admin", active: true },
    { id: "cfo", title: "CFO", level: "admin", active: true },
    { id: "dev", title: "Desenvolvedor", level: "operator", active: true },
  ]

  it("garante ordenação correta de níveis de acesso (rankOf e isAtLeast)", () => {
    expect(rankOf("owner")).toBeGreaterThan(rankOf("admin"))
    expect(rankOf("admin")).toBeGreaterThan(rankOf("operator"))
    expect(rankOf("operator")).toBeGreaterThan(rankOf("viewer"))

    expect(isAtLeast("owner", "admin")).toBe(true)
    expect(isAtLeast("admin", "owner")).toBe(false)
    expect(isAtLeast("operator", "operator")).toBe(true)
    expect(isAtLeast("viewer", "operator")).toBe(false)
  })

  it("permite que uma mesma pessoa acumule múltiplos cargos (ex.: Founder + CEO + CFO)", () => {
    const memberRoles: MemberRole[] = [
      { id: "mr1", memberId: "u1", roleId: "founder", isPrimary: true, assignedAt: "2026-01-01", assignedBy: "sys" },
      { id: "mr2", memberId: "u1", roleId: "ceo", isPrimary: false, assignedAt: "2026-01-01", assignedBy: "sys" },
      { id: "mr3", memberId: "u1", roleId: "cfo", isPrimary: false, assignedAt: "2026-01-01", assignedBy: "sys" },
    ]

    const assigned = rolesOfMember("u1", memberRoles, roles)
    expect(assigned.map((r) => r.id)).toEqual(["founder", "ceo", "cfo"])

    const primary = primaryRole("u1", memberRoles, roles)
    expect(primary?.id).toBe("founder")
  })

  it("seleciona o primeiro cargo atribuído caso nenhum esteja expressamente marcado como primário", () => {
    const memberRoles: MemberRole[] = [
      { id: "mr2", memberId: "u2", roleId: "dev", isPrimary: false, assignedAt: "2026-01-01", assignedBy: "sys" },
    ]
    const primary = primaryRole("u2", memberRoles, roles)
    expect(primary?.id).toBe("dev")
  })

  it("identifica corretamente o superior imediato (leaderOfMember)", () => {
    const memberRoles: MemberRole[] = [
      { id: "mr1", memberId: "u3", roleId: "dev", reportsToMemberId: "u1", assignedAt: "2026-01-01", assignedBy: "u1" },
    ]
    expect(leaderOfMember("u3", memberRoles)).toBe("u1")
    expect(leaderOfMember("u1", memberRoles)).toBeUndefined()
  })

  it("detecta e previne ciclos na hierarquia (wouldCreateHierarchyCycle)", () => {
    // u1 -> lidera u2 -> lidera u3
    const memberRoles: MemberRole[] = [
      { id: "mr2", memberId: "u2", roleId: "dev", reportsToMemberId: "u1", assignedAt: "2026-01-01", assignedBy: "u1" },
      { id: "mr3", memberId: "u3", roleId: "dev", reportsToMemberId: "u2", assignedAt: "2026-01-01", assignedBy: "u1" },
    ]

    // u1 não pode auto-reportar
    expect(wouldCreateHierarchyCycle("u1", "u1", memberRoles)).toBe(true)

    // Se tentarmos fazer u1 reportar a u3 (que é liderado por u2, que é liderado por u1): ciclo!
    expect(wouldCreateHierarchyCycle("u1", "u3", memberRoles)).toBe(true)

    // Se tentarmos fazer u1 reportar a u2: ciclo!
    expect(wouldCreateHierarchyCycle("u1", "u2", memberRoles)).toBe(true)

    // u3 reportar a u1 diretamente é válido (não tem ciclo)
    expect(wouldCreateHierarchyCycle("u3", "u1", memberRoles)).toBe(false)
  })

  it("constrói a árvore hierárquica corretamente (buildHierarchyTree)", () => {
    // u1 é Founder/CEO (raiz)
    // u2 e u3 reportam a u1
    // u4 reporta a u2
    const memberRoles: MemberRole[] = [
      { id: "mr1", memberId: "u1", roleId: "founder", assignedAt: "2026-01-01", assignedBy: "sys" },
      { id: "mr2", memberId: "u2", roleId: "dev", reportsToMemberId: "u1", assignedAt: "2026-01-01", assignedBy: "sys" },
      { id: "mr3", memberId: "u3", roleId: "dev", reportsToMemberId: "u1", assignedAt: "2026-01-01", assignedBy: "sys" },
      { id: "mr4", memberId: "u4", roleId: "colab", reportsToMemberId: "u2", assignedAt: "2026-01-01", assignedBy: "sys" },
    ]

    const tree = buildHierarchyTree(["u1", "u2", "u3", "u4"], memberRoles)
    expect(tree).toHaveLength(1)
    expect(tree[0].memberId).toBe("u1")
    expect(tree[0].subordinates.map((s) => s.memberId).sort()).toEqual(["u2", "u3"])

    const u2Node = tree[0].subordinates.find((s) => s.memberId === "u2")
    expect(u2Node?.subordinates.map((s) => s.memberId)).toEqual(["u4"])
  })
})
