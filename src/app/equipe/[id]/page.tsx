"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { dueLabel } from "@/lib/format"
import { eventsOfDay } from "@/lib/domain/calendar"
import { planId } from "@/lib/domain/presence"
import { useCalendarEvents, useDailyPlans, useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { openTaskDetail } from "@/lib/ui-store"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { DoneLine, usePersonWork } from "@/components/hzk/team-overview"
import { PresenceBadge } from "@/components/hzk/presence-badge"
import { EventRow } from "@/components/hzk/team-agenda"
import { NotFound, PageHeader, Panel } from "@/components/shared/layout"

/**
 * Página da pessoa (HZK OS): áreas dela, decisões esperando, tarefas em andamento e tudo o que ela
 * fez no período. Mesma regra da tela Equipe (usePersonWork): os números nunca divergem.
 */
export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const members = useStore((s) => s.orgMembers)
  const [days, setDays] = useState<"7" | "30">("7")
  const w = usePersonWork(id, Number(days))
  const roles = useMemberRoles((s) => s.items)
  const orgRoles = useOrgRoles((s) => s.items)

  const member = members.find((m) => m.teamId === id)
  const user = getUser(id)
  const { areas: myAreas, open: doing, decisionsWaiting: waiting, done } = w
  const now = useMinute()
  const events = useCalendarEvents((s) => s.items)
  const todayEvents = useMemo(() => eventsOfDay(id, events, now), [id, events, now])
  const todayPlan = useDailyPlans((s) => s.items.find((p) => p.id === planId(id, now)))
  const titles = roles.filter((r) => r.memberId === id).map((r) => orgRoles.find((o) => o.id === r.roleId)?.title).filter(Boolean)

  if (members.length > 0 && !member) return <NotFound title="Pessoa não encontrada" backHref="/equipe" backLabel="Voltar à equipe" />

  return (
    <div className="flex flex-col">
      <PageHeader
        title={user.name}
        description={titles.length ? titles.join(" · ") : "Membro da equipe"}
        actions={
          <Button asChild variant="outline">
            <Link href="/equipe">
              <ArrowLeftIcon /> Equipe
            </Link>
          </Button>
        }
      />
      <div className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card">
          <PresenceBadge memberId={id} showDetail className="text-sm" />
          {todayPlan?.focus && <span className="t-desc text-sm">· Foco de hoje: {todayPlan.focus}</span>}
        </div>

        <Panel title="Agenda de hoje">
          {todayEvents.length ? (
            <ul className="grid gap-2 p-4">
              {todayEvents.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          ) : (
            <p className="t-desc p-4 text-sm">Nada na agenda hoje.</p>
          )}
        </Panel>

        <Panel title="Áreas que é dono" description="Tarefas dessas áreas vão para esta pessoa.">
          {myAreas.length ? (
            <ul className="flex flex-wrap gap-2 p-4">
              {myAreas.map((a) => (
                <li key={a.id} className="rounded-full border bg-card px-3 py-1 text-sm font-medium">
                  {a.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-desc p-4 text-sm">Nenhuma área no nome desta pessoa.</p>
          )}
        </Panel>

        <Panel title={`Decisões esperando (${waiting.length})`}>
          {waiting.length ? (
            <ul className="divide-y">
              {waiting.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">{d.title}</span>
                  <Link href="/decisoes" className="text-brand">
                    Abrir
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-desc p-4 text-sm">Nada esperando decisão desta pessoa.</p>
          )}
        </Panel>

        <Panel title={`Tarefas em andamento (${doing.length})`}>
          {doing.length ? (
            <ul className="divide-y">
              {doing.slice(0, 30).map((t) => (
                <li key={t.id}>
                  <button onClick={() => openTaskDetail(t.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent">
                    <span className="font-medium">{t.title}</span>
                    {t.dueDate && <span className="t-desc shrink-0 text-xs">{dueLabel(t.dueDate)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-desc p-4 text-sm">Nenhuma tarefa aberta.</p>
          )}
        </Panel>

        <Panel
          title={`Feito (${done.length})`}
          description="Tarefas concluídas, decisões tomadas e contatos com leads."
          aside={
            <Segmented
              size="sm"
              value={days}
              onChange={setDays}
              options={[
                { value: "7", label: "7 dias" },
                { value: "30", label: "30 dias" },
              ]}
            />
          }
        >
          {done.length ? (
            <ul className="grid gap-2 p-4">
              {done.map((d) => (
                <DoneLine key={`${d.kind}:${d.id}`} entry={d} />
              ))}
            </ul>
          ) : (
            <p className="t-desc p-4 text-sm">Nada concluído no período.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
