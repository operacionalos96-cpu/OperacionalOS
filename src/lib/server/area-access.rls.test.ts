/**
 * Acesso por área NO POSTGRES DE VERDADE (ADR 0020, migration 0025).
 * Roda todas as migrations reais e confere, logado como cada pessoa, o que o banco entrega e aceita —
 * o mesmo que acontece quando alguém chama a API do Supabase direto, sem passar pela tela.
 * Os testes rodam em sequência no mesmo banco: cada bloco parte do estado do anterior.
 */
import { beforeAll, describe, expect, it } from "vitest"
import { createTestDb, type TestDb } from "./test-db"

let db: TestDb
const email = { owner: "owner@hzk.test", admin: "admin@hzk.test", operator: "operator@hzk.test", viewer: "viewer@hzk.test", inativo: "inativo@hzk.test" }
type Who = keyof typeof email

const as = <T = Record<string, unknown>>(who: Who, query: string) => db.as({ email: email[who] }, () => db.sql<T>(query))

/** "ok", "negado" (RLS, permissão ou trava do banco) — outro erro sobe. */
async function attempt(who: Who, query: string) {
  try {
    await as(who, query)
    return "ok"
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/row-level security|permission denied|Só um owner/i.test(msg)) return "negado"
    throw e
  }
}

const count = async (who: Who, table: string) => (await as(who, `select id from public.${table}`)).length
const restrict = (who: Who, area: string, on: boolean) =>
  attempt(who, `update public.areas set data = jsonb_set(data, '{restricted}', '${on}') where id = '${area}'`)
const grant = (who: Who, member: string, area: string, level: string, by: string, expires = "null") =>
  attempt(who, `insert into public.area_access (member_id, area_id, level, granted_by, expires_at)
                values ('${member}', '${area}', '${level}', '${by}', ${expires})
                on conflict (member_id, area_id) do update set level = excluded.level, expires_at = excluded.expires_at, granted_by = excluded.granted_by`)

beforeAll(async () => {
  db = await createTestDb()
  await db.pg.exec(`
    insert into public.members (email, team_id, display_name, role_level, active) values
      ('${email.owner}',    'u1', 'Owner',    'owner',    true),
      ('${email.admin}',    'u3', 'Admin',    'admin',    true),
      ('${email.operator}', 'u4', 'Operator', 'operator', true),
      ('${email.viewer}',   'u5', 'Viewer',   'viewer',   true),
      ('${email.inativo}',  'u6', 'Inativo',  'operator', false);
    insert into public.transactions (id, data) values ('T1', '{"id":"T1","amountCents":1000}');
    insert into public.leads (id, data) values ('L1', '{"id":"L1","name":"Lead 1"}');
    insert into public.tasks (id, data) values
      ('K1', '{"id":"K1","title":"Pagar fornecedor","areaId":"financeiro","ownerId":"u1"}'),
      ('K2', '{"id":"K2","title":"Conferir nota","areaId":"financeiro","ownerId":"u4"}'),
      ('K3', '{"id":"K3","title":"Sem área","ownerId":"u1"}');
  `)
}, 120_000)

describe("sem área restrita, nada muda (ADR 0005 continua valendo)", () => {
  it("todo membro ativo lê o financeiro e as tarefas", async () => {
    for (const who of ["owner", "admin", "operator", "viewer"] as const) {
      expect(await count(who, "transactions"), who).toBe(1)
      expect(await count(who, "tasks"), who).toBe(3)
    }
    expect(await count("inativo", "transactions")).toBe(0)
  })

  it("operator grava, viewer não", async () => {
    expect(await attempt("operator", `insert into public.leads (id, data) values ('L2', '{"id":"L2"}')`)).toBe("ok")
    expect(await attempt("viewer", `insert into public.leads (id, data) values ('L3', '{"id":"L3"}')`)).toBe("negado")
  })
})

describe("restringir uma área", () => {
  it("admin não restringe; owner restringe e fica no histórico", async () => {
    expect(await restrict("admin", "financeiro", true)).toBe("negado")
    expect(await restrict("owner", "financeiro", true)).toBe("ok")
    const ev = await db.sql(`select actor_id from public.events where event_type = 'area.restricted' and entity_id = 'financeiro'`)
    expect(ev).toEqual([{ actor_id: "u1" }])
  })

  it("admin não destranca a área (a trava vale para quem edita o resto da área)", async () => {
    expect(await restrict("admin", "financeiro", false)).toBe("negado")
    const [a] = await db.sql<{ r: string }>(`select data->>'restricted' as r from public.areas where id = 'financeiro'`)
    expect(a.r).toBe("true")
  })
})

