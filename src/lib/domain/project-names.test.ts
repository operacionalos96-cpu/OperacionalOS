import { describe, expect, it } from "vitest"
import { canonicalProjectName, noteTaskIds, projectKey, uniqueProjects } from "./project-names"

describe("nomes de projeto", () => {
  it("ignora caixa, acento e espaços", () => {
    expect(projectKey("  Lançamento   HZK ")).toBe(projectKey("lancamento hzk"))
  })
  it("reaproveita a grafia existente", () => {
    expect(canonicalProjectName("site  novo", ["Site Novo", "Outro"])).toBe("Site Novo")
    expect(canonicalProjectName("Novo", ["Site Novo"])).toBe("Novo")
    expect(canonicalProjectName("   ", [])).toBeUndefined()
  })
  it("lista sem duplicatas equivalentes", () => {
    expect(uniqueProjects(["Site", "site ", "Ágil", "agil", undefined])).toEqual(["Ágil", "Site"])
  })
  it("une taskId legado e taskIds", () => {
    expect(noteTaskIds({ taskId: "a", taskIds: ["b", "a"] }).sort()).toEqual(["a", "b"])
    expect(noteTaskIds({})).toEqual([])
  })
})
