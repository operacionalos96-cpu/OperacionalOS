/**
 * Configuração local do app (só neste PC, nunca vai ao servidor): tema, pastas liberadas por bot,
 * nível confirmado por bot e endereço confirmado de provedor personalizado. Segredos NÃO ficam aqui
 * (ficam no cofre). Tudo é validado ao ler: um arquivo alterado à mão não sobe o poder de um bot.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs"
import nodePath from "node:path"

export type ThemeMode = "claro" | "escuro" | "sistema"
export interface Settings {
  theme: ThemeMode
  folders: Record<string, string[]>
  levels: Record<string, 0 | 1>
  endpoints: Record<string, string>
  pcName: string
}

const AGENT = /^agt_[0-9A-HJKMNP-TV-Z]{26}$/
const CONN = /^con_[0-9A-HJKMNP-TV-Z]{26}$/

export function sanitize(raw: unknown, ceiling = 1): Settings {
  const o = (raw && typeof raw === "object" ? raw : {}) as { theme?: unknown; pcName?: unknown; folders?: Record<string, unknown>; levels?: Record<string, unknown>; endpoints?: Record<string, unknown> }
  const s: Settings = { theme: "sistema", folders: {}, levels: {}, endpoints: {}, pcName: "" }
  if (o.theme === "claro" || o.theme === "escuro" || o.theme === "sistema") s.theme = o.theme
  if (typeof o.pcName === "string") s.pcName = o.pcName.slice(0, 80)
  for (const [k, v] of Object.entries(o.folders ?? {}))
    if (AGENT.test(k) && Array.isArray(v)) s.folders[k] = v.filter((p): p is string => typeof p === "string" && p.length < 1000).slice(0, 20)
  for (const [k, v] of Object.entries(o.levels ?? {})) if (AGENT.test(k) && (v === 0 || v === 1) && v <= ceiling) s.levels[k] = v
  for (const [k, v] of Object.entries(o.endpoints ?? {})) if (CONN.test(k) && typeof v === "string" && v.length < 300) s.endpoints[k] = v
  return s
}

export function settingsStore(file: string) {
  let cur: Settings
  try {
    cur = sanitize(JSON.parse(readFileSync(file, "utf8")))
  } catch {
    cur = sanitize({})
  }
  const save = () => {
    mkdirSync(nodePath.dirname(file), { recursive: true })
    writeFileSync(`${file}.tmp`, JSON.stringify(cur, null, 2))
    renameSync(`${file}.tmp`, file)
  }
  return {
    get: () => cur,
    update(fn: (s: Settings) => void) {
      const next = structuredClone(cur)
      fn(next)
      cur = sanitize(next)
      save()
      return cur
    },
  }
}
