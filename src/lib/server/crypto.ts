import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Criptografia dos tokens das redes sociais (AES-256-GCM).
 * Mesmo que alguém acesse o banco, sem TOKEN_ENCRYPTION_KEY (só na Vercel/.env.local)
 * os tokens são inúteis. GCM também detecta qualquer adulteração.
 */
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? ""
  const buf = Buffer.from(raw, "base64")
  if (buf.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY ausente ou inválida (precisa de 32 bytes em base64).")
  return buf
}

export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".")
}

export function decrypt(payload: string) {
  const [version, iv, tag, data] = payload.split(".")
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Token criptografado em formato inválido.")
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
}
