/**
 * Regras da tela de abertura que não dependem do Electron (testadas em abertura-estado.test.ts).
 */

/** Tempo mínimo da abertura na tela, para não piscar (nota 39). */
export const ABERTURA_MINIMO_MS = 1200

export type EstadoPc = "sem-pc" | "aprovado" | "aguardando" | "desligado" | "offline" | "incerto"

/**
 * O servidor responde 401 tanto para PC ainda não liberado quanto para PC desligado (src/lib/server/workers.ts).
 * A diferença fica neste PC: se ele já foi aceito alguma vez, 401 quer dizer "desligado"; se nunca foi, "aguardando".
 */
export function classificarPc(i: { temToken: boolean; online: boolean; sonda?: "ok" | "401" | "falha"; jaAprovado: boolean }): EstadoPc {
  if (!i.temToken) return "sem-pc"
  if (!i.online) return "offline"
  if (i.sonda === "ok") return "aprovado"
  if (i.sonda === "401") return i.jaAprovado ? "desligado" : "aguardando"
  return "incerto"
}

/** O código curto é a mesma dica (4 últimos caracteres) que o founder vê ao aprovar; o token inteiro nunca sai. */
export function codigoCurto(token: string) {
  return token.slice(-4)
}

/** Quanto ainda falta para cumprir o mínimo na tela (nunca negativo). */
export function faltaParaMinimo(inicio: number, agora: number, minimo = ABERTURA_MINIMO_MS) {
  return Math.max(0, minimo - (agora - inicio))
}
