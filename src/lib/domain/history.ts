/**
 * Desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z) — regras puras, testadas em history.test.ts.
 * Guarda "fotos" do mapa; cada mudança nova apaga o que dava para refazer.
 */
export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

/** Quantas mudanças dá para desfazer. */
export const HISTORY_LIMIT = 100

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

/** Mudança nova: a atual vai para o passado; o que dava para refazer some. */
export function record<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] }
}

/** Troca a foto atual sem criar passo (ex.: mudança que veio do sócio). */
export const replacePresent = <T>(h: History<T>, present: T): History<T> => ({ ...h, present })

export function undo<T>(h: History<T>): History<T> | null {
  if (!h.past.length) return null
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo<T>(h: History<T>): History<T> | null {
  if (!h.future.length) return null
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}
