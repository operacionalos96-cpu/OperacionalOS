/**
 * Permissões por cargo NO POSTGRES DE VERDADE (ADR 0005, migration 0019).
 * Roda todas as migrations reais e testa como cada nível de acesso, logado, é tratado pelo banco —
 * o mesmo que acontece quando alguém chama a API do Supabase direto, sem passar pela tela.
 */
import { beforeAll, describe, expect, it } from "vitest"
import { PERMISSIONS, can, type RoleLevel } from "@/lib/domain/org"
import { createTestDb, type TestDb } from "./test-db"

let db: TestDb
const people: Record<RoleLevel | "inativo", string> = {
  owner: "owner@hzk.test",
  admin: "admin@hzk.test",
  operator: "operator@hzk.test",
  viewer: "viewer@hzk.test",
  inativo: "inativo@hzk.test",
}

/** Tenta um comando como a pessoa; devolve "ok" ou "negado" (RLS/grant), e o erro se for outro. */
async function attempt(who: keyof typeof people, query: string) {
  try {
    await db.as({ email: people[who] }, () => db.sql(query))
    return "ok"
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied/i.test(msg)) return "negado"
    throw e
  }
}

const rows = (who: keyof typeof people, query: string) => db.as({ email: people[who] }, () => db.sql(query))

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(`
    insert into public.members (email, team_id, display_name, role_level, active) values
      ('${people.owner}',    'u1', 'Owner',    'owner',    true),
      ('${people.admin}',    'u3', 'Admin',    'admin',    true),
      ('${people.operator}', 'u4', 'Operator', 'operator', true),
      ('${people.viewer}',   'u5', 'Viewer',   'viewer',   true),
      ('${people.inativo}',  'u6', 'Inativo',  'operator', false);
    insert into public.leads (id, data) values ('L1', '{"id":"L1","name":"Lead 1"}');
    insert into public.finance_settings (id, data) values ('default', '{"openingBalanceCents":0}');
  `)
}, 120_000)

describe("dados do negócio (ex.: leads)", () => {
  it("todo membro ativo lê; membro desativado não vê nada", async () => {
    for (const who of ["owner", "admin", "operator", "viewer"] as const) {
      expect(await rows(who, `select id from public.leads`), who).toHaveLength(1)
    }
    expect(await rows("inativo", `select id from public.leads`)).toHaveLength(0)
  })

  it("viewer não cria, não edita e não apaga", async () => {
    expect(await attempt("viewer", `insert into public.leads (id, data) values ('LV', '{"id":"LV"}')`)).toBe("negado")
    await attempt("viewer", `update public.leads set data = '{"id":"L1","name":"hack"}' where id = 'L1'`)
    await attempt("viewer", `delete from public.leads where id = 'L1'`)
    const [lead] = await db.sql<{ name: string }>(`select data->>'name' as name from public.leads where id = 'L1'`)
    expect(lead.name).toBe("Lead 1")
  })

  it("operator cria, edita e apaga", async () => {
    expect(await attempt("operator", `insert into public.leads (id, data) values ('LO', '{"id":"LO","name":"novo"}')`)).toBe("ok")
    await attempt("operator", `update public.leads set data = '{"id":"LO","name":"editado"}' where id = 'LO'`)
    expect((await db.sql<{ name: string }>(`select data->>'name' as name from public.leads where id = 'LO'`))[0].name).toBe("editado")
    await attempt("operator", `delete from public.leads where id = 'LO'`)
    expect(await db.sql(`select 1 from public.leads where id = 'LO'`)).toHaveLength(0)
  })

  it("membro desativado não grava", async () => {
    expect(await attempt("inativo", `insert into public.leads (id, data) values ('LI', '{"id":"LI"}')`)).toBe("negado")
  })
})

describe("configurações (finance_settings)", () => {
  const setBalance = (cents: number) => `update public.finance_settings set data = '{"openingBalanceCents":${cents}}' where id = 'default'`
  const balance = async () => Number((await db.sql<{ v: string }>(`select data->>'openingBalanceCents' as v from public.finance_settings`))[0].v)

  it("operator não altera; admin altera", async () => {
    await attempt("operator", setBalance(111))
    expect(await balance()).toBe(0)
    await attempt("admin", setBalance(222))
    expect(await balance()).toBe(222)
  })
})

