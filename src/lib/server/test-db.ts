/**
 * Banco de teste: Postgres 17 de verdade (PGlite) com um "Supabase mínimo" por baixo e as
 * migrations reais por cima. Só para testes (*.test.ts) — nunca importe no app.
 *
 *   const db = await createTestDb()                     // roda TODAS as migrations, em ordem
 *   await db.as({ email: "ana@x.com" }, () => db.sql("insert …"))   // como usuário logado (RLS vale)
 *
 * Fora do `as`, o código roda como dono do banco (igual ao SQL Editor / service role): RLS não vale.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"

const MIGRATIONS = join(process.cwd(), "supabase", "migrations")

/**
 * Peças que o Supabase já traz prontas e as migrations assumem que existem:
 * papéis, auth.jwt()/auth.uid() (lidos de uma configuração da sessão), storage, publicação de
 * tempo real e o "vault"/cron (só as assinaturas usadas).
 */
const SUPABASE_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
    name text, owner uuid, metadata jsonb, created_at timestamptz default now()
  );
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select string_to_array(name, '/')
  $$;
  grant execute on function storage.foldername(text) to authenticated;

  create publication supabase_realtime;
`

export type TestUser = { email: string; sub?: string }

export interface TestDb {
  pg: PGlite
  sql<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>
  /** Roda `fn` como usuário logado (papel authenticated + JWT com o e-mail): RLS e grants valem. */
  as<T>(user: TestUser, fn: () => Promise<T>): Promise<T>
}

/** Migrations que dependem de recursos que o PGlite não tem (pg_cron, pg_net, vault). */
const NEEDS_EXTENSIONS = new Set(["0012_agendador.sql"])

export async function createTestDb(opts: { upTo?: number } = {}): Promise<TestDb> {
  const pg = new PGlite()
  await pg.exec(SUPABASE_STUB)
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && !NEEDS_EXTENSIONS.has(f))
    .filter((f) => opts.upTo === undefined || Number(f.slice(0, 4)) <= opts.upTo)
    .sort()
  for (const f of files) {
    try {
      await pg.exec(readFileSync(join(MIGRATIONS, f), "utf8"))
    } catch (e) {
      throw new Error(`migration ${f} falhou no banco de teste: ${e instanceof Error ? e.message : e}`)
    }
  }

  const sql = async <T = Record<string, unknown>>(query: string, params: unknown[] = []) => (await pg.query<T>(query, params)).rows

  const as = async <T>(user: TestUser, fn: () => Promise<T>) => {
    const claims = JSON.stringify({ role: "authenticated", email: user.email, sub: user.sub ?? "00000000-0000-0000-0000-000000000001" })
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims])
    await pg.exec(`set role authenticated`)
    try {
      return await fn()
    } finally {
      await pg.exec(`reset role`)
      await pg.query(`select set_config('request.jwt.claims', '', false)`)
    }
  }

  return { pg, sql, as }
}
