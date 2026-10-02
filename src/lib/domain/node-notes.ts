/**
 * Anotações do balão — o que vale a pena registrar mas poluiria o mapa:
 * comentários, observações e citações de apps/plataformas que usamos.
 * Ficam escondidas; o balão mostra só o contador e abre ao clicar.
 *
 * Para um tipo novo no futuro (link, número, arquivo, pergunta…): acrescente
 * em NOTE_KINDS. Telas, contador e gravação já entendem qualquer tipo.
 */
import type { NodeNote } from "./types"

export interface NoteKind {
  id: string
  label: string
  plural: string
  hint: string
  placeholder: string
  /** Pede o app/plataforma citado (e um link opcional). */
  cites?: boolean
}

export const NOTE_KINDS: NoteKind[] = [
  { id: "comentario", label: "Comentário", plural: "comentários", hint: "Conversa sobre a ideia", placeholder: "Escreva um comentário…" },
  { id: "observacao", label: "Observação", plural: "observações", hint: "Detalhe, cuidado ou lembrete", placeholder: "O que é bom saber sobre isto…" },
  {
    id: "citacao",
    label: "Citação",
    plural: "citações",
    hint: "App ou plataforma que usamos (redes sociais, ferramentas…)",
    placeholder: "Por que este app/plataforma entra aqui…",
    cites: true,
  },
]

/** Tipo desconhecido (criado por uma versão mais nova) aparece como comentário. */
export const noteKind = (id: string): NoteKind => NOTE_KINDS.find((k) => k.id === id) ?? NOTE_KINDS[0]

/** Apps e plataformas sugeridos na citação (dá para digitar qualquer outro). */
export const KNOWN_APPS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "WhatsApp",
  "Facebook",
  "LinkedIn",
  "X (Twitter)",
  "Hotmart",
  "Kiwify",
  "Canva",
  "CapCut",
  "Notion",
  "Google Drive",
  "Meta Ads",
  "Google Ads",
  "ChatGPT",
  "Gemini",
]

export const NOTE_LIMITS = { text: 1000, app: 40, notes: 100 }

/** Anotação limpa e dentro dos limites (null = vazia, não grava). */
export function makeNote(input: { kind: string; text: string; app?: string; url?: string }, authorId: string, id: string, now = new Date()): NodeNote | null {
  const text = input.text.trim().slice(0, NOTE_LIMITS.text)
  const app = noteKind(input.kind).cites ? input.app?.trim().slice(0, NOTE_LIMITS.app) || undefined : undefined
  const url = input.url?.trim() && /^https?:\/\//i.test(input.url.trim()) ? input.url.trim().slice(0, 500) : undefined
  if (!text && !app) return null
  return { id, kind: input.kind, text, app, url, authorId, createdAt: now.toISOString() }
}

/** Acrescenta mantendo no máximo NOTE_LIMITS.notes (as mais antigas saem). */
export function addNote(notes: NodeNote[] | undefined, note: NodeNote): NodeNote[] {
  return [...(notes ?? []), note].slice(-NOTE_LIMITS.notes)
}

/** Sem anotações = campo some do balão (nada a gravar). */
export function removeNote(notes: NodeNote[] | undefined, id: string): NodeNote[] | undefined {
  const rest = (notes ?? []).filter((n) => n.id !== id)
  return rest.length ? rest : undefined
}

/** "2 comentários · 1 citação" — só tipos presentes, na ordem de NOTE_KINDS. */
export function notesSummary(notes: NodeNote[] | undefined) {
  const counts = new Map<string, number>()
  for (const n of notes ?? []) counts.set(noteKind(n.kind).id, (counts.get(noteKind(n.kind).id) ?? 0) + 1)
  return NOTE_KINDS.filter((k) => counts.has(k.id))
    .map((k) => `${counts.get(k.id)} ${counts.get(k.id) === 1 ? k.label.toLowerCase() : k.plural}`)
    .join(" · ")
}
