"use client"

import { publicId } from "@/lib/domain/jobs"
import { supabaseBrowser } from "@/lib/supabase/client"

/**
 * Relatos de bug e sugestões de melhoria (Guia do dia → "Relatar bug ou ideia").
 * Gravados na tabela `events` com o tipo `feedback.bug` / `feedback.sugestao` (só inserir/ler, SQL
 * 0010 — sem tabela nova). Não são fatos do negócio: o feed do AI Office ignora esse tipo.
 * Quem desenvolve lê os relatos no computador com `/feedback` (Claude Code) ou
 * `node scripts/feedback.mjs`, que guarda até onde já leu.
 */
export type FeedbackKind = "bug" | "sugestao"

export const FEEDBACK_PREFIX = "feedback."

export async function sendFeedback(input: { kind: FeedbackKind; text: string; meId: string; path: string }) {
  const { error } = await supabaseBrowser()
    .from("events")
    .insert({
      id: publicId("evt"),
      event_type: `${FEEDBACK_PREFIX}${input.kind}`,
      entity_type: "app",
      entity_id: input.path,
      actor_type: "human",
      actor_id: input.meId,
      // Contexto que ajuda a reproduzir: onde estava, tamanho da tela e navegador.
      metadata: {
        text: input.text.trim(),
        path: input.path,
        screen: typeof window === "undefined" ? undefined : `${window.innerWidth}x${window.innerHeight}`,
        userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
      },
      created_at: new Date().toISOString(),
    })
  if (error) throw new Error(error.message)
}