describe("área restrita sem concessão = vitrine", () => {
  it("só o owner recebe os lançamentos; os demais continuam vendo a área", async () => {
    expect(await count("owner", "transactions")).toBe(1)
    for (const who of ["admin", "operator", "viewer"] as const) {
      expect(await count(who, "transactions"), who).toBe(0)
      expect((await as(who, `select id from public.areas where id = 'financeiro'`)).length, who).toBe(1)
    }
  })

  it("ninguém sem concessão grava na área", async () => {
    expect(await attempt("operator", `insert into public.transactions (id, data) values ('T2', '{"id":"T2"}')`)).toBe("negado")
    expect(await attempt("admin", `insert into public.transactions (id, data) values ('T3', '{"id":"T3"}')`)).toBe("negado")
  })

  it("tarefas da área: só quem tem acesso, o responsável e os colaboradores", async () => {
    const ids = async (who: Who) => (await as<{ id: string }>(who, `select id from public.tasks order by id`)).map((r) => r.id)
    expect(await ids("owner")).toEqual(["K1", "K2", "K3"])
    expect(await ids("operator")).toEqual(["K2", "K3"])
    expect(await ids("viewer")).toEqual(["K3"])
  })
})

describe("concessões", () => {
  it("só owner concede na área restrita", async () => {
    expect(await grant("admin", "u4", "financeiro", "ver", "u3")).toBe("negado")
    expect(await grant("owner", "u4", "financeiro", "ver", "u1")).toBe("ok")
  })

  it("ninguém assina a concessão com o nome de outra pessoa", async () => {
    expect(await grant("owner", "u5", "financeiro", "ver", "u3")).toBe("negado")
  })

  it("ver: lê, mas não grava", async () => {
    expect(await count("operator", "transactions")).toBe(1)
    expect(await attempt("operator", `insert into public.transactions (id, data) values ('T4', '{"id":"T4"}')`)).toBe("negado")
  })

  it("operar: grava", async () => {
    expect(await grant("owner", "u4", "financeiro", "operar", "u1")).toBe("ok")
    expect(await attempt("operator", `insert into public.transactions (id, data) values ('T5', '{"id":"T5"}')`)).toBe("ok")
  })

  it("concessão vencida deixa de valer sozinha", async () => {
    expect(await grant("owner", "u5", "financeiro", "ver", "u1", "now() - interval '1 day'")).toBe("ok")
    expect(await count("viewer", "transactions")).toBe(0)
    expect(await grant("owner", "u5", "financeiro", "ver", "u1", "now() + interval '1 day'")).toBe("ok")
    expect(await count("viewer", "transactions")).toBe(2)
  })

  it("cada concessão fica no histórico", async () => {
    const ev = await db.sql<{ event_type: string }>(
      `select event_type from public.events where entity_type = 'area' and event_type like 'access.%' order by created_at, id`,
    )
    expect(ev.map((e) => e.event_type)).toEqual(["access.granted", "access.changed", "access.granted", "access.changed"])
  })
})

describe("construtor (gerir numa área)", () => {
  it("concede até operar, só na própria área", async () => {
    expect(await grant("owner", "u3", "financeiro", "gerir", "u1")).toBe("ok")
    expect(await grant("admin", "u5", "financeiro", "operar", "u3")).toBe("ok")
    expect(await grant("admin", "u5", "financeiro", "aprovar", "u3")).toBe("negado")
    expect(await grant("admin", "u5", "comercial", "ver", "u3")).toBe("negado")
  })

  it("não destranca a área mesmo gerindo", async () => {
    expect(await restrict("admin", "financeiro", false)).toBe("negado")
  })
})

describe("liberar a área", () => {
  it("owner libera e tudo volta ao padrão", async () => {
    expect(await restrict("owner", "financeiro", false)).toBe("ok")
    await db.sql(`delete from public.area_access`)
    expect(await count("viewer", "transactions")).toBe(2) // T1 e T5: as outras gravações foram negadas
    expect(await count("viewer", "tasks")).toBe(3)
  })
})
