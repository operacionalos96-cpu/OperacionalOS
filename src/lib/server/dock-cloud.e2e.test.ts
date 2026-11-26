/* eslint-disable @typescript-eslint/no-explicit-any -- teste lê JSON do banco e de um servidor falso; o formato é conferido pelas asserções */
/**
 * PONTA A PONTA do motor do Dock na nuvem (ADR 0026, migration 0030), sem nada de fora desta máquina:
 *   banco = Postgres de teste (PGlite) com TODAS as migrations reais;
 *   motor = o do app de PC (desktop/src/engine), montado como no servidor (dock-cloud-core), com as
 *           mesmas funções SQL da fila e as mesmas ferramentas do motor (dockEngineTools);
 *   IA    = servidor falso no lugar do OpenRouter.
 * O que NÃO é testado aqui: o Supabase de verdade, a rota /api/runner/tick e o OpenRouter de verdade.
 */
import { createServer, type IncomingHttpHeaders, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { cloudNotice, freeToolModels, inProcessClient, runCloudWorker } from "./dock-cloud-core"
import { dockEngineTools, validateOfficeResult } from "./dock-engine"
import { createTestDb, type TestDb } from "./test-db"

let db: TestDb
const ANA = "ana@hzk.test"
const GABRIEL = "gabriel@hzk.test"
const KEY = "sk-or-v1-chave-da-empresa-de-teste"
const as = <T = Record<string, unknown>>(email: string, q: string, p: unknown[] = []) => db.as({ email }, () => db.sql<T>(q, p))
const one = async <T = Record<string, unknown>>(email: string, q: string, p: unknown[] = []) => (await as<T>(email, q, p))[0]

async function rpc(fn: string, args: Record<string, unknown>) {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("fn")
  const keys = Object.keys(args)
  const vals = keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]))
  const rows = await db.sql<Record<string, unknown>>(`select * from public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`, vals)
  if (rows.length === 1 && Object.keys(rows[0]).length === 1 && fn in rows[0]) return rows[0][fn]
  return rows
}

// o que runTool faz no servidor, sobre o mesmo banco (fila + ferramentas do motor)
const engineTools = dockEngineTools(rpc)
async function serverTool(workerId: string, tool: string, a: Record<string, any>) {
  try {
    switch (tool) {
      case "claim_next_job": {
        const caps = (await db.sql<{ capabilities: string[] }>(`select capabilities from public.workers where id = $1`, [workerId]))[0].capabilities
        const rows = await db.sql<Record<string, any>>(`select public_id, lease_id from public.claim_next_job($1, $2, null, 600)`, [workerId, caps])
        return rows[0] ? { job: rows[0], lease: { renew_every_seconds: 200 } } : { job: null, poll: { retry_after_seconds: 15 } }
      }
      case "start_job":
        return (await db.sql(`select public_id from public.start_job($1, $2, $3)`, [a.job_id, a.lease_id, a.engine ?? null]))[0]
      case "renew_lease":
        return (await db.sql(`select public_id from public.renew_lease($1, $2, 600)`, [a.job_id, a.lease_id]))[0]
      case "fail_job":
        return (await db.sql(`select public_id, status from public.fail_job($1, $2, $3, now() + interval '1 minute')`, [a.job_id, a.lease_id, a.error]))[0]
      case "complete_job": {
        const job = (await db.sql<{ job_type: string; claimed_by: string }>(`select job_type, claimed_by from public.ai_jobs where public_id = $1`, [a.job_id]))[0]
        if (!job || job.claimed_by !== workerId) throw Object.assign(new Error("job não encontrado"), { status: 404 })
        const v = validateOfficeResult(job.job_type, a.result)
        if (!v.ok) throw Object.assign(new Error("resultado inválido"), { status: 422 })
        return (await db.sql(`select public_id, status from public.complete_job($1, $2, $3::jsonb)`, [a.job_id, a.lease_id, JSON.stringify(v.value)]))[0]
      }
    }
    const t = engineTools[tool]
    if (!t) throw Object.assign(new Error("ferramenta desconhecida"), { status: 404 })
    return await t.run(workerId, a)
  } catch (e) {
    const msg = (e as Error).message
    const status = (e as { status?: number }).status ?? (/lease_/.test(msg) ? 409 : /mismatch|not_allowed/.test(msg) ? 403 : 409)
    throw Object.assign(new Error(msg.match(/(?:office|dock)_[a-z_0-9]+|lease_lost|lease_expired/)?.[0] ?? msg), { status })
  }
}

