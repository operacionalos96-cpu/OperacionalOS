import "server-only"
import { CLOUD_ENGINE, freeToolModels, inProcessClient, runCloudWorker, type CloudRunResult } from "./dock-cloud-core"
import { supabaseAdmin } from "./supabase-admin"
import { runTool } from "./worker-tools"
import type { Scope, Worker } from "./workers"

/**
 * Motor do HZK Dock na nuvem (ADR 0026), chamado pelo agendador (/api/runner/tick, a cada minuto).
 * Para cada pessoa que ligou "Motor na nuvem" (workers.kind = 'nuvem', 0030), pega as entregas DELA
 * e responde com o OpenRouter da empresa. Sem OPENROUTER_API_KEY, não faz nada: as entregas esperam
 * na fila (o bot aparece "na fila"), nenhuma conexão é marcada com erro.
 */

let catalog: { at: number; models: string[] } | null = null
const CATALOG_TTL_MS = 60 * 60_000

/** Lista de modelos grátis com ferramentas, guardada por 1 hora (é a mesma para todo mundo). */
async function openrouterModels(key: string): Promise<string[]> {
  if (catalog && Date.now() - catalog.at < CATALOG_TTL_MS) return catalog.models
  const res = await fetch("https://openrouter.ai/api/v1/models?supported_parameters=tools", { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`OpenRouter respondeu ${res.status} na lista de modelos`)
  const models = freeToolModels(await res.json())
  catalog = { at: Date.now(), models }
  return models
}

/** As conexões OpenRouter de quem usa a nuvem mostram os modelos que o motor consegue usar. */
async function syncModels(key: string, owners: string[]) {
  const models = await openrouterModels(key)
  if (!models.length || !owners.length) return
  const db = supabaseAdmin()
  const { data, error } = await db.from("office_connections").select("id, models").eq("provider", "openrouter").eq("kind", "chave").in("owner_team_id", owners)
  if (error) throw new Error(error.message)
  const want = JSON.stringify(models)
  for (const c of (data ?? []) as { id: string; models: unknown }[]) {
    if (JSON.stringify(c.models) === want) continue // não muda nada: não acorda o tempo real à toa
    await db.from("office_connections").update({ models }).eq("id", c.id)
  }
}

/**
 * Roda o motor na nuvem. Sem `ownerTeamId`: de todo mundo que ligou (agendador, a cada minuto).
 * Com `ownerTeamId`: só o da pessoa (logo depois que ela manda mensagem, /api/escritorio/nuvem).
 * Os dois podem rodar juntos sem responder duas vezes: cada entrega tem lease (claim_next_job).
 */
export async function runDockCloud(opts: { budgetMs: number; ownerTeamId?: string }): Promise<{ workers: number; skipped?: string } & Partial<CloudRunResult>> {
  const key = process.env.OPENROUTER_API_KEY?.trim() || null
  const db = supabaseAdmin()
  let q = db
    .from("workers")
    .select("id, name, agent_id, engine, capabilities, scopes, created_by, owner_team_id")
    .eq("kind", "nuvem")
    .eq("enabled", true)
  if (opts.ownerTeamId) q = q.eq("owner_team_id", opts.ownerTeamId)
  const { data, error } = await q
  if (error) return { workers: 0, skipped: "fila do Dock indisponível (rodou o SQL 0030?)" }
  const rows = (data ?? []) as { id: string; name: string; agent_id: string | null; engine: string | null; capabilities: string[] | null; scopes: string[] | null; created_by: string | null; owner_team_id: string | null }[]
  if (!rows.length) return { workers: 0 }
  if (!key) return { workers: rows.length, skipped: "falta OPENROUTER_API_KEY na Vercel" }

  // a lista de modelos é do agendador; na hora da mensagem, o que importa é responder rápido
  if (!opts.ownerTeamId) await syncModels(key, rows.map((r) => r.owner_team_id).filter((o): o is string => !!o)).catch((e) => console.error("[dock-nuvem] modelos:", (e as Error).message))

  const deadline = Date.now() + Math.max(0, opts.budgetMs)
  const total: CloudRunResult = { replied: 0, notices: 0, failed: 0 }
  // ordem aleatória: com pouco tempo, ninguém fica sempre por último
  for (const r of rows.sort(() => Math.random() - 0.5)) {
    if (Date.now() >= deadline) break
    if (!r.owner_team_id) continue
    const worker: Worker = {
      id: r.id, name: r.name, agent_id: r.agent_id, engine: r.engine ?? CLOUD_ENGINE, capabilities: r.capabilities ?? [],
      scopes: (r.scopes ?? []) as Scope[], createdBy: r.created_by, ownerTeamId: r.owner_team_id, kind: "nuvem",
    }
    const res = await runCloudWorker({
      client: inProcessClient((tool, args) => runTool(worker, tool, args)),
      openrouterKey: key,
      deadline,
      // o registro não leva conversa: só evento, entrega e o motivo (já sem segredo, pelo redact do motor)
      log: (e) => {
        if (e.event !== "respondeu") console.log(`[dock-nuvem] ${e.event}${e.job ? ` ${e.job}` : ""}${e.detail ? `: ${e.detail}` : ""}`)
      },
    }).catch((e) => {
      console.error("[dock-nuvem]", (e as Error).message)
      return { replied: 0, notices: 0, failed: 1 }
    })
    total.replied += res.replied
    total.notices += res.notices
    total.failed += res.failed
  }
  return { workers: rows.length, ...total }
}
