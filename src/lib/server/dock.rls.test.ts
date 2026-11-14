/**
 * HZK Dock v3 NO POSTGRES DE VERDADE (migration 0027, especificação na nota 42 do vault, ADR 0023).
 * Roda todas as migrations reais e confere, logado como cada pessoa, o que o banco entrega e aceita:
 * primeira leva só nos níveis 0 e 1, skills por área com versões e proposta, catálogo de conectores
 * de founder, "sempre permitir" só na classe C e o porteiro decidindo toda ação de conector da empresa.
 * Os testes rodam em sequência no mesmo banco: cada bloco parte do estado do anterior.
 *
 * Fora do `as`, o código roda como dono do banco: é o papel do servidor (service_role / motor via API).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./test-db"

let db: TestDb
const GABRIEL = "gabriel@hzk.test" // founder, responsável pela área produção
const IGOR = "igor@hzk.test" // founder
const ANA = "ana@hzk.test" // operadora com acesso à produção (área restrita)
const BETO = "beto@hzk.test" // operador SEM acesso à produção

const as = <T = Record<string, unknown>>(email: string, query: string, params: unknown[] = []) => db.as({ email }, () => db.sql<T>(query, params))
const one = async <T = Record<string, unknown>>(email: string, query: string, params: unknown[] = []) => (await as<T>(email, query, params))[0]
const srv = async <T = Record<string, unknown>>(query: string, params: unknown[] = []) => (await db.sql<T>(query, params))[0]
/** Código legível do erro (office_…, dock_…), "negado" (RLS/permissão) ou "ok". */
async function fails(email: string | null, query: string, params: unknown[] = []) {
  try {
    if (email) await as(email, query, params)
    else await db.sql(query, params)
    return "ok"
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(msg)) return "negado"
    return msg.match(/(?:office|dock)_[a-z_0-9]+/)?.[0] ?? msg
  }
}
const sha = (c: string) => c.repeat(64)
const wid = (c: string) => `wrk_${c.repeat(26)}`

// ids que os blocos vão preenchendo
let BOT: string // bot da Ana
let CONN_OR: string // OpenRouter da Ana
let CONN_GEM: string // Gemini da Ana (provedor que treina com os dados)
let SK_CODIGO: string // skill da área produção
let SK_PESSOAL: string // skill pessoal da Ana
let THREAD: string

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(`
    insert into public.members (email, team_id, display_name, role_level, active) values
      ('${GABRIEL}', 'u1', 'Gabriel', 'owner', true),
      ('${IGOR}',    'u2', 'Igor',    'owner', true),
      ('${ANA}',     'u3', 'Ana',     'operator', true),
      ('${BETO}',    'u4', 'Beto',    'operator', true);
    insert into public.areas (id, data) values
      ('producao',  '{"id":"producao","name":"Produção","restricted":true,"owner":{"memberId":"u1"}}'),
      ('comercial', '{"id":"comercial","name":"Comercial"}')
    on conflict (id) do update set data = excluded.data;
    insert into public.area_access (member_id, area_id, level, granted_by) values ('u3', 'producao', 'operar', 'u1');
    insert into public.workers (id, name, token_hash, owner_team_id) values ('${wid("A")}', 'Ponte da Ana', 'hA', 'u3');
  `)
  for (const e of [GABRIEL, IGOR, ANA, BETO]) await as(e, `select public.office_accept_consent('v1')`)
}, 120_000)

describe("a migration", () => {
  it("roda de novo sem quebrar (idempotente)", async () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0027_dock_v3.sql"), "utf8")
    await db.pg.exec(sql)
    const t = await db.sql<{ n: number }>(`select count(*)::int n from pg_tables where schemaname = 'public' and tablename like 'dock\\_%'`)
    expect(t[0].n).toBe(10)
  })
})

