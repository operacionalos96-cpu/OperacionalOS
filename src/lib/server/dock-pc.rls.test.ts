/* eslint-disable @typescript-eslint/no-explicit-any -- teste lê JSON do banco e de servidores falsos; o formato é conferido pelas asserções */
/**
 * HZK Dock v3, PC liberado e funções do motor NO POSTGRES DE VERDADE (migration 0028, fatias 4 e 5 da nota 32).
 * Confere, logado como cada pessoa e como o servidor: pedir, aprovar e desligar um PC; o contexto da
 * entrega (office-delivery/v1) só com o que o bot pode usar; o pacote da skill com hash conferível;
 * a IA sem cota marcada; o uso gravado; e que nada disso alcança o escritório de outra pessoa.
 * Os blocos rodam em sequência no mesmo banco.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./test-db"

let db: TestDb
const GABRIEL = "gabriel@hzk.test" // founder, responsável pela produção
const ANA = "ana@hzk.test" // operadora com acesso à produção
const BETO = "beto@hzk.test" // operador sem acesso à produção

const as = <T = Record<string, unknown>>(email: string, q: string, p: unknown[] = []) => db.as({ email }, () => db.sql<T>(q, p))
const one = async <T = Record<string, unknown>>(email: string, q: string, p: unknown[] = []) => (await as<T>(email, q, p))[0]
const srv = async <T = Record<string, unknown>>(q: string, p: unknown[] = []) => (await db.sql<T>(q, p))[0]
async function fails(email: string | null, q: string, p: unknown[] = []) {
  try {
    if (email) await as(email, q, p)
    else await db.sql(q, p)
    return "ok"
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(msg)) return "negado"
    return msg.match(/(?:office|dock|lease)_[a-z_0-9]+/)?.[0] ?? msg
  }
}
const hex = (s: string) => createHash("sha256").update(s).digest("hex")

let PC_ANA: string
let PC_BETO: string
let BOT: string
let CONN_OR: string
let CONN_OLLAMA: string
let SKILL: string
let THREAD: string
let JOB: string
let LEASE: string

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(`
    insert into public.members (email, team_id, display_name, role_level, active) values
      ('${GABRIEL}', 'u1', 'Gabriel', 'owner', true),
      ('${ANA}',     'u3', 'Ana',     'operator', true),
      ('${BETO}',    'u4', 'Beto',    'operator', true);
    insert into public.areas (id, data) values
      ('producao', '{"id":"producao","name":"Produção","restricted":true,"owner":{"memberId":"u1"}}')
    on conflict (id) do update set data = excluded.data;
    insert into public.area_access (member_id, area_id, level, granted_by) values ('u3', 'producao', 'operar', 'u1');
  `)
  for (const e of [GABRIEL, ANA, BETO]) await as(e, `select public.office_accept_consent('v1')`)
}, 120_000)

describe("a migration", () => {
  it("roda de novo sem quebrar (idempotente)", async () => {
    await db.pg.exec(readFileSync(join(process.cwd(), "supabase", "migrations", "0028_dock_pc.sql"), "utf8"))
    const f = await db.sql<{ n: number }>(`select count(*)::int n from pg_proc where proname in ('office_request_pc','dock_decide_pc','office_disable_pc','office_delivery','office_engine_check','office_skill_package','office_report_connection','office_record_usage')`)
    expect(f[0].n).toBe(8)
  })
})

describe("PC liberado: pedir, aprovar, desligar", () => {
  it("a pessoa pede com o hash do token; o PC nasce desligado e só ela e os founders veem", async () => {
    PC_ANA = (await one<{ id: string }>(ANA, `select public.office_request_pc('PC da Ana', $1, 'AbCd') as id`, [hex("token-ana")])).id
    PC_BETO = (await one<{ id: string }>(BETO, `select public.office_request_pc('PC do Beto', $1, 'WxYz') as id`, [hex("token-beto")])).id
    expect(await srv(`select enabled, kind, pc_status, owner_team_id, scopes from public.workers where id = $1`, [PC_ANA])).toEqual({
      enabled: false, kind: "pc", pc_status: "pedido", owner_team_id: "u3", scopes: ["queue:read", "jobs:claim", "jobs:execute", "office:engine"],
    })
    expect((await as(ANA, `select id from public.workers where kind = 'pc'`)).map((r) => r.id)).toEqual([PC_ANA])
    expect((await as(BETO, `select id from public.workers where kind = 'pc'`)).map((r) => r.id)).toEqual([PC_BETO])
    expect((await as(GABRIEL, `select id from public.workers where kind = 'pc' order by id`)).length).toBe(2)
    // o hash nunca é legível pela tela
    expect(await fails(GABRIEL, `select token_hash from public.workers`)).toBe("negado")
  })

  it("recusa hash inválido, token repetido e pedido de quem não é membro", async () => {
    expect(await fails(ANA, `select public.office_request_pc('PC', 'nao-e-hash', 'AbCd')`)).toBe("office_invalid_token_hash")
    expect(await fails(ANA, `select public.office_request_pc('PC', $1, 'AbCd')`, [hex("token-ana")])).toBe("office_token_reused")
    expect(await fails("estranho@x.test", `select public.office_request_pc('PC', $1, 'AbCd')`, [hex("t3")])).toBe("office_not_member")
  })

  it("só founder aprova; aprovar liga o PC", async () => {
    expect(await fails(ANA, `select public.dock_decide_pc($1, true)`, [PC_ANA])).toBe("dock_founder_only")
    expect(await fails(GABRIEL, `select public.dock_decide_pc($1, true)`, [PC_ANA])).toBe("ok")
    expect(await fails(GABRIEL, `select public.dock_decide_pc($1, true)`, [PC_BETO])).toBe("ok")
    expect(await fails(GABRIEL, `select public.dock_decide_pc($1, true)`, [PC_ANA])).toBe("office_pc_not_found") // já decidido
    expect(await srv(`select enabled, pc_status, decided_by from public.workers where id = $1`, [PC_ANA])).toEqual({ enabled: true, pc_status: "aprovado", decided_by: "u1" })
  })

  it("um PC ligado sem aprovação é impossível (check no banco)", async () => {
    expect(await fails(null, `insert into public.workers (id, name, token_hash, owner_team_id, kind, pc_status, enabled) values ('wrk_${"Z".repeat(26)}', 'x', 'h', 'u3', 'pc', 'pedido', true)`)).toMatch(/workers_pc_shape_check/)
  })
})

describe("entrega: o motor recebe só o que o bot pode usar (office-delivery/v1)", () => {
  it("prepara bot, IAs, skill da área, conector e uma mensagem", async () => {
    CONN_OR = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'chave', 'openrouter', 'OpenRouter') as id`)).id
    CONN_OLLAMA = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'local', 'ollama', 'Ollama') as id`)).id
    BOT = (await one<{ id: string }>(ANA, `select public.office_upsert_agent(null, null, 'Pesquisadora', 'Mercado', p_instructions => 'Seja breve.', p_connection_id => $1, p_backup_models => $2::jsonb, p_model => 'openai/gpt-oss-20b:free') as id`,
      [CONN_OR, JSON.stringify([{ connection_id: CONN_OLLAMA, model: "qwen3:4b" }])])).id
    SKILL = (await one<{ id: string }>(GABRIEL, `select public.dock_save_skill(null, 'area', 'producao', 'Pesquisa HZK', 'Confere cada fonte.', '1.0', null, 'Toda empresa com link.', p_files => $1::jsonb, p_min_level => 1) as id`,
      [JSON.stringify([{ path: "exemplos/um.md", content: "Pedido: 10 clínicas" }])])).id
    await as(ANA, `select public.office_set_agent_access($1, 1)`, [BOT])
    await as(ANA, `select public.office_install_skill($1, $2)`, [BOT, SKILL])
    await as(GABRIEL, `select public.dock_save_connector('github', 'GitHub', 'programacao', '', 'empresa', 'http', 0, 1, p_server_host => 'api.githubcopilot.com', p_source_url => 'https://github.com/github/github-mcp-server')`)
    await as(GABRIEL, `select public.dock_save_connector_action('github', 'ler_codigo', 'get_file_contents', 'Ler código', 'A', 1)`)
    await as(GABRIEL, `select public.dock_approve_connector('github', $1)`, ["a".repeat(64)])
    await as(ANA, `select public.office_install_connector($1, 'github')`, [BOT])
    THREAD = (await one<{ id: string }>(ANA, `select public.office_open_thread('direta', array[$1]) as id`, [BOT])).id
    await as(ANA, `select * from public.office_send_message($1, 'Levante 3 clínicas em Curitiba', 'pc-msg-0001')`, [THREAD])
  })

  it("o PC do Beto não pega a entrega da Ana; o da Ana pega", async () => {
    expect(await db.sql(`select * from public.claim_next_job($1, array['office_reply','office_action'], null)`, [PC_BETO])).toEqual([])
    const j = await srv<{ public_id: string; lease_id: string }>(`select public_id, lease_id from public.claim_next_job($1, array['office_reply','office_action'], null)`, [PC_ANA])
    JOB = j.public_id
    LEASE = j.lease_id
    expect(JOB).toMatch(/^job_/)
  })

  it("devolve o contexto completo, na ordem certa das IAs, com a skill e o conector", async () => {
    const d = (await srv<{ d: Record<string, any> }>(`select public.office_delivery($1, $2, $3) d`, [PC_ANA, JOB, LEASE])).d
    expect(d.schema).toBe("office-delivery/v1")
    expect(d.job).toMatchObject({ public_id: JOB, type: "office_reply", origin: "humano" })
    expect(d.agent).toMatchObject({ id: BOT, name: "Pesquisadora", access_level: 1, instructions: "Seja breve." })
    expect(d.thread.messages.map((m: any) => [m.author_type, m.body, m.is_trigger])).toEqual([["human", "Levante 3 clínicas em Curitiba", true]])
    expect(d.ia.map((x: any) => [x.connection_id, x.why, x.model, x.data_class])).toEqual([
      [CONN_OR, "bot", "openai/gpt-oss-20b:free", "padrao"], // classificado na 0030 (motor sempre pede data_collection: deny)
      [CONN_OLLAMA, "reserva 1", "qwen3:4b", "local"],
    ])
    expect(d.skills).toHaveLength(1)
    expect(d.skills[0]).toMatchObject({ id: SKILL, version: 1, min_level: 1, has_scripts: false, name: "Pesquisa HZK" })
    expect(d.connectors.map((c: any) => [c.id, c.runs_at, c.read_only, c.actions.map((a: any) => a.key)])).toEqual([["github", "empresa", true, ["ler_codigo"]]])
  })

  it("o pacote da skill confere pelo hash: sha256(body + \\n + files_text)", async () => {
    const d = (await srv<{ d: Record<string, any> }>(`select public.office_delivery($1, $2, $3) d`, [PC_ANA, JOB, LEASE])).d
    const p = await srv<{ body: string; files_text: string; sha256: string }>(`select * from public.office_skill_package($1, $2, $3, $4, 1)`, [PC_ANA, JOB, LEASE, SKILL])
    expect(p.sha256).toBe(d.skills[0].sha256)
    expect(hex(`${p.body}\n${p.files_text}`)).toBe(p.sha256)
    expect(JSON.parse(p.files_text)).toEqual([{ path: "exemplos/um.md", content: "Pedido: 10 clínicas" }])
    expect(await fails(null, `select * from public.office_skill_package($1, $2, $3, $4, 2)`, [PC_ANA, JOB, LEASE, SKILL])).toBe("office_skill_not_delivered")
  })

  it("nível baixou para 0: a skill de nível 1 e o conector somem da entrega", async () => {
    await as(ANA, `select public.office_set_agent_access($1, 0)`, [BOT])
    const d = (await srv<{ d: Record<string, any> }>(`select public.office_delivery($1, $2, $3) d`, [PC_ANA, JOB, LEASE])).d
    expect(d.skills).toEqual([])
    expect(d.agent.access_level).toBe(0)
    await as(ANA, `select public.office_set_agent_access($1, 1)`, [BOT])
  })

  it("nível acima do teto da primeira leva vira 1 na entrega, mesmo se o banco tiver outro número", async () => {
    await db.sql(`update public.office_agents set access_level = 3 where id = $1`, [BOT])
    const d = (await srv<{ d: Record<string, any> }>(`select public.office_delivery($1, $2, $3) d`, [PC_ANA, JOB, LEASE])).d
    expect(d.agent.access_level).toBe(1)
    await db.sql(`update public.office_agents set access_level = 1 where id = $1`, [BOT])
  })

  it("outro PC, lease errado ou a sessão do navegador não leem a entrega", async () => {
    expect(await fails(null, `select public.office_delivery($1, $2, $3)`, [PC_BETO, JOB, LEASE])).toBe("office_job_mismatch")
    expect(await fails(null, `select public.office_delivery($1, $2, gen_random_uuid())`, [PC_ANA, JOB])).toBe("lease_lost")
    expect(await fails(ANA, `select public.office_delivery($1, $2, $3::uuid)`, [PC_ANA, JOB, LEASE])).toBe("negado")
    expect(await fails(null, `select public.office_engine_check($1, $2, $3)`, [PC_BETO, JOB, LEASE])).toBe("office_job_mismatch")
    expect((await srv<{ t: string }>(`select public.office_engine_check($1, $2, $3) t`, [PC_ANA, JOB, LEASE])).t).toBe("office_reply")
  })

  it("IA sem cota fica marcada; a resposta pela reserva grava a troca; IA não escolhida é recusada", async () => {
    await db.sql(`select public.office_report_connection($1, $2, $3, $4, 'sem_cota', '2026-11-15T00:00:00Z')`, [PC_ANA, JOB, LEASE, CONN_OR])
    expect(await one(ANA, `select status, quota_resets_at is not null as volta from public.office_connections where id = $1`, [CONN_OR])).toEqual({ status: "sem_cota", volta: true })
    const other = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'chave', 'mistral', 'Mistral') as id`)).id
    expect(await fails(null, `select public.office_report_connection($1, $2, $3, $4, 'erro')`, [PC_ANA, JOB, LEASE, other])).toBe("office_connection_not_allowed")
    expect(await fails(null, `select public.office_post_agent_message($1, $2, 1, 'texto', 'oi', null, $3, 'x')`, [JOB, LEASE, other])).toBe("office_connection_not_allowed")
    await db.sql(`select public.office_post_agent_message($1, $2, 1, 'texto', 'Achei 3 clínicas.', null, $3, 'qwen3:4b', 'OpenRouter', 'OpenRouter sem cota')`, [JOB, LEASE, CONN_OLLAMA])
    expect(await one(ANA, `select provider, model, fallback_from, fallback_reason from public.office_messages where job_public_id = $1`, [JOB])).toEqual({
      provider: "ollama", model: "qwen3:4b", fallback_from: "OpenRouter", fallback_reason: "OpenRouter sem cota",
    })
  })

  it("uso da entrega: uma linha, só o dono vê", async () => {
    await db.sql(`select public.office_record_usage($1, $2, $3, $4, 'qwen3:4b', 120, 40, 900, 'OpenRouter')`, [PC_ANA, JOB, LEASE, CONN_OLLAMA])
    await db.sql(`select public.office_record_usage($1, $2, $3, $4, 'qwen3:4b', 130, 45, 950, 'OpenRouter')`, [PC_ANA, JOB, LEASE, CONN_OLLAMA])
    expect(await as(ANA, `select provider, input_tokens, free, fallback_from from public.office_usage`)).toEqual([{ provider: "ollama", input_tokens: 130, free: true, fallback_from: "OpenRouter" }])
    expect(await as(BETO, `select * from public.office_usage`)).toEqual([])
    expect(await as(GABRIEL, `select * from public.office_usage`)).toEqual([])
  })
})

describe("parar: desligar o PC e suspender o escritório", () => {
  it("só o dono ou um founder desliga; a entrega em andamento volta para a fila", async () => {
    expect(await fails(BETO, `select public.office_disable_pc($1)`, [PC_ANA])).toBe("office_pc_not_found")
    expect((await one<{ n: number }>(ANA, `select public.office_disable_pc($1) n`, [PC_ANA])).n).toBe(1)
    expect(await srv(`select enabled, pc_status, disabled_by from public.workers where id = $1`, [PC_ANA])).toEqual({ enabled: false, pc_status: "desligado", disabled_by: "u3" })
    expect(await srv(`select status, claimed_by, lease_id from public.ai_jobs where public_id = $1`, [JOB])).toEqual({ status: "queued", claimed_by: null, lease_id: null })
    // o lease antigo não vale mais
    expect(await fails(null, `select public.office_delivery($1, $2, $3)`, [PC_ANA, JOB, LEASE])).toBe("lease_lost")
    // desligado não volta: precisa de pedido novo, com token novo
    expect(await fails(GABRIEL, `select public.dock_decide_pc($1, true)`, [PC_ANA])).toBe("office_pc_not_found")
  })

  it("PC novo da Ana pega a entrega; com o escritório suspenso, a fila não entrega nada", async () => {
    const novo = (await one<{ id: string }>(ANA, `select public.office_request_pc('PC da Ana 2', $1, 'Qwer') as id`, [hex("token-ana-2")])).id
    await as(GABRIEL, `select public.dock_decide_pc($1, true)`, [novo])
    await as(GABRIEL, `select public.dock_set_office_suspended('u3', true)`)
    expect(await db.sql(`select * from public.claim_next_job($1, array['office_reply','office_action'], null)`, [novo])).toEqual([])
    await as(GABRIEL, `select public.dock_set_office_suspended('u3', false)`)
    await as(ANA, `select public.office_set_agent_paused($1, true)`, [BOT])
    expect(await db.sql(`select * from public.claim_next_job($1, array['office_reply','office_action'], null)`, [novo])).toEqual([])
    await as(ANA, `select public.office_set_agent_paused($1, false)`, [BOT])
    expect((await srv<{ public_id: string }>(`select public_id from public.claim_next_job($1, array['office_reply','office_action'], null)`, [novo])).public_id).toBe(JOB)
  })

  it("um founder também desliga o PC de qualquer pessoa", async () => {
    expect(await fails(GABRIEL, `select public.office_disable_pc($1)`, [PC_BETO])).toBe("ok")
  })
})
