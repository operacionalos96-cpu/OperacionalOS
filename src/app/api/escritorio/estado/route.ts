import { NextResponse } from "next/server"
import { ACTIVE_JOB_STATUSES, deriveOfficeState, officeStateInput, type OfficeRows } from "@/lib/domain/office"
import { requireMember } from "@/lib/server/auth"
import { supabaseServer } from "@/lib/supabase/server"

/**
 * Estados do escritório pessoal em JSON (`office-state/v1`, docs/ESCRITORIO-PESSOAL.md §1.3).
 * Usa a sessão de quem chamou: a RLS (migration 0026) só devolve o escritório do próprio dono,
 * então não há como pedir o de outra pessoa. Não leva texto de conversa, só ids, nomes e estados.
 * É o que a Sede 3D vai ler no modo gêmeo digital (Etapa 7).
 */
const noStore = { "Cache-Control": "no-store" }

export async function GET() {
  const member = await requireMember()
  if (!member) return NextResponse.json({ erro: "não autorizado" }, { status: 401, headers: noStore })
  const db = await supabaseServer()

  const [office, agents, jobs, threads, workers, connections] = await Promise.all([
    db.from("office").select("consent_at").eq("owner_team_id", member.teamId).maybeSingle(),
    db.from("office_agents").select("id, parent_agent_id, name, title, paused, connection_id, backup_models, can_create_agents").eq("owner_team_id", member.teamId).order("created_at"),
    db
      .from("ai_jobs")
      .select("id, public_id, agent_id, entity_id, status, claimed_at, started_at, parent_job_id, created_at")
      .eq("owner_team_id", member.teamId)
      .in("status", [...ACTIVE_JOB_STATUSES])
      .limit(500),
    db.from("office_threads").select("id, kind").eq("owner_team_id", member.teamId).eq("archived", false),
    db.from("workers").select("last_seen_at, enabled").eq("owner_team_id", member.teamId),
    db.from("office_connections").select("id, provider, kind, status, quota_resets_at").eq("owner_team_id", member.teamId),
  ])
  const failed = [office, agents, jobs, threads, workers, connections].find((r) => r.error)
  if (failed?.error) {
    console.error("[escritorio/estado]", failed.error.message)
    return NextResponse.json({ erro: "falhou ao ler o escritório" }, { status: 500, headers: noStore })
  }

  // quem delegou: os jobs-pai podem já ter terminado, então busca os que faltam
  const jobRows = (jobs.data ?? []) as OfficeRows["jobs"]
  const known = new Set(jobRows.map((j) => j.id))
  const missing = [...new Set(jobRows.map((j) => j.parent_job_id).filter((id): id is string => !!id && !known.has(id)))]
  if (missing.length) {
    const parents = await db.from("ai_jobs").select("id, public_id, agent_id, entity_id, status, claimed_at, started_at, parent_job_id, created_at").in("id", missing)
    if (!parents.error) jobRows.push(...((parents.data ?? []) as OfficeRows["jobs"]))
  }

  const rows: OfficeRows = {
    office: office.data,
    agents: (agents.data ?? []) as OfficeRows["agents"],
    jobs: jobRows,
    threads: (threads.data ?? []) as OfficeRows["threads"],
    workers: (workers.data ?? []) as OfficeRows["workers"],
    connections: (connections.data ?? []) as NonNullable<OfficeRows["connections"]>,
  }
  return NextResponse.json(deriveOfficeState(officeStateInput(rows), new Date()), { headers: noStore })
}
