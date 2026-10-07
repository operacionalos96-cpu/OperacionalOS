/**
 * Vídeo de análise personalizado NO POSTGRES DE VERDADE (PGlite), migrations 0010 + 0011 + 0013:
 * só gera para quem chegou na parte do funil, uma vez por lead, resultado vira lead.video,
 * falha/cancelamento vira "erro" e um novo pedido sobe a versão.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { beforeAll, describe, expect, it } from "vitest"

let db: PGlite
const sql = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await db.query<T>(q, params)).rows
const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) => (await sql<T>(q, params))[0]
const mig = (f: string) => readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8")

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create function private.is_member() returns boolean language sql as 'select true';
    create function private.stamp() returns trigger language plpgsql as 'begin new.updated_at := now(); return new; end';
    create publication supabase_realtime;
    create table public.leads (id text primary key, data jsonb not null, updated_at timestamptz default now(), updated_by uuid);
  `)
  await db.exec(mig("0010_ai_office.sql"))
  await db.exec(mig("0011_job_queue.sql"))
  await db.exec(mig("0013_video_prospeccao.sql"))
  await db.exec(mig("0013_video_prospeccao.sql")) // rodar de novo não quebra
  await db.exec(mig("0014_video_2.sql"))
  await db.exec(mig("0015_funil_video_editavel.sql"))
  await db.exec(mig("0016_analise_claude.sql"))
}, 60_000)

const clear = () => db.exec(`delete from public.webhook_deliveries; delete from public.events; delete from public.ai_jobs; delete from public.leads; delete from public.ai_settings;`)
const funnel = (step: number, lastSentAt: string, repliedAt?: string) => ({ step, lastSentAt, ...(repliedAt ? { repliedAt } : {}), history: [] })
const addLead = (id: string, extra: Record<string, unknown>) =>
  db.query(`insert into public.leads (id, data) values ($1, $2)`, [id, { id, name: "Odonto Vitta", stage: "contato", website: "https://odontovitta.com.br", ...extra }])
const event = (lead: string, type = "lead.replied") =>
  db.query(`insert into public.events (id, event_type, entity_type, entity_id, actor_type, actor_id, metadata) values (private.ulid('evt'), $1, 'lead', $2, 'human', 'u1', '{}')`, [type, lead])
const videoJobs = () => sql<{ public_id: string; idempotency_key: string; status: string }>(`select public_id, idempotency_key, status from public.ai_jobs where job_type = 'analyze_for_video' order by created_at`)
const video = async (lead: string) => (await one<{ v: Record<string, unknown> | null }>(`select data->'video' as v from public.leads where id = $1`, [lead]))?.v

describe("vídeo de prospecção no Postgres", () => {
  it("não gera para quem só recebeu abertura/gancho; gera quando aceitou o áudio", async () => {
    await clear()
    await addLead("L1", { funnel: funnel(1, "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z") }) // respondeu a abertura
    await addLead("L2", { funnel: funnel(2, "2026-10-03T10:00:00Z") }) // recebeu o gancho, sem resposta
    await addLead("L3", { funnel: funnel(2, "2026-10-03T10:00:00Z", "2026-10-03T10:20:00Z") }) // aceitou o áudio
    for (const l of ["L1", "L2", "L3"]) await event(l)
    const jobs = await videoJobs()
    expect(jobs.map((j) => j.idempotency_key)).toEqual(["analyze_for_video:L3:v1"])
    expect(await video("L3")).toMatchObject({ status: "analisando", analysisJobId: jobs[0].public_id, version: 1 })
    expect(await video("L1")).toBeNull()
  })

  it("mais eventos do mesmo lead não duplicam; áudio enviado também conta", async () => {
    await clear()
    await addLead("L4", { funnel: funnel(3, "2026-10-03T11:00:00Z") })
    await event("L4", "lead.followup_sent")
    await event("L4", "lead.replied")
    expect((await videoJobs()).length).toBe(1)
  })

  it("respeita site, descarte, negócio encerrado e funil sem vídeo", async () => {
    await clear()
    await addLead("S1", { website: null, funnel: funnel(3, "2026-10-03T11:00:00Z") })
    await addLead("S2", { review: { status: "rejected" }, funnel: funnel(3, "2026-10-03T11:00:00Z") })
    await addLead("S3", { stage: "perdido", funnel: funnel(3, "2026-10-03T11:00:00Z") })
    for (const l of ["S1", "S2", "S3"]) await event(l)
    expect((await videoJobs()).length).toBe(0)
    // funil editado sem passo de vídeo → nunca gera
    await db.query(`insert into public.ai_settings (id, data) values ('whatsapp_funnel', $1)`, [{ steps: [{ kind: "texto" }, { kind: "texto" }, { kind: "audio" }] }])
    await addLead("S4", { funnel: funnel(3, "2026-10-03T11:00:00Z") })
    await event("S4")
    expect((await videoJobs()).length).toBe(0)
  })

  it("funil editável de 7 passos: gera quando o lead RECEBE o passo escolhido; vídeo de arquivo não conta", async () => {
    await clear()
    const steps = [{ id: "a", kind: "texto" }, { id: "b", kind: "texto" }, { id: "c", kind: "audio" }, { id: "d", kind: "video", source: "diagnostico" }, { id: "e", kind: "texto" }, { id: "f", kind: "video", source: "visao" }, { id: "g", kind: "video", source: "arquivo" }]
    await db.query(`insert into public.ai_settings (id, data) values ('whatsapp_funnel', $1)`, [{ steps, video: { startStepId: "c", when: "enviado" } }])
    await addLead("E1", { funnel: funnel(2, "2026-10-03T10:00:00Z", "2026-10-03T10:30:00Z") }) // aceitou, mas o áudio ainda não foi
    await addLead("E2", { funnel: funnel(3, "2026-10-03T11:00:00Z") }) // áudio enviado
    await addLead("E3", { funnel: funnel(6, "2026-10-05T11:00:00Z") }) // já passou dos personalizados (só falta a proposta)
    for (const l of ["E1", "E2", "E3"]) await event(l)
    expect((await videoJobs()).map((j) => j.idempotency_key)).toEqual(["analyze_for_video:E2:v1"])
    // só vídeos de arquivo → nunca gera
    await db.query(`update public.ai_settings set data = $1 where id = 'whatsapp_funnel'`, [{ steps: steps.map((s) => (s.kind === "video" ? { ...s, source: "arquivo" } : s)) }])
    await addLead("E4", { funnel: funnel(4, "2026-10-04T11:00:00Z") })
    await event("E4")
    expect((await videoJobs()).length).toBe(1)
  })

  it("worker conclui → lead.video vira 'pronto' com caminho e achados", async () => {
    await clear()
    await addLead("L5", { funnel: funnel(3, "2026-10-03T11:00:00Z") })
    await event("L5", "lead.followup_sent")
    const a = await one<{ public_id: string; lease_id: string }>(`select * from public.claim_next_job('wrk_A', array['reasoning'], 'web-analyst', 600)`)
    const analysis = { points: [1, 2, 3].map((i) => ({ text: `ponto ${i}`, short: `P${i}`, impacto: "por quê" })) }
    await db.query(`select public.complete_job($1, $2, $3)`, [a.public_id, a.lease_id, analysis])
    expect(await video("L5")).toMatchObject({ status: "gerando", analysis })
    const c = await one<{ public_id: string; lease_id: string; payload: { analysis: unknown } }>(`select * from public.claim_next_job('wrk_V', array['video_render'], 'video-studio', 600)`)
    expect(c.payload.analysis).toEqual(analysis)
    expect(c?.public_id).toBeTruthy()
    const result = { video_path: `funil/leads/L5/${c.public_id}/video.mp4`, video2_path: `funil/leads/L5/${c.public_id}/video-2.mp4`, duration_sec: 92, findings: [{ kind: "copyright_antigo", text: "o rodapé ainda mostra © 2019", short: "Rodapé com © 2019" }] }
    await db.query(`select public.complete_job($1, $2, $3)`, [c.public_id, c.lease_id, result])
    expect(await video("L5")).toMatchObject({ status: "pronto", path: result.video_path, path2: result.video2_path, durationSec: 92, jobId: c.public_id, analysis })
  })

  it("lead salvo depois do evento: a mudança do funil já basta (sem corrida)", async () => {
    await clear()
    await addLead("L7", { funnel: funnel(2, "2026-10-03T10:00:00Z") })
    await event("L7") // evento chegou antes: ainda não respondeu → nada
    expect((await videoJobs()).length).toBe(0)
    await db.query(`update public.leads set data = jsonb_set(data, '{funnel,repliedAt}', '"2026-10-03T10:30:00Z"') where id = 'L7'`)
    expect((await videoJobs()).length).toBe(1)
    expect(await video("L7")).toMatchObject({ status: "analisando" })
  })

  it("o navegador não consegue mudar lead.video (cópia antiga não volta o status)", async () => {
    await clear()
    await addLead("L8", { funnel: funnel(3, "2026-10-03T11:00:00Z"), video: { status: "pronto", path: "funil/leads/L8/x/video.mp4" } })
    await db.exec(`grant usage on schema public to authenticated; grant select, update on public.leads to authenticated; grant usage on schema private to authenticated`)
    await db.exec(`set role authenticated`)
    await db.query(`update public.leads set data = data || '{"video": {"status": "gerando"}, "name": "Novo nome"}' where id = 'L8'`)
    await db.query(`update public.leads set data = data - 'video' where id = 'L8'`)
    await db.exec(`reset role`)
    const row = await one<{ name: string; v: Record<string, unknown> }>(`select data->>'name' as name, data->'video' as v from public.leads where id = 'L8'`)
    expect(row.name).toBe("Novo nome")
    expect(row.v).toMatchObject({ status: "pronto", path: "funil/leads/L8/x/video.mp4" })
  })

  it("cancelado/dead letter → 'erro'; novo evento pede de novo com versão 2", async () => {
    await clear()
    await addLead("L6", { funnel: funnel(3, "2026-10-03T11:00:00Z") })
    await event("L6", "lead.followup_sent")
    const [j] = await videoJobs()
    await db.query(`select public.cancel_job($1, 'u1')`, [j.public_id])
    expect(await video("L6")).toMatchObject({ status: "erro" })
    await event("L6")
    const jobs = await videoJobs()
    expect(jobs.map((x) => x.idempotency_key)).toEqual(["analyze_for_video:L6:v1", "analyze_for_video:L6:v2"])
    expect(await video("L6")).toMatchObject({ status: "analisando", version: 2, analysisJobId: jobs[1].public_id })
  })
})