// ---------- OpenRouter falso ----------
let ai: Server
let aiUrl: string
const seen: { path: string; headers: IncomingHttpHeaders; body: any }[] = []
let replies: (() => { status: number; body: unknown })[] = []

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(`
    insert into public.members (email, team_id, display_name, role_level, active) values
      ('${GABRIEL}', 'u1', 'Gabriel', 'owner', true), ('${ANA}', 'u3', 'Ana', 'operator', true);
  `)
  for (const e of [GABRIEL, ANA]) await as(e, `select public.office_accept_consent('v1')`)
  ai = createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      seen.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : {} })
      const r = replies.shift()?.() ?? { status: 200, body: { model: "x", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } } }
      res.writeHead(r.status, { "content-type": "application/json" })
      res.end(JSON.stringify(r.body))
    })
  })
  await new Promise<void>((ok) => ai.listen(0, "127.0.0.1", ok))
  aiUrl = `http://127.0.0.1:${(ai.address() as AddressInfo).port}`
}, 120_000)
afterAll(async () => {
  await new Promise<void>((ok) => ai.close(() => ok()))
})

const say = (text: string) => () => ({ status: 200, body: { model: "meta-llama/llama-3.3-70b-instruct:free", choices: [{ message: { content: text } }], usage: { prompt_tokens: 30, completion_tokens: 8 } } })
const cloudOf = async (email: string) => (await one<{ id: string }>(email, `select id from public.workers where kind = 'nuvem'`))?.id
const run = (workerId: string, key: string | null = KEY) =>
  runCloudWorker({ client: inProcessClient((tool, args) => serverTool(workerId, tool, args)), openrouterKey: key, deadline: Date.now() + 30_000, base: `${aiUrl}/api/v1`, log: (e) => process.env.DEBUG_DOCK && console.log(e) })

let BOT_ANA: string, THREAD_ANA: string, CONN_OR: string, CLOUD_ANA: string

describe("motor na nuvem: ligar e desligar", () => {
  it("a Ana liga: nasce UM trabalhador 'nuvem' dela, ligado, só com respostas; ligar de novo não duplica", async () => {
    expect(await one(ANA, `select public.office_set_cloud_engine(true) as on`)).toEqual({ on: true })
    expect(await one(ANA, `select public.office_set_cloud_engine(true) as on`)).toEqual({ on: true })
    const w = await db.sql(`select owner_team_id, kind, enabled, capabilities, engine from public.workers where kind = 'nuvem'`)
    expect(w).toEqual([{ owner_team_id: "u3", kind: "nuvem", enabled: true, capabilities: ["office_reply"], engine: "hzk-nuvem" }])
    CLOUD_ANA = (await cloudOf(ANA))!
    // ela vê o dela; o Gabriel (founder) não vê o da Ana
    expect(CLOUD_ANA).toMatch(/^wrk_/)
    expect(await cloudOf(GABRIEL)).toBeUndefined()
  })

  it("sem o termo do Dock, não liga; e o banco recusa um trabalhador 'nuvem' sem dono", async () => {
    await db.pg.exec(`insert into public.members (email, team_id, display_name, role_level, active) values ('rui@hzk.test', 'u9', 'Rui', 'operator', true)`)
    await expect(as("rui@hzk.test", `select public.office_set_cloud_engine(true)`)).rejects.toThrow(/office_consent_required/)
    await expect(db.sql(`insert into public.workers (id, name, token_hash, kind) values ('wrk_01J0000000000000000000000Z', 'x', 'h', 'nuvem')`)).rejects.toThrow(/workers_nuvem_shape_check/)
  })

  it("OpenRouter fica classificado como 'padrao', com fonte", async () => {
    expect(await db.sql(`select data_class, source_url from public.dock_provider_policies where provider = 'openrouter'`)).toEqual([
      { data_class: "padrao", source_url: "https://openrouter.ai/docs/guides/routing/provider-selection" },
    ])
  })
})

