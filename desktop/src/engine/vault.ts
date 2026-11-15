/**
 * Cofre do PC (nota 42, F5.2 §4): credencial do PC (oos_…), chaves de IA e tokens de conector.
 * Nunca vão ao banco, ao registro nem à tela depois de salvos.
 *
 * No app, a cifra é a do próprio Windows (Electron safeStorage = DPAPI, ligada ao usuário do PC):
 * o arquivo no disco só tem texto cifrado. Aqui a cifra é injetada, para o motor rodar nos testes.
 * Nomes das entradas:
 *   pc/token                                   credencial do PC
 *   ia/<connection_id>/<sha256 do endereço>    chave de IA presa ao endereço confirmado na janela do app
 *   conector/<connector_id>                    token de conector
 */
import { createHash } from "node:crypto"
import { promises as fsp } from "node:fs"
import nodePath from "node:path"

export interface Cipher {
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export interface SecretStore {
  get(name: string): Promise<string | null>
  set(name: string, value: string): Promise<void>
  delete(name: string): Promise<void>
  has(name: string): Promise<boolean>
}

const NAME = /^(pc\/token|ia\/con_[0-9A-HJKMNP-TV-Z]{26}\/[0-9a-f]{64}|conector\/[a-z][a-z0-9_]{1,30})$/

export const iaKeyName = (connectionId: string, endpoint: string) =>
  `ia/${connectionId}/${createHash("sha256").update(endpoint.replace(/\/+$/, "").toLowerCase()).digest("hex")}`

export function fileVault(file: string, cipher: Cipher): SecretStore {
  async function load(): Promise<Record<string, string>> {
    try {
      const raw = await fsp.readFile(file)
      return JSON.parse(cipher.decrypt(raw)) as Record<string, string>
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return {}
      throw new Error("cofre ilegível (outro usuário do Windows ou arquivo danificado)")
    }
  }
  async function save(all: Record<string, string>) {
    await fsp.mkdir(nodePath.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fsp.writeFile(tmp, cipher.encrypt(JSON.stringify(all)), { mode: 0o600 })
    await fsp.rename(tmp, file)
  }
  const check = (name: string) => {
    if (!NAME.test(name)) throw new Error("nome de entrada do cofre inválido")
  }
  return {
    async get(name) {
      check(name)
      return (await load())[name] ?? null
    },
    async has(name) {
      check(name)
      return name in (await load())
    },
    async set(name, value) {
      check(name)
      if (typeof value !== "string" || !value || value.length > 8000) throw new Error("segredo inválido")
      const all = await load()
      all[name] = value
      await save(all)
    },
    async delete(name) {
      check(name)
      const all = await load()
      delete all[name]
      await save(all)
    },
  }
}

export function memoryVault(initial: Record<string, string> = {}): SecretStore {
  const m = new Map(Object.entries(initial))
  return {
    get: async (n) => m.get(n) ?? null,
    has: async (n) => m.has(n),
    set: async (n, v) => void m.set(n, v),
    delete: async (n) => void m.delete(n),
  }
}

/**
 * Tira de qualquer texto o que parece segredo antes de ir para o registro local ou para o servidor
 * (ameaça 11 da nota 42). Formatos conhecidos + qualquer valor do cofre passado em `known`.
 */
const PATTERNS = [
  /oos_[A-Za-z0-9_-]{20,}/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-or-v1-[A-Za-z0-9_-]{10,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /xai-[A-Za-z0-9]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(authorization|x-api-key)\s*[:=]\s*\S+/gi,
]
export function redact(text: string, known: string[] = []): string {
  let out = text
  for (const k of known) if (k && k.length >= 8) out = out.split(k).join("[segredo]")
  for (const p of PATTERNS) out = out.replace(p, "[segredo]")
  return out
}
