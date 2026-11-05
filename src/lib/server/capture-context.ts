import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { teamFrom } from "@/config/team"
import { uniqueProjects } from "@/lib/domain/project-names"
import type { CaptureContext } from "@/lib/domain/smart-capture"

/**
 * Contexto da captura inteligente lido NO SERVIDOR com a sessão de quem pediu (o RLS decide o que
 * a pessoa enxerga). Só os campos necessários: nomes de projeto, etiquetas, equipe e leads abertos.
 */
const PAGE = 1000
const MAX_ROWS = 10_000

async function selectAll<T>(sb: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await sb.from(table).select(columns).order("id").range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export async function loadCaptureContext(sb: SupabaseClient): Promise<CaptureContext> {
  type ProjectRow = { p: string | null }
  type TaskRow = { p: string | null; l: unknown }
  type LeadRow = { id: string; n: string | null; c: string | null; s: string | null }
  type MemberRow = { team_id: string; display_name: string | null; email: string; active: boolean | null; joined_at?: string | null; created_at?: string | null }

  const [tasks, notes, txs, leads, members] = await Promise.all([
    selectAll<TaskRow>(sb, "tasks", "p:data->>projectName, l:data->labels"),
    selectAll<ProjectRow>(sb, "notes", "p:data->>projectName"),
    selectAll<ProjectRow>(sb, "transactions", "p:data->>projectName"),
    selectAll<LeadRow>(sb, "leads", "id, n:data->>name, c:data->>company, s:data->>stage"),
    // "*" igual à store: nem todo banco tem joined_at (cai para created_at).
    sb.from("members").select("*").then(({ data, error }) => {
      if (error) throw error
      return (data ?? []) as MemberRow[]
    }),
  ])

  const labels = tasks.flatMap((t) => (Array.isArray(t.l) ? t.l.filter((x): x is string => typeof x === "string") : []))
  return {
    projects: uniqueProjects([...tasks, ...notes, ...txs].map((r) => r.p)),
    labels: uniqueProjects(labels),
    members: teamFrom(members.map((m) => ({ teamId: m.team_id, displayName: m.display_name ?? undefined, email: m.email, active: m.active ?? undefined, joinedAt: m.joined_at ?? m.created_at ?? undefined }))).map((u) => ({ id: u.id, name: u.name })),
    // Mesma regra do campo "Vincular a um lead": só leads abertos.
    leads: leads.filter((l) => l.n && l.s !== "ganho" && l.s !== "perdido").map((l) => ({ id: l.id, name: l.n as string, company: l.c ?? undefined })),
  }
}