describe("motor na nuvem: responde só as conversas do dono", () => {
  it("prepara: bot da Ana com OpenRouter; conversa do Gabriel também na fila", async () => {
    CONN_OR = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'chave', 'openrouter', 'OpenRouter') as id`)).id
    BOT_ANA = (await one<{ id: string }>(ANA, `select public.office_upsert_agent(null, null, 'Pesquisadora', 'Mercado', p_instructions => 'Seja breve.', p_connection_id => $1, p_model => 'meta-llama/llama-3.3-70b-instruct:free') as id`, [CONN_OR])).id
    THREAD_ANA = (await one<{ id: string }>(ANA, `select public.office_open_thread('direta', array[$1]) as id`, [BOT_ANA])).id
    const conG = (await one<{ id: string }>(GABRIEL, `select public.office_save_connection(null, 'chave', 'openrouter', 'OpenRouter') as id`)).id
    const botG = (await one<{ id: string }>(GABRIEL, `select public.office_upsert_agent(null, null, 'Do Gabriel', 'Geral', p_connection_id => $1, p_model => 'x:free') as id`, [conG])).id
    const thrG = (await one<{ id: string }>(GABRIEL, `select public.office_open_thread('direta', array[$1]) as id`, [botG])).id
    await as(GABRIEL, `select * from public.office_send_message($1, 'Conversa privada do Gabriel', 'cloud-msg-g001')`, [thrG])
  })

  it("a Ana manda mensagem: a nuvem dela responde com o OpenRouter, sem guardar dados, e conclui", async () => {
    await as(ANA, `select * from public.office_send_message($1, 'Resuma o mercado de clínicas', 'cloud-msg-a001')`, [THREAD_ANA])
    replies = [say("Mercado em alta, com 3 redes grandes.")]
    const r = await run(CLOUD_ANA)
    expect(r).toEqual({ replied: 1, notices: 0, failed: 0 })

    const msg = await one(ANA, `select body, provider, model, connection_id from public.office_messages where thread_id = $1 and author_type = 'agent'`, [THREAD_ANA])
    expect(msg).toEqual({ body: "Mercado em alta, com 3 redes grandes.", provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", connection_id: CONN_OR })
    const req = seen.at(-1)!
    expect(req.path).toBe("/api/v1/chat/completions")
    expect(req.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(req.body.provider).toEqual({ data_collection: "deny" })
    expect(JSON.stringify(req.body)).not.toContain(KEY)
    expect(await db.sql(`select status from public.ai_jobs where entity_id = $1`, [THREAD_ANA])).toEqual([{ status: "completed" }])
  })

  it("a conversa do Gabriel continua na fila: a nuvem da Ana não pega o que é de outro dono", async () => {
    const before = seen.length
    expect(await run(CLOUD_ANA)).toEqual({ replied: 0, notices: 0, failed: 0 })
    expect(seen.length).toBe(before)
    expect(await db.sql(`select status from public.ai_jobs where owner_team_id = 'u1' and job_type = 'office_reply'`)).toEqual([{ status: "queued" }])
  })

  it("a nuvem da Ana também não age numa entrega do Gabriel, mesmo com o lease dela em mãos", async () => {
    const job = (await db.sql<{ public_id: string; lease_id: string }>(`select public_id, lease_id from public.claim_next_job('${CLOUD_ANA}', array['office_reply'], null, 600)`))[0]
    expect(job).toBeUndefined()
  })
})

describe("motor na nuvem: avisa quando a pessoa precisa agir", () => {
  it("bot só com Ollama: grava um aviso dizendo para trocar a IA e conclui (não fica tentando)", async () => {
    const conOl = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'local', 'ollama', 'Ollama') as id`)).id
    const bot = (await one<{ id: string }>(ANA, `select public.office_upsert_agent(null, null, 'Organizadora', 'Geral', p_connection_id => $1, p_model => 'qwen3:4b') as id`, [conOl])).id
    const thr = (await one<{ id: string }>(ANA, `select public.office_open_thread('direta', array[$1]) as id`, [bot])).id
    await as(ANA, `select * from public.office_send_message($1, 'Organize minha semana', 'cloud-msg-a002')`, [thr])
    const before = seen.length
    expect(await run(CLOUD_ANA)).toEqual({ replied: 0, notices: 1, failed: 0 })
    expect(seen.length).toBe(before) // nada foi para IA nenhuma
    const m = await one<{ kind: string; body: string }>(ANA, `select kind, body from public.office_messages where thread_id = $1 and author_type <> 'human'`, [thr])
    expect(m.kind).toBe("aviso")
    expect(m.body).toMatch(/Ollama, que não roda no motor na nuvem.*escolha o OpenRouter/)
    expect(await db.sql(`select status from public.ai_jobs where entity_id = $1`, [thr])).toEqual([{ status: "completed" }])
  })

  it("OpenRouter sem cota: a conexão fica 'sem cota' e a conversa recebe o aviso", async () => {
    await as(ANA, `select * from public.office_send_message($1, 'Mais um resumo', 'cloud-msg-a003')`, [THREAD_ANA])
    replies = [() => ({ status: 429, body: { error: { code: 429, message: "Rate limit exceeded: free-models-per-day" } } })]
    expect(await run(CLOUD_ANA)).toEqual({ replied: 0, notices: 1, failed: 0 })
    expect(await one(ANA, `select status from public.office_connections where id = $1`, [CONN_OR])).toEqual({ status: "sem_cota" })
    const m = await one<{ body: string }>(ANA, `select body from public.office_messages where thread_id = $1 and kind = 'aviso' order by created_at desc limit 1`, [THREAD_ANA])
    expect(m.body).toMatch(/OpenRouter atingiu o limite.*Mande de novo mais tarde/)
  })
})

