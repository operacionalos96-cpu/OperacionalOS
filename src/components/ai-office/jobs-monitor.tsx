"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { toast } from "sonner"
import { RotateCcwIcon, SearchIcon, XIcon } from "lucide-react"
import { JOB_TYPES, describeJobEvent } from "@/lib/domain/jobs"
import { duration } from "@/lib/domain/prospecting"
import { relative } from "@/lib/format"
import { useAgents } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { supabaseBrowser } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { opsAction, useOps, type JobRow } from "./ops-store"

const FILTERS = [
  { id: "all", label: "Todos", match: () => true },
  { id: "queued", label: "Na fila", match: (s: string) => s === "queued" || s === "retry_scheduled" },
  { id: "running", label: "Em execução", match: (s: string) => s === "claimed" || s === "running" },
  { id: "completed", label: "Concluídos", match: (s: string) => s === "completed" },
  { id: "failed", label: "Falharam", match: (s: string) => s === "failed" || s === "cancelled" },
  { id: "dead_letter", label: "Dead letter", match: (s: string) => s === "dead_letter" },
] as const

export const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  claimed: "Assumido",
  running: "Executando",
  completed: "Concluído",
  failed: "Falhou",
  retry_scheduled: "Nova tentativa agendada",
  cancelled: "Cancelado",
  dead_letter: "Dead letter",
}

export function statusTone(s: string) {
  return s === "completed" ? "text-success" : s === "dead_letter" || s === "failed" ? "text-danger" : s === "running" || s === "claimed" ? "text-brand" : "text-muted-foreground"
}

const jobDuration = (j: JobRow) => {
  const start = j.started_at ?? j.claimed_at
  const end = j.completed_at ?? j.failed_at
  return start && end ? duration(new Date(end).getTime() - new Date(start).getTime()) : start ? "em curso" : "—"
}