describe("bot: nível (primeira leva só 0 e 1) e avatar", () => {
  it("nasce no nível 0, com a Constelação; sobe até 1 e não passa disso", async () => {
    BOT = (await one<{ id: string }>(ANA, `select public.office_upsert_agent(null, null, 'Dev do site', 'Sites') as id`)).id
    expect(await one(ANA, `select access_level, avatar_style, avatar_color from public.office_agents where id = $1`, [BOT])).toEqual({ access_level: 0, avatar_style: "constelacao", avatar_color: "grafite" })
    expect(await fails(ANA, `select public.office_set_agent_access($1, 1)`, [BOT])).toBe("ok")
    expect(await fails(ANA, `select public.office_set_agent_access($1, 2)`, [BOT])).toBe("office_level_not_released")
    expect(await fails(ANA, `select public.office_set_agent_access($1, 3)`, [BOT])).toBe("office_level_not_released")
    expect((await one<{ access_level: number }>(ANA, `select access_level from public.office_agents where id = $1`, [BOT])).access_level).toBe(1)
  })

  it("aparência: Saturno e Halo são opção; cor fora da paleta é recusada", async () => {
    expect(await fails(ANA, `select public.office_set_agent_avatar($1, 'halo', 'musgo', 'codigo')`, [BOT])).toBe("ok")
    expect(await fails(ANA, `select public.office_set_agent_avatar($1, 'arco-iris', null, null)`, [BOT])).not.toBe("ok")
    expect(await fails(ANA, `select public.office_set_agent_avatar($1, null, 'laranja', null)`, [BOT])).not.toBe("ok")
    expect(await fails(BETO, `select public.office_set_agent_avatar($1, 'saturno', null, null)`, [BOT])).toBe("office_agent_not_found")
  })
})

