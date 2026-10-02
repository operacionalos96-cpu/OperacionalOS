"use client"

import { correctWhileTyping } from "@/lib/domain/autocorrect"

/**
 * Corretor automático num campo controlado: devolve o texto novo (já corrigido,
 * se a tecla fechou uma palavra) e devolve o cursor para o lugar certo.
 *   onChange={(e) => setText(autocorrected(text, e.currentTarget))}
 */
export function autocorrected(prev: string, el: HTMLInputElement | HTMLTextAreaElement): string {
  const caret = el.selectionStart ?? el.value.length
  const r = correctWhileTyping(prev, el.value, caret)
  if (r.text !== el.value) requestAnimationFrame(() => el.setSelectionRange(r.caret, r.caret))
  return r.text
}

/** Atributos do corretor do navegador (sublinhado + sugestões no botão direito) em pt-BR. */
export const spellProps = { spellCheck: true, lang: "pt-BR", autoCorrect: "on", autoCapitalize: "sentences" } as const
