/**
 * Motor do HZK Dock na nuvem (ADR 0026): o MESMO motor do app de PC (desktop/src/engine), rodando no
 * servidor para quem ligou "Motor na nuvem". Diferenças, todas de propósito:
 *  - não há cofre do Windows: a única IA é o OpenRouter, com a chave da empresa (OPENROUTER_API_KEY);
 *  - não há pastas: nenhuma ferramenta de arquivo (foldersFor = null);
 *  - o servidor chama as ferramentas por dentro (sem HTTP e sem token), com o trabalhador "nuvem" da pessoa,
 *    e o banco confere lease e dono em cada chamada, como faz com o PC (0028/0030).
 *
 * Este arquivo não importa "server-only" nem o Supabase, para os testes rodarem contra o Postgres de teste.
 */
import { ServerError, type ServerClient } from "../../../desktop/src/engine/client"
import { createEngine, LEVEL_CEILING, type Delivery, type DeliveryIA, type EngineLog } from "../../../desktop/src/engine/engine"
import { PROVIDERS, ProviderError, openAICompatible, type ChatAdapter } from "../../../desktop/src/engine/providers"
import { memoryVault } from "../../../desktop/src/engine/vault"

/** IAs que o motor na nuvem sabe usar (com a chave da empresa). */
export const CLOUD_PROVIDERS = ["openrouter"] as const
export const CLOUD_ENGINE = "hzk-nuvem"

export const cloudCanUse = (ia: Pick<DeliveryIA, "kind" | "provider">) => ia.kind === "chave" && (CLOUD_PROVIDERS as readonly string[]).includes(ia.provider)

/** Fábrica de adaptadores da nuvem: OpenRouter com a chave do servidor; o resto não roda aqui. */
export function cloudAdapterFactory(opts: { openrouterKey: string | null; base?: string; timeoutMs?: number }) {
  return (ia: DeliveryIA): ChatAdapter => {
    if (!cloudCanUse(ia)) throw new ProviderError("other", `${ia.label} não roda no motor na nuvem`)
    if (!opts.openrouterKey) throw new ProviderError("other", "o servidor não tem a chave do OpenRouter")
    // teto menor que o do PC: a função do servidor tem tempo contado
    return openAICompatible({ base: opts.base ?? PROVIDERS.openrouter.base, key: opts.openrouterKey, provider: "openrouter", timeoutMs: opts.timeoutMs ?? 90_000 })
  }
}

/**
 * Aviso na conversa quando a nuvem não consegue responder por um motivo que a PESSOA resolve
 * (a IA do bot não roda aqui, falta o modelo, a cota do dia acabou). Falha passageira (o provedor
 * fora do ar) devolve null: a entrega volta para a fila e tenta de novo.
 */
export function cloudNotice(reason: string, d: Delivery): string | null {
  const usable = d.ia.filter(cloudCanUse)
  if (!usable.length) {
    const names = [...new Set(d.ia.map((i) => i.label))].join(", ")
    return `Não respondi: ${names ? `este bot usa ${names}, que não roda` : "este bot está sem IA, e só o OpenRouter roda"} no motor na nuvem. Abra o bot ${d.agent.name} no Dock e escolha o OpenRouter como IA.`
  }
  if (usable.every((i) => !i.model)) return `Não respondi: falta escolher o modelo do OpenRouter no bot ${d.agent.name}.`
  if (/limite/i.test(reason)) return `Não respondi: ${reason}. A cota do OpenRouter é da empresa toda. Mande de novo mais tarde.`
  return null
}

/** Cliente das ferramentas do servidor chamado por dentro: os erros viram os mesmos do HTTP (409 = lease perdido). */
export function inProcessClient(run: (tool: string, args: Record<string, unknown>) => Promise<unknown>): ServerClient {
  return {
    async call<T>(tool: string, args: Record<string, unknown> = {}) {
      try {
        return (await run(tool, args)) as T
      } catch (e) {
        const status = typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 500
        throw new ServerError(status, ((e as Error).message ?? "erro").slice(0, 120))
      }
    },
  }
}

export interface CloudRunResult {
  replied: number
  notices: number
  failed: number
}

/**
 * Roda as entregas de UM trabalhador "nuvem" até a fila dele esvaziar ou o tempo acabar.
 * `deadline`: depois dele, não pega entrega nova (a que já está rodando termina).
 */
export async function runCloudWorker(opts: {
  client: ServerClient
  openrouterKey: string | null
  deadline: number
  base?: string
  log?: (e: EngineLog) => void
  now?: () => number
}): Promise<CloudRunResult> {
  const out: CloudRunResult = { replied: 0, notices: 0, failed: 0 }
  const engine = createEngine({
    client: opts.client,
    vault: memoryVault(), // vazio: a chave não passa pelo cofre, vai da fábrica direto para o cabeçalho
    foldersFor: () => null,
    // vale o nível do banco (até o teto da leva); sem pastas, o nível 1 não dá ferramenta de arquivo
    confirmedLevel: () => LEVEL_CEILING,
    adapterFactory: cloudAdapterFactory({ openrouterKey: opts.openrouterKey, base: opts.base }),
    engineName: CLOUD_ENGINE,
    noIaNotice: cloudNotice,
    log: (e) => {
      if (e.event === "respondeu") out.replied++
      else if (e.event === "sem_ia_avisado") out.notices++
      else if (e.event === "falhou" || e.event === "sem_ia") out.failed++
      opts.log?.(e)
    },
    leaseRenewMs: 60_000,
  })
  const now = opts.now ?? Date.now
  while (now() < opts.deadline && !engine.stopped) {
    const wait = await engine.tick(0)
    if (wait !== 0) break // fila vazia (ou erro): volta no próximo minuto
  }
  return out
}

/** Modelos grátis do OpenRouter que usam ferramentas (o Dock precisa delas para skills e apps). */
export function freeToolModels(body: unknown, max = 40): string[] {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data)) return []
  const ids = data
    .filter((m): m is { id: string; pricing?: { prompt?: unknown; completion?: unknown }; supported_parameters?: unknown } => !!m && typeof (m as { id?: unknown }).id === "string")
    .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
    .filter((m) => Array.isArray(m.supported_parameters) && m.supported_parameters.includes("tools"))
    .map((m) => m.id)
    .filter((id) => /^[a-z0-9._/:-]{3,120}$/i.test(id) && id !== "openrouter/free")
  return [...new Set(ids)].sort().slice(0, max)
}
