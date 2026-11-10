/**
 * Escritório pessoal NO POSTGRES DE VERDADE (migration 0026, ADR 0022).
 * Prova o isolamento entre contas (nem founder lê o escritório de outro), as travas do
 * organograma, a idempotência das mensagens e a fila respeitando o dono e os limites.
 */
import { beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./test-db"

let db: TestDb
const GABRIEL = "gabriel@hzk.test"
const IGOR = "igor@hzk.test"
const ANA = "ana@hzk.test"

const as = <T = Record<string, unknown>>(email: string, query: string, params: unknown[] = []) => db.as({ email }, () => db.sql<T>(query, params))
const one = async <T = Record<string, unknown>>(email: string, query: string, params: unknown[] = []) => (await as<T>(email, query, params))[0]
/** Erro da função (código legível) ou "negado" (RLS/grant). */
async function fails(email: string, query: string, params: unknown[] = []) {
  try {
    await as(email, query, params)
    return "ok"
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(msg)) return "negado"
    return msg.match(/office_[a-z_]+/)?.[0] ?? msg
  }
}
const agent = async (email: string, kind: string, parent: string | null, name: string) =>
  (await one<{ id: string }>(email, `select public.office_upsert_agent(null, $1, $2, $3, 'Cargo') as id`, [kind, parent, name])).id
const thread = async (email: string, kind: string, ids: string[]) => (await one<{ id: string }>(email, `select public.office_open_thread($1, $2) as id`, [kind, ids])).id
const send = (email: string, thr: string, body: string, key: string, mentions: string[] = []) =>
  one<{ message_id: string; created: boolean; deliveries: number }>(email, `select * from public.office_send_message($1, $2, $3, $4)`, [thr, body, key, mentions])
const wid = (c: string) => `wrk_${c.repeat(26)}`
const claim = async (worker: string, agentId: string | null = null) =>
  (await db.sql<{ public_id: string; entity_id: string; owner_team_id: string | null }>(`select public_id, entity_id, owner_team_id from public.claim_next_job($1, array['office_reply'], $2)`, [worker, agentId]))[0] ?? null

let C: string, F1: string

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(`
    insert into public.members (email, team_id, display_name, role_level, active) values
      ('${GABRIEL}', 'u1', 'Gabriel', 'owner', true),
      ('${IGOR}',    'u2', 'Igor',    'owner', true),
      ('${ANA}',     'u3', 'Ana',     'operator', true);
    insert into public.workers (id, name, token_hash, owner_team_id) values
      ('${wid("A")}', 'worker da empresa', 'hA', null),
      ('${wid("G")}', 'Ponte do Gabriel',  'hG', 'u1'),
      ('${wid("J")}', 'Ponte do Igor',     'hI', 'u2');
  `)
}, 120_000)

describe("termo e isolamento", () => {
  it("sem aceitar o termo, nada é criado", async () => {
    expect(await fails(GABRIEL, `select public.office_upsert_agent(null, 'co_lider', null, 'Coordenador', 'Cargo')`)).toBe("office_consent_required")
  })

  it("cada um lê só o próprio escritório, nem founder lê o de outro", async () => {
    await as(GABRIEL, `select public.office_accept_consent('v1')`)
    await as(IGOR, `select public.office_accept_consent('v1')`)
    C = await agent(GABRIEL, "co_lider", null, "Coordenador")
    F1 = await agent(GABRIEL, "funcionario", C, "Redator")
    expect(await as(GABRIEL, `select id from public.office_agents`)).toHaveLength(2)
    expect(await as(IGOR, `select id from public.office_agents`)).toHaveLength(0)
    expect(await as(ANA, `select id from public.office_agents`)).toHaveLength(0)
    expect(await as(IGOR, `select owner_team_id from public.office`)).toEqual([{ owner_team_id: "u2" }])
    expect(await as(GABRIEL, `select version from public.office_agent_versions where agent_id = $1`, [C])).toEqual([{ version: 1 }])
    expect(await as(IGOR, `select 1 from public.office_agent_versions`)).toHaveLength(0)
  })

  it("o navegador não escreve direto nas tabelas", async () => {
    expect(await fails(GABRIEL, `insert into public.office_agents (id, owner_team_id, kind, name, title, created_by) values ('agt_${"X".repeat(26)}', 'u1', 'co_lider', 'x', 'x', 'u1')`)).toBe("negado")
    expect(await fails(GABRIEL, `update public.office_agents set paused = true`)).toBe("negado")
    expect(await fails(GABRIEL, `delete from public.office_messages`)).toBe("negado")
  })

  it("ninguém usa agente de outra pessoa como chefe", async () => {
    expect(await fails(IGOR, `select public.office_upsert_agent(null, 'funcionario', $1, 'x', 'x')`, [C])).toBe("office_parent_not_found")
  })
})

