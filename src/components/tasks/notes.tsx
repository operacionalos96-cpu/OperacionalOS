"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeftIcon, FileTextIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import type { Note } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { useStore } from "@/lib/store"
import { noteTaskIds, projectKey, uniqueProjects } from "@/lib/domain/project-names"
import { plainText } from "@/lib/domain/rich-text"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Input } from "@/components/ui/input"

export function Notes({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const notes = useStore((s) => s.notes)
  const tasks = useStore((s) => s.tasks)
  const createNote = useStore((s) => s.createNote)
  const [query, setQuery] = useState("")
  const [projectFilter, setProjectFilter] = useState("todos")
  const projects = useMemo(() => uniqueProjects([...notes.map((n) => n.projectName), ...tasks.map((t) => t.projectName)]), [notes, tasks])
  const sorted = useMemo(() => notes.filter((n) => {
    const q = query.trim().toLocaleLowerCase("pt-BR")
    const linked = tasks.filter((t) => noteTaskIds(n).includes(t.id))
    const searchable = `${n.title} ${plainText(n.body)} ${n.projectName ?? ""} ${linked.map((t) => t.title).join(" ")}`.toLocaleLowerCase("pt-BR")
    const pk = projectKey(projectFilter)
    return (!q || searchable.includes(q)) && (projectFilter === "todos" || projectKey(n.projectName) === pk || linked.some((t) => projectKey(t.projectName) === pk))
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [notes, tasks, query, projectFilter])
  const selected = notes.find((n) => n.id === selectedId)

  function create() {
    onSelect(createNote().id)
  }

  if (notes.length === 0) {
    return <EmptyState icon={FileTextIcon} title="Nenhuma nota ainda" description="Registre reuniões, decisões e contexto operacional. Depois, vincule a nota a uma tarefa e a um projeto." action={<Button onClick={create}><PlusIcon /> Criar primeira nota</Button>} className="py-20" />
  }

  return (
    <div className="flex h-full w-full min-h-0 gap-3 p-3 sm:gap-4 sm:p-5">
      <aside className={cn("flex w-full shrink-0 flex-col gap-2 md:w-72 xl:w-80", selected && "hidden md:flex")}>
        <Button variant="outline" onClick={create} className="justify-start"><PlusIcon /> Nova nota</Button>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar título, texto ou vínculo" className="h-9 pl-8 text-sm" />
        </div>
        <select aria-label="Filtrar notas por projeto" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm">
          <option value="todos">Todos os projetos</option>
          {projects.map((project) => <option key={project} value={project}>{project}</option>)}
        </select>
        <p className="px-1 text-xs text-muted-foreground">{sorted.length} {sorted.length === 1 ? "nota" : "notas"}</p>
        <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {sorted.map((n) => {
            const linked = tasks.filter((t) => noteTaskIds(n).includes(t.id))
            const task = linked[0]
            return <li key={n.id}>
              <button onClick={() => onSelect(n.id)} className={cn("w-full rounded-lg border border-transparent px-3 py-3 text-left transition-colors hover:bg-accent", n.id === selectedId && "border-border bg-accent")}>
                <p className={cn("line-clamp-2 text-sm leading-snug font-semibold", !n.title && "text-muted-foreground")}>{n.title || "Sem título"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{plainText(n.body).split("\n")[0] || "Sem conteúdo ainda"}</p>
                {(n.projectName || task) && <p className="mt-2 truncate text-xs font-medium text-brand">{n.projectName || "Sem projeto"}{task ? ` · ${task.title}${linked.length > 1 ? ` +${linked.length - 1}` : ""}` : ""}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{relative(n.updatedAt)}</p>
              </button>
            </li>
          })}
          {sorted.length === 0 && <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma nota encontrada com esses critérios.</li>}
        </ul>
      </aside>

      <section className={cn("min-w-0 flex-1", !selected && "hidden md:block")}>
        {selected ? <NoteEditor key={selected.id} note={selected} onBack={() => onSelect(null)} /> : <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">Selecione uma nota ou crie uma nova.</div>}
      </section>
    </div>
  )
}

function NoteEditor({ note, onBack }: { note: Note; onBack: () => void }) {
  const updateNote = useStore((s) => s.updateNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const tasks = useStore((s) => s.tasks)
  const allNotes = useStore((s) => s.notes)
  const projects = useMemo(() => uniqueProjects([...tasks.map((t) => t.projectName), ...allNotes.map((n) => n.projectName)]), [tasks, allNotes])
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [taskIds, setTaskIds] = useState<string[]>(noteTaskIds(note))
  const [projectName, setProjectName] = useState(note.projectName ?? "")
  const [status, setStatus] = useState<"salvo" | "salvando">("salvo")
  const pending = useRef<{ title: string; body: string; taskId?: string; taskIds?: string[]; projectName?: string } | null>(null)

  useEffect(() => {
    if (title === note.title && body === note.body && sameIds(taskIds, noteTaskIds(note)) && projectName === (note.projectName ?? "")) return
    const next = { title, body, taskId: undefined, taskIds: taskIds.length ? taskIds : undefined, projectName: projectName.trim() || undefined }
    pending.current = next
    setStatus("salvando")
    const t = setTimeout(() => {
      updateNote(note.id, next)
      pending.current = null
      setStatus("salvo")
    }, 500)
    return () => clearTimeout(t)
  }, [title, body, taskIds, projectName, note, updateNote])

  useEffect(() => () => { if (pending.current) useStore.getState().updateNote(note.id, pending.current) }, [note.id])

  function remove() {
    const snapshot = { ...note, title, body, taskId: undefined, taskIds: taskIds.length ? taskIds : undefined, projectName: projectName.trim() || undefined }
    deleteNote(note.id)
    onBack()
    toast("Nota excluída", { action: { label: "Desfazer", onClick: () => useStore.getState().restoreNote(snapshot) } })
  }

  return <article className="flex h-full min-h-0 flex-col rounded-xl border bg-card">
    <div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground sm:px-5">
      <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Voltar"><ArrowLeftIcon /></Button>
      <UserAvatar userId={note.authorId} size="xs" />
      <span aria-live="polite">{status === "salvando" ? "Salvando alterações…" : `Salvo · ${relative(note.updatedAt)}`}</span>
      <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={remove} aria-label="Excluir nota"><Trash2Icon /></Button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7 xl:px-12">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da nota" autoFocus={!note.title} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (document.querySelector(".rich-text") as HTMLElement | null)?.focus() } }} className="w-full bg-transparent text-3xl leading-tight font-bold tracking-tight outline-none placeholder:text-muted-foreground/60 sm:text-4xl" />
      <div className="mt-5 grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">Projeto
          <input list="note-projects" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Ex.: Lançamento HZK" className="h-9 rounded-md border bg-background px-3 text-sm text-foreground" />
          <datalist id="note-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <div className="grid gap-1 text-xs font-medium text-muted-foreground">Tarefas relacionadas
          <div className="flex flex-wrap gap-1.5">
            {taskIds.map((id) => { const t = tasks.find((x) => x.id === id); return <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs text-foreground">{t?.title ?? "Tarefa removida"}<button type="button" aria-label="Remover vínculo" onClick={() => setTaskIds(taskIds.filter((x) => x !== id))} className="text-muted-foreground hover:text-foreground">×</button></span> })}
          </div>
          <select aria-label="Vincular tarefa" value="" onChange={(e) => { const id = e.target.value; if (!id) return; setTaskIds([...new Set([...taskIds, id])]); const task = tasks.find((t) => t.id === id); if (task?.projectName && !projectName) setProjectName(task.projectName) }} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
            <option value="">Vincular tarefa…</option>
            {tasks.filter((t) => (!t.done && !taskIds.includes(t.id))).sort((a, b) => a.title.localeCompare(b.title, "pt-BR")).map((t) => <option key={t.id} value={t.id}>{t.title}{t.projectName ? ` · ${t.projectName}` : ""}</option>)}
          </select>
        </div>
      </div>
      <RichTextEditor value={body} onChange={setBody} placeholder="Registre decisões, contexto e próximos passos…" className="mt-5 text-base [&_.ProseMirror]:min-h-[50vh]" />
    </div>
  </article>
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x))
}
