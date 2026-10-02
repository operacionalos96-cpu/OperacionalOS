import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Criptografia AES-256-GCM (tokens das redes sociais e o Cofre de senhas).
 * Sem a chave (só na Vercel/.env.local) o que está no banco é inútil; GCM também
 * detecta adulteração. `aad` amarra o texto a um contexto (ex.: o id do item do cofre):
 * copiar o segredo de um item para outro faz a leitura falhar.
 */
type KeyName = "TOKEN_ENCRYPTION_KEY" | "VAULT_ENCRYPTION_KEY"

export function keyFrom(name: KeyName) {
  const buf = Buffer.from(process.env[name] ?? "", "base64")
  if (buf.length !== 32) throw new Error(`${name} ausente ou inválida (precisa de 32 bytes em base64).`)
  return buf
}

export function encrypt(plain: string, keyName: KeyName = "TOKEN_ENCRYPTION_KEY", aad?: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFrom(keyName), iv)
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"))
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".")
}

export function decrypt(payload: string, keyName: KeyName = "TOKEN_ENCRYPTION_KEY", aad?: string) {
  const [version, iv, tag, data] = payload.split(".")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Texto criptografado em formato inválido.")
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(keyName), Buffer.from(iv, "base64"))
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}