describe("organograma: travas no banco", () => {
  it("um co-líder, 3 níveis, sem ciclo, tipo fixo", async () => {
    expect(await fails(GABRIEL, `select public.office_upsert_agent(null, 'co_lider', null, 'Outro', 'Cargo')`)).toBe("office_one_co_lider")
    const F2 = await agent(GABRIEL, "funcionario", F1, "Revisor")
    expect(await fails(GABRIEL, `select public.office_upsert_agent(null, 'funcionario', $1, 'Quarto', 'Cargo')`, [F2])).toBe("office_limit_depth")
    expect(await fails(GABRIEL, `select public.office_upsert_agent($1, 'funcionario', $2, 'Redator', 'Cargo')`, [F1, F2])).toBe("office_cycle")
    expect(await fails(GABRIEL, `select public.office_upsert_agent($1, 'co_lider', null, 'Redator', 'Cargo')`, [F1])).toBe("office_kind_immutable")
  })

  it("editar instruções sobe a versão e guarda o histórico", async () => {
    await as(GABRIEL, `select public.office_upsert_agent($1, 'funcionario', $2, 'Redator', 'Cargo', '', 'Escreva curto.')`, [F1, C])
    expect(await as(GABRIEL, `select version, instructions from public.office_agent_versions where agent_id = $1 order by version`, [F1])).toEqual([
      { version: 1, instructions: "" },
      { version: 2, instructions: "Escreva curto." },
    ])
  })

  it("no máximo 20 agentes por escritório", async () => {
    const count = Number((await one<{ n: number }>(GABRIEL, `select count(*)::int as n from public.office_agents`)).n)
    for (let i = count; i < 20; i++) await agent(GABRIEL, "funcionario", C, `Extra ${i}`)
    expect(await fails(GABRIEL, `select public.office_upsert_agent(null, 'funcionario', $1, 'Vigésimo primeiro', 'Cargo')`, [C])).toBe("office_limit_agents")
  })
})

describe("mensagens viram entregas na fila, sem duplicar", () => {
  it("canal: sem menção vai ao líder (co-líder); com menção, a quem foi mencionado", async () => {
    const canal = await thread(GABRIEL, "canal", [F1, C])
    expect((await one<{ lead_agent_id: string }>(GABRIEL, `select lead_agent_id from public.office_threads where id = $1`, [canal])).lead_agent_id).toBe(C)
    const a = await send(GABRIEL, canal, "Bom dia, equipe", "chave-0001")
    expect(a).toMatchObject({ created: true, deliveries: 1 })
    expect(await as(GABRIEL, `select agent_id, payload from public.ai_jobs where causation_id = $1`, [a.message_id])).toEqual([
      { agent_id: C, payload: { message_id: a.message_id, thread_id: canal, task_id: null } },
    ])
    const b = await send(GABRIEL, canal, "Redator, rascunhe o post", "chave-0002", [F1, "agt_de_fora"])
    expect(await as(GABRIEL, `select agent_id from public.ai_jobs where causation_id = $1`, [b.message_id])).toEqual([{ agent_id: F1 }])
  })

  it("reenvio com a mesma chave não duplica mensagem nem entrega", async () => {
    const d = await thread(GABRIEL, "direta", [C])
    const first = await send(GABRIEL, d, "Oi", "chave-dup-01")
    const again = await send(GABRIEL, d, "Oi", "chave-dup-01")
    expect(again).toEqual({ message_id: first.message_id, created: false, deliveries: 0 })
    expect(await as(GABRIEL, `select 1 from public.office_messages where idempotency_key = 'chave-dup-01'`)).toHaveLength(1)
    expect(await as(GABRIEL, `select 1 from public.ai_jobs where causation_id = $1`, [first.message_id])).toHaveLength(1)
  })

  it("ninguém escreve na conversa de outra pessoa; mensagem vazia é recusada", async () => {
    const d = await thread(GABRIEL, "direta", [C])
    expect(await fails(IGOR, `select * from public.office_send_message($1, 'oi', 'chave-igor-1')`, [d])).toBe("office_thread_not_found")
    expect(await fails(GABRIEL, `select * from public.office_send_message($1, '   ', 'chave-vazia-1')`, [d])).toBe("office_invalid_body")
    expect(await fails(GABRIEL, `select public.office_open_thread('direta', array[$1, $2])`, [C, F1])).toBe("office_direct_needs_one")
  })
})

