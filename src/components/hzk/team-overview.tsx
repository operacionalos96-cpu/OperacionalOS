"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangleIcon, ArrowRightIcon, CheckCircle2Icon, MessageSquareIcon, ScaleIcon } from "lucide-react"
import { collapseDone, personWork, type DoneEntry, type PersonWork } from "@/lib/domain/team-work"
import { relative } from "@/lib/format"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAreaList, usePeople } from "@/lib/use-hzk"
import { useTeam } from "@/lib/use-team"
import { Segmented } from "@/components/shared/fields"
import { PresenceBadge } from "./presence-badge"

export const DONE_ICON: Record<DoneEntry["kind"], typeof CheckCircle2Icon> = {
  tarefa: CheckCircle2Icon,
  decisao: ScaleIcon,
  lead: MessageSquareIcon,
}
export const DONE_LABEL: Record<DoneEntry["kind"], string> = { tarefa: "Concluiu", decisao: "Decidiu", lead: "Lead" }

/** Hook único: responsabilidades e feitos de uma pessoa, das fontes que já existem. */
export function usePersonWork(memberId: string, days: number): PersonWork {
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const activities = useStore((s) => s.activities)
  const leads = useStore((s) => s.leads)
  const areas = useAreaList()
  const people = usePeople()
  return useMemo(() => personWork(memberId, { tasks, items, activities, areas, people, leads }, new Date(), days), [memberId, tasks, items, activities, areas, people, leads, days])
}

/**
 * Visão do time (tela Equipe): de quem é cada área, o que cada um tem em andamento e o que fez no
 * período. Para a CEO e os founders acompanharem sem precisar ligar para ninguém.
 */
export function TeamOverview() {
  const team = useTeam()
  const [days, setDays] = useState<"7" | "30">("7")
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-desc text-sm">Responsabilidades de cada pessoa e o que foi feito no período.</p>
        <Segmented
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "Últimos 7 dias" },
            { value: "30", label: "Últimos 30 dias" },
          ]}
        />
      </div>
      <TeamLoad />
      <div className="grid gap-4 lg:grid-cols-2">
        {team.map((u) => (
          <PersonCard key={u.id} id={u.id} name={u.name} color={u.color} initials={u.initials} days={Number(days)} />
        ))}
      </div>
    </div>
  )
}