describe("motor na nuvem: desligar", () => {
  it("a Ana desliga: a entrega que a nuvem segurava volta para a fila e a nuvem não pega mais nada", async () => {
    await db.sql(`update public.office_connections set status = 'conectada', quota_resets_at = null where id = $1`, [CONN_OR])
    await as(ANA, `select * from public.office_send_message($1, 'Última pergunta', 'cloud-msg-a004')`, [THREAD_ANA])
    const held = (await db.sql<{ public_id: string }>(`select public_id from public.claim_next_job($1, array['office_reply'], null, 600)`, [CLOUD_ANA]))[0]
    expect(held.public_id).toMatch(/^job_/)
    expect(await one(ANA, `select public.office_set_cloud_engine(false) as on`)).toEqual({ on: false })
    expect(await db.sql(`select status, claimed_by from public.ai_jobs where public_id = $1`, [held.public_id])).toEqual([{ status: "queued", claimed_by: null }])
    expect(await db.sql(`select enabled from public.workers where id = $1`, [CLOUD_ANA])).toEqual([{ enabled: false }])
    // desligado, o banco recusa as ferramentas do motor mesmo com um lease antigo
    await expect(rpc("office_delivery", { p_worker_id: CLOUD_ANA, p_job_public_id: held.public_id, p_lease_id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow()
  })
})

describe("regras sem banco", () => {
  it("freeToolModels: só grátis (entrada e saída) que usam ferramentas, sem o roteador e sem repetir", () => {
    const body = {
      data: [
        { id: "meta-llama/llama-3.3-70b-instruct:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools", "temperature"] },
        { id: "qwen/qwen3-coder:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
        { id: "qwen/qwen3-coder:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
        { id: "openai/gpt-4o", pricing: { prompt: "0.0000025", completion: "0.00001" }, supported_parameters: ["tools"] },
        { id: "sem/ferramentas:free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["temperature"] },
        { id: "openrouter/free", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
        { id: "<script>", pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
      ],
    }
    expect(freeToolModels(body)).toEqual(["meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free"])
    expect(freeToolModels({})).toEqual([])
  })

  it("cloudNotice: falha passageira do provedor não vira aviso (tenta de novo)", () => {
    const d: any = { agent: { name: "B" }, ia: [{ kind: "chave", provider: "openrouter", label: "OpenRouter", model: "x:free" }] }
    expect(cloudNotice("OpenRouter não respondeu", d)).toBeNull()
    expect(cloudNotice("x", { ...d, ia: [{ ...d.ia[0], model: null }] })).toMatch(/falta escolher o modelo/)
    expect(cloudNotice("x", { ...d, ia: [] })).toMatch(/está sem IA/)
  })
})
