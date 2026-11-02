#!/usr/bin/env node
/**
 * Relatos de bug e ideias enviados pelo app (Guia do dia → "Relatar bug ou ideia").
 * Lê da tabela `events` (tipo feedback.*) com a chave de servidor do .env.local, só leitura.
 *
 *   node scripts/feedback.mjs           → só os novos (desde a última leitura)
 *   node scripts/feedback.mjs --todos   → todos
 *   node scripts/feedback.mjs --ver     → os novos, sem marcar como lidos
 *
 * "Até onde já li" fica em .claude/feedback-lido.txt (só nesta máquina, fora do Git).
 * Usado pelo comando /feedback do Claude Code (.claude/commands/feedback.md).
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const envFile = path.join(root, ".env.local")
const cursorFile = path.join(root, ".claude", "feedback-lido.txt")
const args = new Set(process.argv.slice(2))

const env = Object.fromEntries(
  fs
    .readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SECRET_KEY
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SECRET_KEY no .env.local")
  process.exit(1)
}

const since = args.has("--todos") ? null : fs.existsSync(cursorFile) ? fs.readFileSync(cursorFile, "utf8").trim() : null
const filter = ["event_type=like.feedback.*", "order=created_at.asc", "limit=200", since && `created_at=gt.${encodeURIComponent(since)}`].filter(Boolean).join("&")
const res = await fetch(`${url}/rest/v1/events?select=*&${filter}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
if (!res.ok) {
  console.error(`Erro ao ler: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const rows = await res.json()

const members = await fetch(`${url}/rest/v1/members?select=team_id,display_name`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((r) => (r.ok ? r.json() : []))
const nameOf = (id) => members.find((m) => m.team_id === id)?.display_name ?? id

if (!rows.length) {
  console.log(since ? `Nenhum relato novo desde ${since}.` : "Nenhum relato ainda.")
  process.exit(0)
}

console.log(`# ${rows.length} relato(s)${since ? ` novo(s) desde ${since}` : ""}\n`)
for (const r of rows) {
  const m = r.metadata ?? {}
  const kind = r.event_type === "feedback.bug" ? "🐞 Bug" : "💡 Ideia"
  const when = new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
  console.log(`## ${kind} · ${nameOf(r.actor_id)} · ${when}`)
  console.log(`- Tela: ${m.path ?? r.entity_id}${m.screen ? ` (${m.screen})` : ""}`)
  console.log(`- ID: ${r.id}\n`)
  console.log(`${m.text ?? ""}\n`)
}

if (!args.has("--ver")) {
  fs.mkdirSync(path.dirname(cursorFile), { recursive: true })
  fs.writeFileSync(cursorFile, rows.at(-1).created_at)
}