describe("conexões, IA do agente e reservas", () => {
  let conOllama: string, conRouter: string

  it("conexão guarda só a descrição; cada um vê só as suas", async () => {
    conOllama = (await one<{ id: string }>(GABRIEL, `select public.office_upsert_connection(null, 'local', 'Ollama', 'Ollama no PC') as id`)).id
    conRouter = (await one<{ id: string }>(GABRIEL, `select public.office_upsert_connection(null, 'chave', 'openrouter', 'OpenRouter grátis') as id`)).id
    expect(await as(GABRIEL, `select provider, status from public.office_connections order by created_at`)).toEqual([
      { provider: "ollama", status: "pendente" },
      { provider: "openrouter", status: "pendente" },
    ])
    expect(await as(IGOR, `select 1 from public.office_connections`)).toHaveLength(0)
    const cols = await db.sql<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'office_connections'`)
    expect(cols.map((c) => c.column_name).some((c) => /key|secret|token|senha/i.test(c))).toBe(false) // nenhum lugar para segredo
  })

  it("agente escolhe a IA e as reservas; nada de conexão de outra pessoa", async () => {
    await as(GABRIEL, `select public.office_upsert_agent($1, 'funcionario', $2, 'Redator', 'Cargo', '', 'Escreva curto.', 'llama3.1', 'low', $3, $4::jsonb, array['texto','web'])`, [
      F1, C, conOllama, JSON.stringify([{ connection_id: conRouter, model: "deepseek-r1:free" }]),
    ])
    expect(await one(GABRIEL, `select connection_id, model, backup_models, capabilities from public.office_agents where id = $1`, [F1])).toEqual({
      connection_id: conOllama, model: "llama3.1", backup_models: [{ connection_id: conRouter, model: "deepseek-r1:free" }], capabilities: ["texto", "web"],
    })
    const igorCon = (await one<{ id: string }>(IGOR, `select public.office_upsert_connection(null, 'chave', 'gemini', 'Gemini do Igor') as id`)).id
    expect(await fails(GABRIEL, `select public.office_upsert_agent($1, 'funcionario', $2, 'Redator', 'Cargo', '', '', null, 'low', $3)`, [F1, C, igorCon])).toBe("office_connection_not_found")
    const nine = JSON.stringify(Array.from({ length: 9 }, () => ({ connection_id: conRouter, model: "x" })))
    expect(await fails(GABRIEL, `select public.office_upsert_agent($1, 'funcionario', $2, 'Redator', 'Cargo', '', '', null, 'low', null, $3::jsonb)`, [F1, C, nine])).toBe("office_invalid_backups")
    expect(await fails(GABRIEL, `select public.office_upsert_agent($1, 'funcionario', $2, 'Redator', 'Cargo', '', '', null, 'low', null, $3::jsonb)`, [F1, C, JSON.stringify([{ connection_id: igorCon, model: "x" }])])).toBe("office_invalid_backups")
  })

  it("desligar conexão é do dono; ninguém escreve a conexão de outro", async () => {
    await as(GABRIEL, `select public.office_set_connection_enabled($1, false)`, [conRouter])
    expect((await one<{ status: string }>(GABRIEL, `select status from public.office_connections where id = $1`, [conRouter])).status).toBe("desligada")
    expect(await fails(IGOR, `select public.office_set_connection_enabled($1, true)`, [conRouter])).toBe("office_connection_not_found")
    expect(await fails(GABRIEL, `update public.office_connections set status = 'conectada'`)).toBe("negado")
  })
})

describe("tarefas", () => {
  it("nova tarefa cria a conversa, a mensagem e a entrega ligada a ela; sem duplicar", async () => {
    const t = await one<{ task_id: string; thread_id: string; message_id: string; created: boolean }>(GABRIEL,
      `select * from public.office_create_task('Pesquisa: clínicas em Curitiba', 'Levante 30 clínicas e compare preços.', $1, 'tarefa-0001')`, [C])
    expect(t.created).toBe(true)
    expect(await one(GABRIEL, `select root_task_id, status, assigned_agent_id, thread_id from public.office_tasks where id = $1`, [t.task_id])).toEqual({
      root_task_id: t.task_id, status: "aberta", assigned_agent_id: C, thread_id: t.thread_id,
    })
    expect(await as(GABRIEL, `select agent_id, office_task_id from public.ai_jobs where causation_id = $1`, [t.message_id])).toEqual([{ agent_id: C, office_task_id: t.task_id }])
    const again = await one(GABRIEL, `select * from public.office_create_task('Pesquisa: clínicas em Curitiba', 'x', $1, 'tarefa-0001')`, [C])
    expect(again).toEqual({ ...t, created: false })
    expect(await as(GABRIEL, `select 1 from public.office_tasks where title like 'Pesquisa: clínicas%'`)).toHaveLength(1)
    expect(await as(IGOR, `select 1 from public.office_tasks`)).toHaveLength(0)
    expect(await fails(IGOR, `select * from public.office_create_task('x', '', $1, 'tarefa-igor-1')`, [C])).toBe("office_agent_not_found")
  })

  it("uso: só o dono lê; ninguém grava pela tela", async () => {
    await db.sql(`insert into public.office_usage (owner_team_id, job_public_id, agent_id, provider, model, input_tokens, output_tokens, free) values ('u1', 'job_teste_uso', $1, 'ollama', 'llama3.1', 120, 80, true)`, [F1])
    expect(await as(GABRIEL, `select provider, input_tokens from public.office_usage`)).toEqual([{ provider: "ollama", input_tokens: 120 }])
    expect(await as(IGOR, `select 1 from public.office_usage`)).toHaveLength(0)
    expect(await fails(GABRIEL, `insert into public.office_usage (owner_team_id, job_public_id, agent_id, provider, model) values ('u1', 'job_falso', 'x', 'x', 'x')`)).toBe("negado")
  })
})

describe("fila: privacidade, dono do worker e limites", () => {
  it("job pessoal só aparece para o dono; job da empresa continua para todos", async () => {
    await db.sql(`insert into public.ai_jobs (public_id, job_type, agent_id, created_by) values ('job_${"C".repeat(26)}', 'analyze_lead', 'web-analyst', 'system')`)
    const mine = await as(GABRIEL, `select owner_team_id from public.ai_jobs`)
    expect(mine.some((j) => j.owner_team_id === "u1")).toBe(true)
    for (const who of [IGOR, ANA]) {
      const rows = await as(who, `select owner_team_id from public.ai_jobs`)
      expect(rows.map((j) => j.owner_team_id)).toEqual([null])
    }
  })

  it("cada um vê só a própria Ponte entre os workers pessoais", async () => {
    expect((await as(IGOR, `select id from public.workers order by id`)).map((w) => w.id)).toEqual([wid("A"), wid("J")])
    expect(await fails(IGOR, `select token_hash from public.workers`)).toBe("negado")
  })

  it("worker só pega job do mesmo dono", async () => {
    expect(await claim(wid("J"))).toBeNull() // Igor não tem entregas
    const company = (await db.sql<{ public_id: string; owner_team_id: string | null }>(`select public_id, owner_team_id from public.claim_next_job($1, '{}')`, [wid("A")]))[0]
    expect(company).toMatchObject({ owner_team_id: null }) // empresa pega o job da empresa, nunca um pessoal
    expect(await claim(wid("A"))).toBeNull()
    const g = await claim(wid("G"))
    expect(g?.owner_team_id).toBe("u1")
  })

  it("1 mensagem por vez por conversa, no máximo 2 por agente, agente pausado não recebe", async () => {
    const R = await agent(IGOR, "co_lider", null, "Revisor do Igor")
    const [t1, t2, t3] = [await thread(IGOR, "direta", [R]), await thread(IGOR, "direta", [R]), await thread(IGOR, "direta", [R])]
    await send(IGOR, t1, "um", "igor-k-0001")
    await send(IGOR, t1, "dois", "igor-k-0002")
    await send(IGOR, t2, "três", "igor-k-0003")
    await send(IGOR, t3, "quatro", "igor-k-0004")
    const a = await claim(wid("J"), R)
    const b = await claim(wid("J"), R)
    expect(a && b && a.entity_id !== b.entity_id).toBe(true) // nunca duas da mesma conversa
    expect(await claim(wid("J"), R)).toBeNull() // já tem 2 em execução

    const P = await agent(IGOR, "funcionario", R, "Pausado")
    await send(IGOR, await thread(IGOR, "direta", [P]), "oi", "igor-k-0005")
    await as(IGOR, `select public.office_set_agent_paused($1, true)`, [P])
    expect(await claim(wid("J"), P)).toBeNull()
    await as(IGOR, `select public.office_set_agent_paused($1, false)`, [P])
    expect(await claim(wid("J"), P)).not.toBeNull()
  })

  it("job pessoal não gera evento na timeline da empresa", async () => {
    const personal = await db.sql<{ public_id: string }>(`select public_id from public.ai_jobs where owner_team_id is not null`)
    const ev = await db.sql(`select 1 from public.events where entity_type = 'job' and entity_id = any($1)`, [personal.map((j) => j.public_id)])
    expect(ev).toHaveLength(0)
    expect(await db.sql(`select 1 from public.events where event_type = 'job.claimed' and entity_id = 'job_${"C".repeat(26)}'`)).toHaveLength(1)
  })
})