function PersonCard({ id, name, color, initials, days }: { id: string; name: string; color: string; initials: string; days: number }) {
  const w = usePersonWork(id, days)
  const roles = useMemberRoles((s) => s.items)
  const orgRoles = useOrgRoles((s) => s.items)
  const titles = roles.filter((r) => r.memberId === id).map((r) => orgRoles.find((o) => o.id === r.roleId)?.title).filter(Boolean)

  return (
    <section className="flex flex-col rounded-2xl border bg-card shadow-card">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: color }}>
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{name}</p>
          <p className="t-desc truncate text-xs">{titles.length ? titles.join(" · ") : "Membro da equipe"}</p>
          <PresenceBadge memberId={id} className="mt-1" showDetail />
        </div>
        <Link href={`/equipe/${id}`} className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium text-brand hover:bg-brand-soft">
          Ver tudo <ArrowRightIcon className="size-4" />
        </Link>
      </header>

      <div className="grid gap-3 px-4 py-3">
        <div>
          <p className="t-label mb-1.5">Responsável por</p>
          {w.areas.length ? (
            <div className="flex flex-wrap gap-1.5">
              {w.areas.map((a) => (
                <span key={a.id} className="rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium">
                  {a.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="t-desc text-sm">Nenhuma área no nome desta pessoa.</p>
          )}
        </div>

        {/* Números do momento: cada um com rótulo (nunca só cor). */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Count label="Em andamento" value={w.open.length} />
          <Count label="Atrasadas" value={w.overdue.length} tone={w.overdue.length ? "danger" : undefined} />
          <Count label="Decisões esperando" value={w.decisionsWaiting.length} tone={w.decisionsWaiting.length ? "warning" : undefined} />
        </div>

        <div>
          <p className="t-label mb-1.5">
            Feito {days === 7 ? "nos últimos 7 dias" : "nos últimos 30 dias"} · {w.done.length}
          </p>
          {w.done.length ? (
            <ul className="grid gap-1.5">
              <DoneRows entries={w.done} limit={4} />
              {collapseDone(w.done).length > 4 && <li className="t-desc text-xs">e mais na página da pessoa</li>}
            </ul>
          ) : (
            <p className="t-desc text-sm">Nada concluído no período.</p>
          )}
        </div>
      </div>
    </section>
  )
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  return (
    <div className={tone === "danger" ? "rounded-xl bg-danger-soft p-2" : tone === "warning" ? "rounded-xl bg-warning-soft p-2" : "rounded-xl bg-muted p-2"}>
      <p className={`tabular text-xl font-semibold ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>
        {tone === "danger" && value > 0 && <AlertTriangleIcon className="mr-1 inline size-4 align-[-2px]" />}
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function DoneLine({ entry }: { entry: DoneEntry }) {
  const Icon = DONE_ICON[entry.kind]
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground">{DONE_LABEL[entry.kind]}:</span> <span className="font-medium">{entry.title}</span>
      </span>
      <span className="t-desc shrink-0 text-xs">{relative(entry.at)}</span>
    </li>
  )
}

/** O histórico com os eventos automáticos repetidos agrupados numa linha ("70 leads · … · ver"). */
export function DoneRows({ entries, limit }: { entries: DoneEntry[]; limit?: number }) {
  const rows = collapseDone(entries).slice(0, limit)
  return (
    <>
      {rows.map((row) =>
        row.count === 1 ? (
          <DoneLine key={`${row.entry.kind}:${row.entry.id}`} entry={row.entry} />
        ) : (
          <li key={`grupo:${row.entry.id}`} className="text-sm">
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-2">
                <MessageSquareIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{row.count} leads</span> <span className="text-muted-foreground">· {"text" in row ? row.text : ""}</span>{" "}
                  <span className="action-link text-xs group-open:hidden">ver</span>
                </span>
                <span className="t-desc shrink-0 text-xs">{relative(row.entry.at)}</span>
              </summary>
              <ul className="mt-1.5 ml-6 grid gap-1">{"items" in row && row.items.map((e) => <DoneLine key={e.id} entry={e} />)}</ul>
            </details>
          </li>
        ),
      )}
    </>
  )
}

/** A carga está equilibrada? Barras por pessoa (em andamento + atrasadas), na cor do avatar. */
function TeamLoad() {
  const team = useTeam()
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const activities = useStore((s) => s.activities)
  const areas = useAreaList()
  const people = usePeople()
  const rows = useMemo(
    () => team.map((u) => ({ u, w: personWork(u.id, { tasks, items, activities, areas, people }, new Date(), 1) })),
    [team, tasks, items, activities, areas, people],
  )
  const max = Math.max(1, ...rows.map((r) => r.w.open.length))
  return (
    <section className="grid gap-2 rounded-2xl border bg-card p-4" aria-label="Carga do time">
      <p className="t-label">Carga do time</p>
      {rows.map(({ u, w }) => (
        <div key={u.id} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{u.name}</span>
          <span className="flex h-3 overflow-hidden rounded-full bg-muted" title={`${w.open.length - w.overdue.length} em dia · ${w.overdue.length} atrasadas`}>
            <span className="grow-x h-full" style={{ width: `${((w.open.length - w.overdue.length) / max) * 100}%`, background: u.color }} />
            <span className="grow-x h-full opacity-60" style={{ width: `${(w.overdue.length / max) * 100}%`, background: `repeating-linear-gradient(45deg, ${u.color}, ${u.color} 3px, transparent 3px, transparent 6px)` }} />
          </span>
          <span className="tabular text-xs text-muted-foreground">
            {w.open.length} · <span className={w.overdue.length ? "text-danger" : undefined}>{w.overdue.length} atrasadas</span>
          </span>
        </div>
      ))}
    </section>
  )
}
