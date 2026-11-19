/**
 * Catálogo de provedores do Dock (pesquisa F2, nota 41 do vault; fontes oficiais abertas em 12/11/2026).
 * wave 1 = chave ou programa local (adaptador compatível com OpenAI ou Anthropic nativo);
 * wave 2 = programa de agente por ACP (desligado nesta leva); wave 0 = a confirmar: SEM botão.
 */
export interface DockProvider {
  id: string
  label: string
  kind: "local" | "chave" | "acp" | "assinatura"
  how: string
  cost: string
  wave: 0 | 1 | 2
  featured?: boolean
  terms?: string
  why?: string
  source: string
}

export const DOCK_PROVIDERS: DockProvider[] = [
  { id: "ollama", label: "Ollama", kind: "local", how: "Programa no seu PC", cost: "Grátis", wave: 1, featured: true, source: "docs.ollama.com" },
  { id: "openrouter", label: "OpenRouter", kind: "chave", how: "Chave colada", cost: "Modelos grátis: 50 pedidos por dia", wave: 1, featured: true, source: "openrouter.ai" },
  { id: "claude", label: "Claude", kind: "chave", how: "Chave da Claude Console", cost: "Pago por uso", wave: 1, featured: true, source: "code.claude.com" },
  { id: "gemini", label: "Gemini", kind: "chave", how: "Chave do AI Studio", cost: "Cota grátis", wave: 1, featured: true, terms: "No plano grátis, o Google usa o conteúdo para melhorar os produtos: o porteiro não deixa dado da empresa ir para ele.", source: "aistudio.google.com" },
  { id: "codex", label: "ChatGPT (Codex)", kind: "acp", how: "Codex no PC, com o seu login", cost: "Seu plano ChatGPT ou chave", wave: 2, featured: true, terms: "A OpenAI recomenda chave para automação. Use só a sua conta.", source: "learn.chatgpt.com" },
  { id: "grok", label: "Grok", kind: "chave", how: "Chave da xAI", cost: "Pago por uso", wave: 1, source: "docs.x.ai" },
  { id: "deepseek", label: "DeepSeek", kind: "chave", how: "Chave", cost: "Pago por uso", wave: 1, terms: "Confira a política de dados do provedor.", source: "api-docs.deepseek.com" },
  { id: "mistral", label: "Mistral", kind: "chave", how: "Chave", cost: "Pago por uso", wave: 1, source: "mistral.ai" },
  { id: "kimi", label: "Kimi", kind: "chave", how: "Chave do console Kimi", cost: "Pago por uso", wave: 1, terms: "Confira a política de dados do provedor.", source: "platform.kimi.ai" },
  { id: "inception", label: "Inception (Mercury)", kind: "chave", how: "Chave", cost: "100 milhões de tokens grátis para começar", wave: 1, source: "docs.inceptionlabs.ai" },
  { id: "opencode", label: "OpenCode", kind: "acp", how: "OpenCode no PC", cost: "Grátis + o provedor que você escolher", wave: 2, source: "opencode.ai" },
  { id: "gemini_cli", label: "Gemini CLI", kind: "acp", how: "Gemini CLI no PC, com chave", cost: "Pela chave", wave: 2, source: "github.com/google-gemini" },
  { id: "copilot", label: "GitHub Copilot", kind: "acp", how: "Copilot CLI no PC", cost: "Seu plano Copilot", wave: 2, source: "docs.github.com" },
  { id: "cursor", label: "Cursor", kind: "acp", how: "Cursor CLI no PC", cost: "Seu plano Cursor", wave: 2, source: "cursor.com" },
  { id: "cline", label: "Cline", kind: "acp", how: "Cline no PC", cost: "Conta Cline ou sua chave", wave: 2, source: "docs.cline.bot" },
  { id: "pi", label: "Pi", kind: "acp", how: "Pi no PC", cost: "Grátis + provedor", wave: 2, source: "github.com/badlogic/pi-mono" },
  { id: "hermes", label: "Hermes Agent", kind: "acp", how: "Hermes no PC", cost: "Grátis + provedor", wave: 2, source: "hermes-agent.nousresearch.com" },
  { id: "vibe", label: "Mistral Vibe", kind: "acp", how: "Vibe no PC", cost: "Plano Mistral", wave: 2, source: "mistral.ai" },
  { id: "kimi_code", label: "Kimi Code", kind: "acp", how: "Kimi Code no PC", cost: "Plano Kimi", wave: 2, source: "github.com/MoonshotAI" },
  { id: "lmstudio", label: "LM Studio", kind: "local", how: "Programa no seu PC", cost: "Grátis", wave: 0, why: "uso no trabalho a confirmar", source: "lmstudio.ai" },
  { id: "claude_sub", label: "Claude (assinatura)", kind: "assinatura", how: "—", cost: "—", wave: 0, why: "a Anthropic não permite o login do claude.ai em app de terceiro sem aprovação", source: "code.claude.com" },
  { id: "grok_sub", label: "Grok (assinatura)", kind: "assinatura", how: "—", cost: "—", wave: 0, why: "sem fonte oficial para apps como o nosso", source: "x.ai" },
  { id: "muse", label: "Muse Spark (Meta)", kind: "chave", how: "—", cost: "—", wave: 0, why: "API em prévia, só nos EUA (segundo notícias)", source: "notícias" },
  { id: "devin", label: "Devin", kind: "chave", how: "—", cost: "—", wave: 0, why: "plano com API a confirmar", source: "docs.devin.ai" },
]
export const KIND_TEXT = { local: "No seu PC", chave: "Chave", acp: "Programa de agente (ACP)", assinatura: "Assinatura" } as const
