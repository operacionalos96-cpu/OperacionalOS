"use client"

import { Suspense } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Segmented } from "@/components/shared/fields"
import { PageHeader } from "@/components/shared/layout"
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
  const tab = noteId || params.get("aba") === "notas" ? "notas" : "tarefas"

  function go(next: { aba?: string; nota?: string | null }) {
    const q = new URLSearchParams()
    if (next.aba === "notas" || next.nota) q.set("aba", "notas")
    if (next.nota) q.set("nota", next.nota)
    const qs = q.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader page="/tarefas">
        <Segmented
          className="w-fit"
          value={tab}
          onChange={(v) => go({ aba: v })}
          options={[
            { value: "tarefas", label: "Tarefas" },
            { value: "notas", label: "Notas" },
          ]}
        />
      </PageHeader>
      <div className="min-h-0 flex-1">
        {tab === "tarefas" ? <TaskList /> : <Notes selectedId={noteId} onSelect={(id) => go({ aba: "notas", nota: id })} />}
      </div>
    </div>
  )
}
