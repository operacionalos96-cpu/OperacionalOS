import { randomBytes } from "node:crypto"
import { beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

describe("criptografia dos tokens", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64")
  })

  it("criptografa e descriptografa (e nunca guarda o texto puro)", async () => {
    const { decrypt, encrypt } = await import("./crypto")
    const secret = "ya29.token-de-exemplo"
    const enc = encrypt(secret)
    expect(enc).not.toContain(secret)
    expect(encrypt(secret)).not.toBe(enc) // IV aleatório: mesmo texto, resultado diferente
    expect(decrypt(enc)).toBe(secret)
  })

  it("recusa token adulterado", async () => {
    const { decrypt, encrypt } = await import("./crypto")
    const [v, iv, tag, data] = encrypt("abc").split(".")
    const tampered = [v, iv, tag, Buffer.from("xyz").toString("base64") + data].join(".")
    expect(() => decrypt(tampered)).toThrow()
  })
})
