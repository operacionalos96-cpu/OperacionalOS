"use client"

import type { AgentSettings } from "@/lib/domain/whatsapp-agent"
import { opsAction } from "@/components/ai-office/ops-store"

/** Configuração do agente do WhatsApp (ai_settings "whatsapp_agent", ADR 0018). Sempre pelo servidor, que valida. */
export const agentSettings = {
  load: async () => (await opsAction<{ data: AgentSettings }>("agent.get", {})).data,
  save: async (data: AgentSettings) => (await opsAction<{ data: AgentSettings }>("agent.update", { data })).data,
  /** Um humano resolveu: o lead volta para o agente. */
  release: (leadId: string) => opsAction("agent.release", { id: leadId }),
}
