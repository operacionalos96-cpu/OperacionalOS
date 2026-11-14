import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { fileVault, iaKeyName, redact, type Cipher } from "./vault"

// cifra de teste (no app é a DPAPI do Windows): inverte e mistura os bytes, para provar que o arquivo não tem o texto
const cipher: Cipher = {
  encrypt: (p) => Buffer.from(Buffer.from(p, "utf8").map((b) => b ^ 0x5a)).reverse(),
  decrypt: (d) => Buffer.from(Buffer.from(d).reverse().map((b) => b ^ 0x5a)).toString("utf8"),
}
const dir = mkdtempSync(join(tmpdir(), "hzk-cofre-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const CON = "con_" + "A".repeat(26)

describe("cofre", () => {
  it("guarda cifrado: o arquivo não contém a chave", async () => {
    const v = fileVault(join(dir, "cofre.bin"), cipher)
    const name = iaKeyName(CON, "https://openrouter.ai/api/v1/")
    await v.set(name, "sk-or-v1-segredo123456")
    await v.set("pc/token", "oos_" + "x".repeat(43))
    expect(await v.get(name)).toBe("sk-or-v1-segredo123456")
    const raw = readFileSync(join(dir, "cofre.bin"))
    expect(raw.toString("utf8")).not.toContain("segredo123456")
    expect(raw.toString("latin1")).not.toContain("oos_")
    await v.delete(name)
    expect(await v.has(name)).toBe(false)
    expect(await v.get("pc/token")).toMatch(/^oos_/)
  })
  it("a chave fica presa ao endereço: outro endereço é outra entrada", () => {
    expect(iaKeyName(CON, "https://ia.exemplo.com/v1")).toBe(iaKeyName(CON, "https://IA.exemplo.com/v1/"))
    expect(iaKeyName(CON, "https://ia.exemplo.com/v1")).not.toBe(iaKeyName(CON, "https://outro.exemplo.com/v1"))
  })
  it("recusa nome de entrada fora do formato e cofre de outro usuário", async () => {
    const v = fileVault(join(dir, "cofre.bin"), cipher)
    await expect(v.set("../../fora", "x")).rejects.toThrow(/inválido/)
    await expect(v.get("ia/qualquer")).rejects.toThrow(/inválido/)
    const outro = fileVault(join(dir, "cofre.bin"), { encrypt: cipher.encrypt, decrypt: () => { throw new Error("DPAPI") } })
    await expect(outro.get("pc/token")).rejects.toThrow(/ilegível/)
  })
})

describe("redação do registro", () => {
  it("tira formatos conhecidos e os valores do cofre", () => {
    const t = redact("chamei com sk-or-v1-abcdefghijk e oos_abcdefghijklmnopqrstuvwxyz e Authorization: Bearer xyz e minha-chave-local", ["minha-chave-local"])
    expect(t).not.toMatch(/sk-or-v1-abc|oos_abc|Bearer xyz|minha-chave-local/)
    expect(t).toContain("[segredo]")
  })
})
