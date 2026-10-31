"use client"

import { use, useMemo } from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { ownerOfArea } from "@/lib/domain/areas"
import { decisionsWaitingFor } from "@/lib/domain/items"
import { isTaskFor } from "@/lib/domain/rules"
import { dueLabel } from "@/lib/format"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { openTaskDetail } from "@/lib/ui-store"
import { useAreaList, usePeople } from "@/lib/use-hzk"
import { Button } from "@/components/ui/button"
import { NotFound, PageHeader, Panel } from "@/components/shared/layout"

/**
 * Página da pessoa (HZK OS): áreas dela, tarefas em andamento e decisões esperando por ela. É o que tira a necessidade de ligar para saber o andamento.
 */
export default function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const members = useStore((s) => s.orgMembers)
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const areas = useAreaList()
  const people = usePeople()
  const roles = useMemberRoles((s) => s.items)
  const orgRoles = useOrgRoles((s) => s.items)

  const member = members.find((m) => m.teamId === id)
  const user = getUser(id)
  const myAreas = useMemo(() => areas.filter((a) => ownerOfArea(a, people) === id), [areas, people, id])
  const doing = useMemo(() => tasks.filter((t) => !t.done && isTaskFor(t, id)).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")), [tasks, id])
  const waiting = useMemo(() => decisionsWaitingFor(id, items), [items, id])
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

      </div>
    </div>
  )
}
