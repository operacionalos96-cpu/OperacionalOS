import { describe, expect, it } from "vitest"
import { PERMISSIONS, can, type Permission, type RoleLevel } from "./org"

// Tabela-verdade da matriz (ADR 0005). Se mudar, a migration 0019 precisa mudar junto.
const expected: Record<RoleLevel, Permission[]> = {
  viewer: ["data.read"],
  operator: ["data.read", "data.write"],
  admin: ["data.read", "data.write", "settings.write"],
  owner: ["data.read", "data.write", "settings.write", "owners.manage"],
}

describe("matriz de permissões por cargo", () => {
  for (const [level, allowed] of Object.entries(expected) as [RoleLevel, Permission[]][]) {
    it(`${level} pode exatamente: ${allowed.join(", ")}`, () => {
      const granted = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(level, p))
      expect(granted).toEqual(allowed)
    })
  }
})
