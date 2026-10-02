import { randomBytes } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

describe("cofre de senhas", async () => {
  const v = await import("./vault")

  it("criptografa e só abre no mesmo item (não dá para trocar segredo de lugar)", () => {
    const sealed = v.sealSecret("item-1", { password: "S3nh@!" })
    expect(sealed).not.toContain("S3nh@!")
    expect(v.openSecret("item-1", sealed)).toEqual({ password: "S3nh@!" })
    expect(() => v.openSecret("item-2", sealed)).toThrow()
  })

  it("detecta adulteração no banco", () => {
    const [ver, iv, tag, data] = v.sealSecret("a", { password: "x" }).split(".")
    const flipped = Buffer.from(data, "base64")
    flipped[0] ^= 1
    expect(() => v.openSecret("a", [ver, iv, tag, flipped.toString("base64")].join("."))).toThrow()
  })

  it("desbloqueio: vale 5 min, só para a pessoa certa e não aceita falsificação", () => {
    const now = Date.now()
    const t = v.unlockToken("u2", now)
    expect(v.unlockRemaining(t, "u2", now)).toBe(300)
    expect(v.unlockRemaining(t, "u1", now)).toBe(0)
    expect(v.unlockRemaining(t, "u2", now + 301_000)).toBe(0)
    const [exp] = t.split(".")
    expect(v.unlockRemaining(`${Number(exp) + 9999}.${t.split(".")[1]}`, "u2", now)).toBe(0)
    expect(v.unlockRemaining(undefined, "u2", now)).toBe(0)
  })

  it("limpa a entrada e limita tentativas", () => {
    expect(v.cleanItem({ name: "  " })).toBeNull()
    expect(v.cleanItem({ name: "Gmail", url: "gmail.com", id: "../x", secret: { password: "p", extra: 1 } })).toEqual({
      id: undefined,
      name: "Gmail",
      url: "https://gmail.com",
      secret: { username: undefined, password: "p", totp: undefined, recoveryKey: undefined, recovery: undefined, notes: undefined },
    })
    for (let i = 0; i < 5; i++) expect(v.allowUnlockAttempt("x")).toBe(true)
    expect(v.allowUnlockAttempt("x")).toBe(false)
  })

  it("senha do cofre: guarda só o hash, confere certo e recusa errada", () => {
    const stored = v.hashVaultPassword("cofre-forte-123")
    expect(stored).not.toContain("cofre-forte-123")
    expect(v.hashVaultPassword("cofre-forte-123")).not.toBe(stored) // sal diferente a cada vez
    expect(v.verifyVaultPassword("cofre-forte-123", stored)).toBe(true)
    expect(v.verifyVaultPassword("cofre-forte-124", stored)).toBe(false)
    expect(v.verifyVaultPassword("x", "lixo")).toBe(false)
  })
})
