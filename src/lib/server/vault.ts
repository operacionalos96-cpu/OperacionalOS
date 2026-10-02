import "server-only"
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { decrypt, encrypt, keyFrom } from "./crypto"

/**
 * Cofre de senhas — só no servidor.
 * - Segredos (usuário, senha, 2FA, códigos, observações) criptografados com VAULT_ENCRYPTION_KEY,
 *   amarrados ao id do item.
 * - Abrir o cofre exige a senha da conta de novo e vale por UNLOCK_SECONDS (cookie httpOnly assinado).
 */
export const UNLOCK_SECONDS = 5 * 60
export const UNLOCK_COOKIE = "cofre"

export interface VaultSecret {
  username?: string
  password?: string
  totp?: string
  /** Chave/frase de recuperação única (ex.: Apple, cripto, Bitwarden). */
  recoveryKey?: string
  recovery?: string
  notes?: string
}

const LIMITS = { name: 120, url: 300, field: 4000 }

/** Limpa e limita o que veio do navegador. */
export function cleanItem(body: unknown): { id?: string; name: string; url?: string; secret: VaultSecret } | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const s = (b.secret && typeof b.secret === "object" ? b.secret : {}) as Record<string, unknown>
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined)
  const name = str(b.name, LIMITS.name)?.trim()
  if (!name) return null
  const url = str(b.url, LIMITS.url)?.trim()
  const id = typeof b.id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(b.id) ? b.id : undefined
  return {
    id,
    name,
    url: url && /^https?:\/\//i.test(url) ? url : url ? `https://${url}` : undefined,
    secret: {
      username: str(s.username, LIMITS.field),
      password: str(s.password, LIMITS.field),
      totp: str(s.totp, LIMITS.field),
      recoveryKey: str(s.recoveryKey, LIMITS.field),
      recovery: str(s.recovery, LIMITS.field),
      notes: str(s.notes, LIMITS.field),
    },
  }
}

export const sealSecret = (itemId: string, secret: VaultSecret) => encrypt(JSON.stringify(secret), "VAULT_ENCRYPTION_KEY", `cofre:${itemId}`)
export const openSecret = (itemId: string, sealed: string) => JSON.parse(decrypt(sealed, "VAULT_ENCRYPTION_KEY", `cofre:${itemId}`)) as VaultSecret

const sign = (userId: string, exp: number) =>
  createHmac("sha256", keyFrom("VAULT_ENCRYPTION_KEY")).update(`cofre-desbloqueio:${userId}:${exp}`).digest("base64url")

/** Valor do cookie de desbloqueio: "<expira>.<assinatura>". */
export function unlockToken(userId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + UNLOCK_SECONDS
  return `${exp}.${sign(userId, exp)}`
}

/** Segundos que faltam (0 = trancado). Assinatura errada, de outra pessoa ou vencida = trancado. */
export function unlockRemaining(token: string | undefined, userId: string, now = Date.now()) {
  const [expRaw, sig] = (token ?? "").split(".")
  const exp = Number(expRaw)
  if (!exp || !sig) return 0
  const good = Buffer.from(sign(userId, exp))
  const got = Buffer.from(sig)
  if (good.length !== got.length || !timingSafeEqual(good, got)) return 0
  return Math.max(0, exp - Math.floor(now / 1000))
}

/** Tentativas de abrir o cofre: 5 a cada 5 min por pessoa; 10 erros em 15 min trancam para todos. */
export const UNLOCK_LIMITS = { perUser: 5, perUserWindow: 300, failures: 10, failuresWindow: 900 }

// ---------- senha do cofre (separada do login) ----------

export const MIN_VAULT_PASSWORD = 10

/** Hash scrypt com sal aleatório: "s1.<sal>.<hash>". Não dá para voltar à senha. */
export function hashVaultPassword(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password.normalize("NFKC"), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return ["s1", salt.toString("base64"), hash.toString("base64")].join(".")
}

export function verifyVaultPassword(password: string, stored: string) {
  const [v, salt, hash] = stored.split(".")
  if (v !== "s1" || !salt || !hash) return false
  const got = scryptSync(password.normalize("NFKC"), Buffer.from(salt, "base64"), 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const want = Buffer.from(hash, "base64")
  return got.length === want.length && timingSafeEqual(got, want)
}
