"use client"

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SectionTabs } from "@/components/shared/fields"
import { PageHeader } from "@/components/shared/layout"
import { InboxView, useMyInboxCount } from "@/components/hzk/inbox-view"
import { Notes } from "@/components/tasks/notes"
import { TaskList } from "@/components/tasks/task-list"

export default function TasksPage() {
  return (
    <Suspense>
      <TasksAndNotes />
    </Suspense>
  )
}

function TasksAndNotes() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const noteId = params.get("nota")
  const aba = params.get("aba")
  const tab = noteId || aba === "notas" ? "notas" : aba === "entrada" ? "entrada" : "tarefas"
  const inboxCount = useMyInboxCount()

  function go(next: { aba?: string; nota?: string | null }) {
    const q = new URLSearchParams()
    if (next.aba === "notas" || next.nota) q.set("aba", "notas")
    else if (next.aba === "entrada") q.set("aba", "entrada")
    if (next.nota) q.set("nota", next.nota)
    const qs = q.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    // Tarefas e Notas ocupam a altura da janela (rolam por dentro); a Entrada rola com a página.
    <div className={tab === "entrada" ? "flex flex-col" : "flex h-full min-h-0 flex-col"}>
      <PageHeader page="/tarefas">
        <SectionTabs
          value={tab}
          onChange={(v) => go({ aba: v })}
          options={[
            { value: "entrada", label: inboxCount ? `Entrada (${inboxCount})` : "Entrada" },
            { value: "tarefas", label: "Tarefas" },
            { value: "notas", label: "Notas" },
          ]}
        />
      </PageHeader>
      <div className="min-h-0 flex-1">
        {tab === "entrada" ? <InboxView /> : tab === "tarefas" ? <TaskList /> : <Notes selectedId={noteId} onSelect={(id) => go({ aba: "notas", nota: id })} />}
      </div>
    </div>
  )
}