export function JobsMonitor() {
  const jobs = useOps((s) => s.jobs)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all")
  const [open, setOpen] = useState<JobRow | null>(null)
  const agents = useAgents((s) => s.items)
  const leads = useStore((s) => s.leads)
  const shown = useMemo(() => jobs.filter((j) => FILTERS.find((f) => f.id === filter)!.match(j.status)), [jobs, filter])
  const count = (id: (typeof FILTERS)[number]["id"]) => jobs.filter((j) => FILTERS.find((f) => f.id === id)!.match(j.status)).length
  const entityName = (j: JobRow) => (j.entity_type === "lead" ? leads.find((l) => l.id === j.entity_id)?.name : undefined) ?? j.entity_id ?? "—"

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={cn("rounded-full border px-3 py-1 text-xs", filter === f.id ? "border-brand bg-accent font-medium" : "text-muted-foreground hover:text-foreground", f.id === "dead_letter" && count("dead_letter") > 0 && "border-danger/50 text-danger")}>
            {f.label} <span className="tabular">{count(f.id)}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="t-desc rounded-xl border bg-card p-6 text-center text-sm">Nenhum job aqui. Jobs nascem dos eventos (ex.: lead novo com site → analisar site).</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Agente</th>
                <th className="px-3 py-2 font-medium">Entidade</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Prior.</th>
                <th className="px-3 py-2 text-right font-medium">Tent.</th>
                <th className="px-3 py-2 font-medium">Criado</th>
                <th className="px-3 py-2 font-medium">Duração</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((j) => (
                <tr key={j.public_id} onClick={() => setOpen(j)} className="cursor-pointer border-b last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{j.public_id.slice(0, 12)}…</td>
                  <td className="px-3 py-2">{JOB_TYPES[j.job_type]?.label ?? j.job_type}</td>
                  <td className="px-3 py-2">{agents.find((a) => a.id === j.agent_id)?.name ?? j.agent_id}</td>
                  <td className="max-w-40 truncate px-3 py-2">{entityName(j)}</td>
                  <td className={cn("px-3 py-2 font-medium", statusTone(j.status))}>{STATUS_LABEL[j.status] ?? j.status}</td>
                  <td className="tabular px-3 py-2 text-right">{j.priority}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {j.attempt_count}/{j.max_attempts}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{relative(j.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{jobDuration(j)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <JobDetail job={jobs.find((j) => j.public_id === open.public_id) ?? open} entity={entityName(open)} onClose={() => setOpen(null)} />}
    </div>
  )
}

interface TimelineRow {
  id: string
  event_type: string
  actor_type: string
  actor_id: string
  metadata: Record<string, unknown>
  created_at: string
}

/** Timeline completa do job + ações humanas (tentar de novo, cancelar) + inspeção. */
function JobDetail({ job, entity, onClose }: { job: JobRow; entity: string; onClose: () => void }) {
  const [timeline, setTimeline] = useState<TimelineRow[]>([])
  const [inspect, setInspect] = useState(false)
  useEffect(() => {
    void supabaseBrowser()
      .from("events")
      .select("id, event_type, actor_type, actor_id, metadata, created_at")
      .eq("entity_type", "job")
      .eq("entity_id", job.public_id)
      .order("created_at")
      .then(({ data }) => setTimeline((data as TimelineRow[]) ?? []))
  }, [job.public_id, job.status])

  async function act(action: "jobs.retry" | "jobs.cancel") {
    try {
      await opsAction(action, { id: job.public_id })
      toast.success(action === "jobs.retry" ? "Job de volta à fila" : "Job cancelado")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "falhou")
    }
  }

  const canRetry = ["dead_letter", "failed", "cancelled", "retry_scheduled"].includes(job.status)
  const canCancel = !["completed", "cancelled"].includes(job.status)
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {JOB_TYPES[job.job_type]?.label ?? job.job_type} <span className={cn("text-sm font-medium", statusTone(job.status))}>· {STATUS_LABEL[job.status] ?? job.status}</span>
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          <Field k="ID" v={<code>{job.public_id}</code>} />
          <Field k="Entidade" v={job.entity_type === "lead" && job.entity_id ? <Link href={`/pipeline/${job.entity_id}`} className="underline">{entity}</Link> : entity} />
          <Field k="Tentativas" v={`${job.attempt_count} de ${job.max_attempts}`} />
          <Field k="Worker" v={job.claimed_by ?? "—"} />
          <Field k="Engine" v={job.engine ?? job.preferred_model ?? "—"} />
          <Field k="Correlação" v={<code>{job.correlation_id ?? "—"}</code>} />
          <Field k="1ª falha" v={job.first_failed_at ? relative(job.first_failed_at) : "—"} />
          <Field k="Última falha" v={job.failed_at ? relative(job.failed_at) : "—"} />
          <Field k="Lease até" v={job.lease_expires_at ? format(new Date(job.lease_expires_at), "HH:mm:ss") : "—"} />
        </dl>
        {job.error && <p className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">{job.error}</p>}
        <div className="flex flex-wrap gap-2">
          {canRetry && (
            <Button size="sm" onClick={() => act("jobs.retry")}>
              <RotateCcwIcon /> Tentar novamente
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" onClick={() => act("jobs.cancel")}>
              <XIcon /> Cancelar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setInspect((v) => !v)}>
            <SearchIcon /> {inspect ? "Fechar inspeção" : "Inspecionar"}
          </Button>
        </div>
        {inspect && (
          <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({ payload: job.payload, result: job.result, idempotency_key: job.idempotency_key, causation_id: job.causation_id }, null, 2)}</pre>
        )}
        <div>
          <p className="t-label mb-1">Timeline</p>
          {timeline.length === 0 ? (
            <p className="t-desc text-xs">Sem eventos ainda.</p>
          ) : (
            <ol className="grid gap-1 text-sm">
              {timeline.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className="tabular w-16 shrink-0 text-xs text-muted-foreground">{format(new Date(e.created_at), "HH:mm:ss")}</span>
                  <span className="min-w-0 flex-1">
                    <code className="text-xs text-muted-foreground">{e.event_type}</code> {describeJobEvent(e.event_type, e.metadata)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{e.actor_id}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  )
}