describe("histórico de eventos", () => {
  const insertEvent = (id: string) =>
    `insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id) values ('${id}', 'lead.approved', 'lead', 'L1', 'human', 'u')`

  it("viewer não registra evento; operator registra", async () => {
    expect(await attempt("viewer", insertEvent("evt_viewer_0001"))).toBe("negado")
    expect(await attempt("operator", insertEvent("evt_operat_0001"))).toBe("ok")
  })
})

describe("banco e tela usam a mesma matriz", () => {
  it("data.write = operator e settings.write = admin, como na migration 0019", () => {
    expect(PERMISSIONS["data.write"]).toBe("operator")
    expect(PERMISSIONS["settings.write"]).toBe("admin")
    expect(can("viewer", "data.write")).toBe(false)
  })
})

describe("HZK OS — fase 1 (migration 0021)", () => {
  it("áreas: todos leem as 9 áreas semeadas; só gestão muda o dono", async () => {
    expect(await rows("viewer", `select id from public.areas`)).toHaveLength(9)
    const owner = `update public.areas set data = jsonb_set(data, '{owner}', '{"memberId":"u5"}') where id = 'conteudo'`
    await attempt("operator", owner)
    expect((await db.sql<{ o: string }>(`select data->'owner'->>'memberId' as o from public.areas where id = 'conteudo'`))[0].o).toBe("u1")
    expect(await attempt("admin", owner)).toBe("ok")
    expect((await db.sql<{ o: string }>(`select data->'owner'->>'memberId' as o from public.areas where id = 'conteudo'`))[0].o).toBe("u5")
  })

  it("avisos: cada um só vê e marca os seus; quem age cria para os outros", async () => {
    expect(await attempt("operator", `insert into public.notifications (id, user_id, data) values ('n1', 'u5', '{"kind":"decisao"}')`)).toBe("ok")
    expect(await rows("viewer", `select id from public.notifications`)).toHaveLength(1)
    expect(await rows("operator", `select id from public.notifications`)).toHaveLength(0)
    await attempt("operator", `update public.notifications set read_at = now() where id = 'n1'`)
    expect((await db.sql<{ r: string | null }>(`select read_at as r from public.notifications where id = 'n1'`))[0].r).toBeNull()
    expect(await attempt("viewer", `insert into public.notifications (id, user_id, data) values ('n2', 'u4', '{}')`)).toBe("negado")
  })
})

describe("agenda e check-in (migration 0022)", () => {
  const evento = (id: string) => `insert into public.calendar_events (id, data) values ('${id}', '{"id":"${id}","title":"Call","kind":"reuniao","ownerId":"u4","participantIds":[]}')`
  const checkin = (id: string, memberId: string) => `insert into public.daily_plans (id, data) values ('${id}', '{"id":"${id}","memberId":"${memberId}","date":"2026-11-02","checkedInAt":"2026-11-02T09:00:00"}')`

  it("operator agenda; viewer não agenda, mas vê a agenda", async () => {
    expect(await attempt("operator", evento("ev1"))).toBe("ok")
    expect(await attempt("viewer", evento("ev2"))).toBe("negado")
    expect(await rows("viewer", `select id from public.calendar_events`)).toHaveLength(1)
  })

  it("check-in: cada um grava só o próprio (até quem só visualiza); todos veem o do time", async () => {
    expect(await attempt("viewer", checkin("u5:2026-11-02", "u5"))).toBe("ok")
    expect(await attempt("viewer", checkin("u4:2026-11-02", "u4"))).toBe("negado")
    expect(await attempt("viewer", checkin("u4:2026-11-03", "u5"))).toBe("negado")
    expect(await rows("operator", `select id from public.daily_plans`)).toHaveLength(1)
  })
})

describe("configuração do time (migration 0023)", () => {
  const daily = `insert into public.team_settings (id, data) values ('time', '{"id":"time","daily":{"time":"09:30","link":"https://meet.google.com/x"}}')`
  it("admin configura a daily; operator não; todos leem", async () => {
    expect(await attempt("operator", daily)).toBe("negado")
    expect(await attempt("admin", daily)).toBe("ok")
    expect(await rows("viewer", `select id from public.team_settings`)).toHaveLength(1)
  })
})