describe("conexões de IA", () => {
  it("chave e local entram; assinatura e ACP não têm botão nesta leva", async () => {
    CONN_OR = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'chave', 'openrouter', 'OpenRouter') as id`)).id
    CONN_GEM = (await one<{ id: string }>(ANA, `select public.office_save_connection(null, 'chave', 'gemini', 'Gemini') as id`)).id
    expect(await fails(ANA, `select public.office_save_connection(null, 'local', 'ollama', 'Ollama')`)).toBe("ok")
    expect(await fails(ANA, `select public.office_save_connection(null, 'assinatura', 'claude_code', 'Claude')`)).toBe("office_kind_not_offered")
    expect(await fails(ANA, `select public.office_save_connection(null, 'acp', 'codex', 'Codex', p_acp_agent => 'codex', p_terms_version => 'v1')`)).toBe("office_kind_not_released")
    // o caminho antigo passa pelas mesmas travas
    expect(await fails(ANA, `select public.office_upsert_connection(null, 'assinatura', 'claude_code', 'Claude')`)).toBe("office_kind_not_offered")
  })

  it("personalizado: exige aceitar o aviso, https fora do PC e endereço sem usuário:senha", async () => {
    expect(await fails(ANA, `select public.office_save_connection(null, 'compativel', 'meu', 'Meu', p_endpoint => 'https://ia.exemplo.com/v1')`)).toBe("office_terms_required")
    expect(await fails(ANA, `select public.office_save_connection(null, 'compativel', 'meu', 'Meu', p_endpoint => 'https://ia.exemplo.com/v1', p_terms_version => 'v1')`)).toBe("ok")
    expect(await fails(ANA, `select public.office_save_connection(null, 'compativel', 'meu2', 'Meu2', p_endpoint => 'https://user:senha@ia.exemplo.com/v1', p_terms_version => 'v1')`)).not.toBe("ok")
    expect(await fails(ANA, `select public.office_save_connection(null, 'compativel', 'meu3', 'Meu3', p_endpoint => 'http://ia.exemplo.com/v1', p_terms_version => 'v1')`)).not.toBe("ok")
    expect(await fails(ANA, `select public.office_save_connection(null, 'compativel', 'meu4', 'Meu4', p_endpoint => 'http://localhost:1234/v1', p_terms_version => 'v1')`)).toBe("ok")
  })

  it("nenhuma coluna guarda segredo", async () => {
    const cols = await db.sql<{ c: string }>(`select table_name || '.' || column_name c from information_schema.columns
      where table_schema = 'public' and (table_name like 'dock\\_%' or table_name like 'office\\_%')
        and column_name ~* '(secret|token|password|senha|api_key|apikey)' and column_name !~ '_tokens$'`)
    expect(cols).toEqual([])
  })
})

describe("skills: por área, versões, instalação por nível", () => {
  it("só o responsável da área cria skill da área; quem é de fora recebe 'use a proposta'", async () => {
    SK_CODIGO = (await one<{ id: string }>(GABRIEL, `select public.dock_save_skill(null, 'area', 'producao', 'Padrão de código HZK', 'Como a HZK escreve código', '1.0', null, 'Escreva testes antes do PR.', p_min_level => 1, p_in_kit => true) as id`)).id
    expect(await fails(ANA, `select public.dock_save_skill(null, 'area', 'producao', 'Outra', '', '1.0', null, 'x')`)).toBe("dock_use_proposal")
    expect(await fails(BETO, `select public.dock_save_skill($1, 'area', 'producao', 'Padrão', '', '1.1', 'mudei', 'y')`, [SK_CODIGO])).toBe("dock_use_proposal")
  })

  it("skill com script está desligada nesta leva", async () => {
    expect(await fails(GABRIEL, `select public.dock_save_skill(null, 'area', 'producao', 'Com script', '', '1.0', null, 'x', p_min_level => 2, p_has_scripts => true)`)).toBe("dock_scripts_not_released")
  })

  it("quem lê a área lê a skill; quem não tem a área restrita não lê; skill pessoal só o dono", async () => {
    SK_PESSOAL = (await one<{ id: string }>(ANA, `select public.dock_save_skill(null, 'pessoal', null, 'Meu tom de e-mail', '', '0.1', null, 'Frases curtas.') as id`)).id
    expect((await as(ANA, `select id from public.dock_skills`)).length).toBe(2)
    expect((await as(GABRIEL, `select id from public.dock_skills`)).length).toBe(1)
    expect((await as(IGOR, `select id from public.dock_skills`)).length).toBe(1)
    expect(await as(BETO, `select id from public.dock_skills`)).toEqual([])
    expect(await as(BETO, `select skill_id from public.dock_skill_versions`)).toEqual([])
    expect((await as(ANA, `select skill_id from public.dock_skill_versions`)).length).toBe(2)
  })

  it("bot de nível baixo não recebe skill que pede nível alto", async () => {
    const low = (await one<{ id: string }>(ANA, `select public.office_upsert_agent(null, null, 'Organizadora', 'Semana') as id`)).id
    expect(await fails(ANA, `select public.office_install_skill($1, $2)`, [low, SK_CODIGO])).toBe("office_skill_level")
    expect(await fails(ANA, `select public.office_install_skill($1, $2)`, [BOT, SK_CODIGO])).toBe("ok")
    expect(await fails(BETO, `select public.office_install_skill($1, $2)`, [BOT, SK_CODIGO])).toBe("office_agent_not_found")
    const beto = (await one<{ id: string }>(BETO, `select public.office_upsert_agent(null, null, 'Bot do Beto', 'x') as id`)).id
    await as(BETO, `select public.office_set_agent_access($1, 1)`, [beto])
    expect(await fails(BETO, `select public.office_install_skill($1, $2)`, [beto, SK_CODIGO])).toBe("dock_skill_not_found")
    expect(await fails(BETO, `select public.office_install_skill($1, $2)`, [beto, SK_PESSOAL])).toBe("dock_skill_not_found")
  })

  it("versão é imutável, nem o servidor altera", async () => {
    expect(await fails(null, `update public.dock_skill_versions set body = 'trocado' where skill_id = $1`, [SK_CODIGO])).toBe("dock_immutable")
    expect(await fails(null, `delete from public.dock_skill_versions where skill_id = $1`, [SK_CODIGO])).toBe("dock_immutable")
  })
})

describe("skills: aprendizado → sinal → proposta → aprovação do responsável", () => {
  let LEARN: string, SIG: string, PROP: string

  it("o sinal só leva o padrão; texto com cara de dado pessoal é recusado", async () => {
    LEARN = (await srv<{ id: string }>(`insert into public.office_skill_learnings (id, owner_team_id, agent_id, skill_id, version, kind, pattern, evidence)
      values (private.ulid('lrn'), 'u3', $1, $2, 1, 'erro', 'Conferir a tela no celular antes de terminar.', 'conversa com cliente X') returning id`, [BOT, SK_CODIGO])).id
    expect(await as(BETO, `select id from public.office_skill_learnings`)).toEqual([])
    expect(await fails(ANA, `select public.office_send_skill_signal($1, 'Mandei para joao@cliente.com.br a versão')`, [LEARN])).toBe("dock_signal_looks_personal")
    expect(await fails(ANA, `select public.office_send_skill_signal($1, 'Ver em https://cliente.com')`, [LEARN])).toBe("dock_signal_looks_personal")
    SIG = (await one<{ id: string }>(ANA, `select public.office_send_skill_signal($1, 'Conferir a tela no celular (390 px) antes de dizer que terminou.') as id`, [LEARN])).id
    const cols = await db.sql<{ c: string }>(`select column_name c from information_schema.columns where table_name = 'dock_skill_signals'`)
    expect(cols.map((c) => c.c)).not.toContain("evidence")
    expect((await as(GABRIEL, `select id from public.dock_skill_signals`)).length).toBe(1) // responsável vê
    expect(await as(BETO, `select id from public.dock_skill_signals`)).toEqual([])
  })

  it("quem não é responsável não aprova; o responsável aprova e a versão sai", async () => {
    PROP = (await one<{ id: string }>(ANA, `select public.dock_propose_skill('producao', $1, null, 'Padrão de código HZK', '', '1.1', 'Conferir no celular antes de terminar.', '3 entregas voltaram', 'Escreva testes. Confira no celular.', p_min_level => 1, p_signal_ids => array[$2]) as id`, [SK_CODIGO, SIG])).id
    expect((await one<{ signal_count: number }>(GABRIEL, `select signal_count from public.dock_skill_proposals where id = $1`, [PROP])).signal_count).toBe(1)
    expect(await fails(BETO, `select public.dock_propose_skill('producao', $1, null, 'x', '', '1.2', 'x', '', 'x')`, [SK_CODIGO])).toBe("dock_area_not_allowed")
    expect(await fails(ANA, `select public.dock_decide_skill_proposal($1, true)`, [PROP])).toBe("dock_proposal_not_found")
    expect(await fails(GABRIEL, `select public.dock_decide_skill_proposal($1, true, 'ok')`, [PROP])).toBe("ok")
    expect((await one<{ current_version: number }>(ANA, `select current_version from public.dock_skills where id = $1`, [SK_CODIGO])).current_version).toBe(2)
    expect(await fails(GABRIEL, `select public.dock_decide_skill_proposal($1, true)`, [PROP])).toBe("dock_proposal_closed")
  })

  it("versão nova que não pede mais poder entra sozinha; a que pede mais espera o dono", async () => {
    expect((await srv<{ v: number }>(`select private.office_skill_version_for($1, $2) v`, [BOT, SK_CODIGO])).v).toBe(2)
    // v3 pede um conector: o bot fica na v2 até a Ana aceitar
    await as(GABRIEL, `select public.dock_save_connector('github', 'GitHub', 'programacao', '', 'empresa', 'http', 0, 1, p_server_host => 'api.githubcopilot.com', p_source_url => 'https://github.com/github/github-mcp-server')`)
    await as(GABRIEL, `select public.dock_save_skill($1, 'area', 'producao', 'Padrão de código HZK', '', '1.2', 'Usa o GitHub', 'Abra PR pelo GitHub.', p_min_level => 1, p_required => array['github'], p_in_kit => true)`, [SK_CODIGO])
    expect((await srv<{ v: number }>(`select private.office_skill_version_for($1, $2) v`, [BOT, SK_CODIGO])).v).toBe(2)
    await as(ANA, `select public.office_ack_skill_update($1, $2, 'atualizar')`, [BOT, SK_CODIGO])
    expect((await srv<{ v: number }>(`select private.office_skill_version_for($1, $2) v`, [BOT, SK_CODIGO])).v).toBe(3)
  })

  it("perder a área para a entrega da skill, mesmo instalada", async () => {
    await db.sql(`delete from public.area_access where member_id = 'u3' and area_id = 'producao'`)
    expect((await srv<{ v: number | null }>(`select private.office_skill_version_for($1, $2) v`, [BOT, SK_CODIGO])).v).toBeNull()
    await db.sql(`insert into public.area_access (member_id, area_id, level, granted_by) values ('u3', 'producao', 'operar', 'u1')`)
    expect((await srv<{ v: number }>(`select private.office_skill_version_for($1, $2) v`, [BOT, SK_CODIGO])).v).toBe(3)
  })
})

describe("Kit da área", () => {
  it("o responsável monta; a pessoa cria o bot do kit e ele nasce no nível 0, só com as skills de nível 0", async () => {
    const zero = (await one<{ id: string }>(GABRIEL, `select public.dock_save_skill(null, 'area', 'producao', 'Revisão de PR', '', '1.0', null, 'Erro de verdade, não estilo.', p_in_kit => true) as id`)).id
    expect(await fails(ANA, `select public.dock_save_kit_bot(null, 'producao', 'Dev', 'x', '', '', 1)`)).toBe("dock_area_lead_only")
    const kit = (await one<{ id: string }>(GABRIEL, `select public.dock_save_kit_bot(null, 'producao', 'Dev de sites', 'Sites dos clientes', '', 'Siga o padrão.', 1, array[$1, $2]) as id`, [SK_CODIGO, zero])).id
    expect(await as(BETO, `select id from public.dock_kit_bots`)).toEqual([])
    const nb = (await one<{ id: string }>(ANA, `select public.office_create_agent_from_kit($1) as id`, [kit])).id
    expect(await one(ANA, `select access_level, origin from public.office_agents where id = $1`, [nb])).toEqual({ access_level: 0, origin: "modelo_area" })
    expect((await as<{ skill_id: string }>(ANA, `select skill_id from public.office_agent_skills where agent_id = $1`, [nb])).map((r) => r.skill_id)).toEqual([zero])
    expect(await fails(BETO, `select public.office_create_agent_from_kit($1)`, [kit])).toBe("dock_kit_not_found")
  })
})

describe("catálogo de conectores (founder) e 'sempre permitir'", () => {
  it("só founder edita e aprova; aprovar exige ações e lista de ferramentas", async () => {
    expect(await fails(ANA, `select public.dock_save_connector('x', 'X', 'dados', '', 'empresa', 'interno', 0, 1)`)).toBe("dock_founder_only")
    expect(await fails(GABRIEL, `select public.dock_approve_connector('github', $1)`, [sha("a")])).toBe("dock_connector_without_actions")
    for (const [k, c, items] of [["ler_codigo", "A", 1], ["comentar", "B", 1], ["abrir_pr", "C", 1], ["merge", "D", 1]] as const)
      await as(GABRIEL, `select public.dock_save_connector_action('github', $1, $1, $1, $2, $3)`, [k, c, items])
    expect(await fails(GABRIEL, `select public.dock_save_connector_action('github', 'enviar', 'enviar', 'Enviar', 'C', 1, true)`)).not.toBe("ok") // envio para fora é D
    expect(await fails(GABRIEL, `select public.dock_approve_connector('github', null)`)).toBe("dock_connector_not_ready")
    expect(await fails(GABRIEL, `select public.dock_approve_connector('github', $1)`, [sha("a")])).toBe("ok")
    expect((await as(BETO, `select id from public.dock_connectors`)).length).toBe(1)
  })

  it("pedido de conector: cada um vê o seu, founder vê todos", async () => {
    await as(ANA, `select public.dock_request_connector('Trello', 'https://trello.com', 'Ler o backlog')`)
    expect((await as(ANA, `select id from public.dock_connector_requests`)).length).toBe(1)
    expect(await as(BETO, `select id from public.dock_connector_requests`)).toEqual([])
    expect((await as(IGOR, `select id from public.dock_connector_requests`)).length).toBe(1)
  })

  it("'sempre permitir' só em C, só com o conector fora do só leitura; D nunca, nem direto no banco", async () => {
    await as(ANA, `select public.office_install_connector($1, 'github')`, [BOT])
    expect(await fails(ANA, `select public.office_set_action_grant($1, 'github', 'abrir_pr', true)`, [BOT])).toBe("office_connector_not_installed")
    await as(ANA, `select public.office_install_connector($1, 'github', false)`, [BOT])
    expect(await fails(ANA, `select public.office_set_action_grant($1, 'github', 'abrir_pr', true)`, [BOT])).toBe("ok")
    expect(await fails(ANA, `select public.office_set_action_grant($1, 'github', 'merge', true)`, [BOT])).toBe("office_grant_only_class_c")
    expect(await fails(null, `insert into public.office_action_grants (agent_id, connector_id, action_key, owner_team_id, granted_by) values ($1, 'github', 'merge', 'u3', 'u3')`, [BOT])).toBe("office_grant_only_class_c")
    expect(await fails(BETO, `select public.office_set_action_grant($1, 'github', 'abrir_pr', true)`, [BOT])).toBe("office_connector_not_installed")
  })
})

describe("porteiro: toda ação de conector da empresa passa pelo servidor", () => {
  let JOB: string, LEASE: string
  const ask = (action: string, opts: { conn?: string; items?: number; tainted?: boolean; key?: string } = {}) =>
    srv<{ decision: string; approval: string | null; reason: string; klass: string }>(
      `select * from public.office_request_action($1, $2, $3, $4, 'github', $5, $6, $7, $8, 'leu uma página', 'Abrir PR', 'resumo', '{"title":"PR"}'::jsonb, $9)`,
      [wid("A"), JOB, LEASE, BOT, action, opts.conn ?? CONN_OR, opts.items ?? 1, opts.tainted ?? false, opts.key ?? `k-${action}-${Math.random().toString(36).slice(2, 10)}`],
    )

  it("prepara uma entrega da Ana e o motor dela pega", async () => {
    await as(ANA, `select public.office_upsert_agent($1, null, 'Dev do site', 'Sites', p_connection_id => $2, p_backup_models => $3::jsonb)`, [BOT, CONN_OR, JSON.stringify([{ connection_id: CONN_GEM, model: "gemini-3.8-flash" }])])
    await as(ANA, `select public.office_set_agent_access($1, 1)`, [BOT])
    THREAD = (await one<{ id: string }>(ANA, `select public.office_open_thread('direta', array[$1]) as id`, [BOT])).id
    await as(ANA, `select * from public.office_send_message($1, 'Arrume o formulário', 'msg-key-0001')`, [THREAD])
    const j = await srv<{ public_id: string; lease_id: string }>(`select public_id, lease_id from public.claim_next_job($1, array['office_reply'], null)`, [wid("A")])
    JOB = j.public_id
    LEASE = j.lease_id
    expect(JOB).toBeTruthy()
  })

  it("o navegador e o bot não chamam o porteiro (só o servidor)", async () => {
    expect(await fails(ANA, `select public.office_request_action($1, $2, $3::uuid, $4, 'github', 'ler_codigo', $5, 1, false, '', 't', '', '{}'::jsonb, 'kkkkkkkk')`, [wid("A"), JOB, LEASE, BOT, CONN_OR])).toBe("negado")
  })

  it("A segue; C com 'sempre permitir' segue; o mesmo C com conteúdo de fora vira aprovação", async () => {
    expect(await ask("ler_codigo")).toMatchObject({ decision: "permitida", reason: "classe_A" })
    expect(await ask("abrir_pr")).toMatchObject({ decision: "permitida", reason: "sempre_permitir" })
    const ext = await ask("abrir_pr", { tainted: true })
    expect(ext).toMatchObject({ decision: "aguardando", klass: "C" })
    expect(await one(ANA, `select origin, gate from public.office_approvals where id = $1`, [ext.approval])).toEqual({ origin: "externo", gate: "lote" })
  })

  it("D sempre vira aprovação de bloqueio; volume acima do teto vira D", async () => {
    expect(await ask("merge")).toMatchObject({ decision: "aguardando", klass: "D" })
    expect(await ask("ler_codigo", { items: 600 })).toMatchObject({ decision: "aguardando", klass: "D" })
  })

  it("provedor que treina com os dados não recebe ação da empresa, nem leitura", async () => {
    expect(await ask("ler_codigo", { conn: CONN_GEM })).toMatchObject({ decision: "negada", reason: "provedor_treina_com_dados" })
  })

  it("só o dono vê as aprovações dele (nem founder, fora as de dinheiro); o registro aparece para dono e founders", async () => {
    expect((await as(ANA, `select id from public.office_approvals`)).length).toBe(3)
    expect(await as(IGOR, `select id from public.office_approvals`)).toEqual([])
    expect(await as(BETO, `select id from public.office_approvals`)).toEqual([])
    expect((await as(IGOR, `select id from public.dock_action_log`)).length).toBeGreaterThan(0)
    expect(await as(BETO, `select id from public.dock_action_log`)).toEqual([])
    expect(await fails(null, `update public.dock_action_log set outcome = 'permitida'`)).toBe("dock_immutable")
  })

  it("aprovar: 'sempre permitir' recusado para pedido de fora; o que roda é o rascunho aprovado, uma vez só", async () => {
    const apr = (await one<{ id: string }>(ANA, `select id from public.office_approvals where origin = 'externo'`)).id
    expect(await fails(IGOR, `select public.office_decide_approval($1, true)`, [apr])).toBe("office_approval_not_found")
    expect(await fails(ANA, `select public.office_decide_approval($1, true, null, true)`, [apr])).toBe("office_grant_only_class_c")
    expect(await fails(ANA, `select public.office_decide_approval($1, true, '{"title":"PR revisado"}'::jsonb)`, [apr])).toBe("ok")
    expect(await fails(ANA, `select public.office_decide_approval($1, true)`, [apr])).toBe("office_approval_closed")
    const act = await srv<{ public_id: string; lease_id: string }>(`select public_id, lease_id from public.claim_next_job($1, array['office_action'], null)`, [wid("A")])
    const run = await srv<{ connector: string; action: string; args: { title: string } }>(`select * from public.office_take_approval($1, $2, $3)`, [act.public_id, act.lease_id, apr])
    expect(run).toEqual({ connector: "github", action: "abrir_pr", args: { title: "PR revisado" } })
    expect(await fails(null, `select * from public.office_take_approval($1, $2, $3)`, [act.public_id, act.lease_id, apr])).toBe("office_approval_closed")
    await db.sql(`select public.office_finish_action($1, $2, $3, true, 'PR #44 aberto')`, [act.public_id, act.lease_id, apr])
    expect((await one<{ status: string }>(ANA, `select status from public.office_approvals where id = $1`, [apr])).status).toBe("executada")
  })

  it("conector suspenso e escritório suspenso param na hora", async () => {
    await as(GABRIEL, `select public.dock_suspend_connector('github')`)
    expect(await ask("ler_codigo")).toMatchObject({ decision: "negada", reason: "conector_fora_do_catalogo" })
    await as(GABRIEL, `select public.dock_approve_connector('github', $1)`, [sha("b")]).catch(() => null)
    await db.sql(`update public.dock_connectors set status = 'aprovado' where id = 'github'`)
    await as(GABRIEL, `select public.dock_set_office_suspended('u3', true)`)
    expect(await ask("ler_codigo")).toMatchObject({ decision: "negada", reason: "escritorio_suspenso" })
    await as(GABRIEL, `select public.dock_set_office_suspended('u3', false)`)
    expect(await fails(ANA, `select public.dock_set_office_suspended('u3', false)`)).toBe("dock_founder_only")
  })
})

describe("conversa: qual IA respondeu, troca de IA, continuar com outro bot, rotinas", () => {
  it("a troca de IA vale só nesta conversa e deixa um aviso", async () => {
    const ollama = (await one<{ id: string }>(ANA, `select id from public.office_connections where provider = 'ollama'`)).id
    await as(ANA, `select public.office_set_thread_model($1, $2, $3, 'qwen3:14b')`, [THREAD, BOT, ollama])
    expect((await as(ANA, `select body from public.office_messages where thread_id = $1 and kind = 'aviso'`, [THREAD])).length).toBe(1)
    expect(await fails(BETO, `select public.office_set_thread_model($1, $2, null)`, [THREAD, BOT])).toBe("office_thread_not_found")
  })

  it("a mensagem do bot guarda a IA e só aceita IA escolhida pelo dono", async () => {
    // a entrega anterior desta conversa termina (a fila só deixa uma por vez por conversa)
    await db.sql(`select public.complete_job(public_id, lease_id, '{}'::jsonb) from public.ai_jobs where owner_team_id = 'u3' and status in ('claimed', 'running')`)
    await db.sql(`insert into public.ai_jobs (public_id, job_type, agent_id, entity_type, entity_id, payload, idempotency_key, created_by, required_capabilities, owner_team_id)
      values (private.ulid('job'), 'office_reply', $1, 'office_thread', $2, '{}'::jsonb, 'teste-ia-0001', 'u3', array['office_reply'], 'u3')`, [BOT, THREAD])
    const j = await srv<{ public_id: string; lease_id: string }>(`select public_id, lease_id from public.claim_next_job($1, array['office_reply'], null)`, [wid("A")])
    const outra = (await one<{ id: string }>(ANA, `select id from public.office_connections where provider = 'meu'`)).id
    expect(await fails(null, `select public.office_post_agent_message($1, $2, 1, 'texto', 'oi', null, $3, 'x')`, [j.public_id, j.lease_id, outra])).toBe("office_connection_not_allowed")
    await db.sql(`select public.office_post_agent_message($1, $2, 1, 'texto', 'Resposta', null, $3, 'deepseek-flash:free', 'gemini-3.8-flash', 'sem cota')`, [j.public_id, j.lease_id, CONN_OR])
    expect(await one(ANA, `select provider, model, fallback_from from public.office_messages where job_public_id = $1`, [j.public_id])).toEqual({ provider: "openrouter", model: "deepseek-flash:free", fallback_from: "gemini-3.8-flash" })
  })

  it("continuar com outro bot abre conversa ligada, sem copiar nada e sem criar entrega", async () => {
    const outro = (await one<{ id: string }>(ANA, `select public.office_upsert_agent(null, null, 'Designer', 'Peças') as id`)).id
    const before = (await srv<{ n: number }>(`select count(*)::int n from public.ai_jobs`)).n
    const nt = (await one<{ id: string }>(ANA, `select public.office_continue_with($1, $2, 'cont-key-0001') as id`, [THREAD, outro])).id
    expect((await one<{ continued_from_thread_id: string }>(ANA, `select continued_from_thread_id from public.office_threads where id = $1`, [nt])).continued_from_thread_id).toBe(THREAD)
    expect((await srv<{ n: number }>(`select count(*)::int n from public.ai_jobs`)).n).toBe(before)
    expect((await one<{ id: string }>(ANA, `select public.office_continue_with($1, $2, 'cont-key-0001') as id`, [THREAD, outro])).id).toBe(nt)
  })

  it("rotina vira entrega de origem 'rotina', e nela o C não usa o 'sempre permitir'", async () => {
    const rt = (await one<{ id: string }>(ANA, `select public.office_save_routine(null, $1, 'Resumo', 'Faça o resumo da semana', 'diaria', '08:00') as id`, [BOT])).id
    expect(await fails(ANA, `select public.office_save_routine(null, $1, 'x', 'y', 'semanal', '08:00')`, [BOT])).toBe("office_invalid_schedule")
    await db.sql(`update public.office_routines set next_run_at = now() - interval '1 minute' where id = $1`, [rt])
    expect((await srv<{ n: number }>(`select public.office_run_due_routines() n`)).n).toBe(1)
    expect((await srv<{ n: number }>(`select public.office_run_due_routines() n`)).n).toBe(0)
    await db.sql(`select public.complete_job(public_id, lease_id, '{}'::jsonb) from public.ai_jobs where owner_team_id = 'u3' and status in ('claimed', 'running')`)
    const j = await srv<{ public_id: string; lease_id: string; payload: { origin: string } }>(`select public_id, lease_id, payload from public.claim_next_job($1, array['office_reply'], null)`, [wid("A")])
    expect(j.payload.origin).toBe("rotina")
    const r = await srv<{ decision: string }>(`select * from public.office_request_action($1, $2, $3, $4, 'github', 'abrir_pr', $5, 1, false, '', 'PR', '', '{}'::jsonb, 'rotina-pr-0001')`, [wid("A"), j.public_id, j.lease_id, BOT, CONN_OR])
    expect(r.decision).toBe("aguardando")
  })
})
