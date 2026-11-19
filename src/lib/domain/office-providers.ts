/**
 * Provedores de IA do escritório pessoal (docs/ESCRITORIO-PESSOAL.md §2): o que existe, como se conecta,
 * quanto custa e o que faz. A chave/login de qualquer um deles fica na Ponte HZK, no PC da pessoa;
 * o banco guarda só a descrição da conexão (`office_connections`).
 *
 * `wave` = em que leva a Ponte passa a falar com ele: 1 = primeiro (grátis e sem dúvida de termos),
 * 2 = depois (assinaturas e chaves pagas, com aviso de termos onde houver).
 */
export type ConnectionKind = "local" | "chave" | "assinatura"
export type ProviderCost = "gratis" | "cota_gratis" | "pago" | "plano"
export type Capability = "texto" | "imagem" | "codigo" | "arquivo" | "web"

export interface ProviderInfo {
  id: string
  label: string
  kind: ConnectionKind
  cost: ProviderCost
  capabilities: Capability[]
  wave: 1 | 2
  /** aviso a mostrar antes de conectar (termos de uso do provedor) */
  terms?: string
}

export const OFFICE_PROVIDERS: ProviderInfo[] = [
  { id: "ollama", label: "Ollama (no seu PC)", kind: "local", cost: "gratis", capabilities: ["texto", "codigo"], wave: 1 },
  { id: "lmstudio", label: "LM Studio (no seu PC)", kind: "local", cost: "gratis", capabilities: ["texto", "codigo"], wave: 1 },
  { id: "openrouter", label: "OpenRouter", kind: "chave", cost: "cota_gratis", capabilities: ["texto", "codigo"], wave: 1 },
  { id: "gemini", label: "Google Gemini", kind: "chave", cost: "cota_gratis", capabilities: ["texto", "imagem", "codigo", "arquivo"], wave: 2 },
  { id: "groq", label: "Groq", kind: "chave", cost: "cota_gratis", capabilities: ["texto"], wave: 2 },
  { id: "openai", label: "OpenAI", kind: "chave", cost: "pago", capabilities: ["texto", "imagem", "codigo", "arquivo"], wave: 2 },
  { id: "anthropic", label: "Anthropic", kind: "chave", cost: "pago", capabilities: ["texto", "codigo", "arquivo"], wave: 2 },
  {
    id: "claude_code",
    label: "Claude (assinatura, Claude Code)",
    kind: "assinatura",
    cost: "plano",
    capabilities: ["texto", "codigo", "arquivo", "web"],
    wave: 2,
    terms: "A Anthropic orienta apps feitos com o SDK do Claude a usar chave de API; usar a assinatura dentro de outro app não está claro nos termos. Use só a sua conta, no seu PC, para o seu trabalho.",
  },
  { id: "codex", label: "ChatGPT (assinatura, Codex)", kind: "assinatura", cost: "plano", capabilities: ["texto", "codigo", "arquivo"], wave: 2, terms: "Confira os termos da OpenAI sobre usar a assinatura em ferramentas de terceiros. Use só a sua conta." },
  { id: "gemini_cli", label: "Gemini (Gemini CLI)", kind: "assinatura", cost: "cota_gratis", capabilities: ["texto", "codigo", "arquivo", "web"], wave: 2, terms: "Confira os termos do Google para o Gemini CLI. Use só a sua conta." },
]

export const providerInfo = (id: string) => OFFICE_PROVIDERS.find((p) => p.id === id)

/** Custo conta como grátis no painel de Uso (local, cota grátis ou já pago no plano). */
export const isFreeCost = (c: ProviderCost) => c !== "pago"
