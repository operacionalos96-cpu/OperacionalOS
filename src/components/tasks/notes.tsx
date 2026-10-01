"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, FileTextIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import type { Note } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { useStore } from "@/lib/store"
import { plainText } from "@/lib/domain/rich-text"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"

export function Notes({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const notes = useStore((s) => s.notes)
  const createNote = useStore((s) => s.createNote)
  const sorted = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const selected = notes.find((n) => n.id === selectedId)

  function create() {
    onSelect(createNote().id)
  }

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title="Nenhuma nota ainda"
        description="Use para roteiros, pautas de reunião, processos — qualquer coisa que hoje vive no WhatsApp ou num caderno."
        action={
          <Button onClick={create}>
            <PlusIcon /> Criar primeira nota
          </Button>
        }
        className="py-20"
      />
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 gap-4 p-4 sm:p-6">
      {/* Lista (no celular, some quando uma nota está aberta) */}
      <aside className={cn("flex w-full shrink-0 flex-col gap-2 md:w-64", selected && "hidden md:flex")}>
        <Button variant="outline" onClick={create} className="justify-start">
          <PlusIcon /> Nova nota
        </Button>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {sorted.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => onSelect(n.id)}
                className={cn(
                  "w-full rounded-lg px-3 py-2 text-left hover:bg-accent",
                  n.id === selectedId && "bg-accent",
                )}
              >
                <p className={cn("truncate text-sm font-medium", !n.title && "text-muted-foreground")}>{n.title || "Sem título"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {relative(n.updatedAt)} · {plainText(n.body).split("\n")[0] || "vazia"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={cn("min-w-0 flex-1", !selected && "hidden md:block")}>
        {selected ? (
          <NoteEditor key={selected.id} note={selected} onBack={() => onSelect(null)} />
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            Selecione uma nota ou crie uma nova.
          </div>
        )}
      </section>
    </div>
  )
}

/** Título + texto formatado. Salva sozinho enquanto digita. */
function NoteEditor({ note, onBack }: { note: Note; onBack: () => void }) {
  const updateNote = useStore((s) => s.updateNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [status, setStatus] = useState<"salvo" | "salvando">("salvo")
  const pending = useRef<{ title: string; body: string } | null>(null)

  // Autosave com debounce; também salva ao sair da nota.
  useEffect(() => {
    if (title === note.title && body === note.body) return
    pending.current = { title, body }
    setStatus("salvando")
    const t = setTimeout(() => {
      updateNote(note.id, { title, body })
      pending.current = null
      setStatus("salvo")
    }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body])

  useEffect(
    () => () => {
      if (pending.current) useStore.getState().updateNote(note.id, pending.current)
    },
    [note.id],
  )

  function remove() {
    const snapshot = { ...note, title, body }
    deleteNote(note.id)
    onBack()
    toast("Nota excluída", {
      action: {
        label: "Desfazer",
        onClick: () => useStore.getState().restoreNote(snapshot),

      },
    })
  }

  return (
    <article className="flex h-full flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Voltar">
          <ArrowLeftIcon />
        </Button>
        <UserAvatar userId={note.authorId} size="xs" />
        <span>{status === "salvando" ? "Salvando…" : `Salvo · ${relative(note.updatedAt)}`}</span>
        <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={remove} aria-label="Excluir nota">
          <Trash2Icon />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          autoFocus={!note.title}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              ;(document.querySelector(".rich-text") as HTMLElement | null)?.focus()
            }
          }}
          className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/60"
        />
        <RichTextEditor value={body} onChange={setBody} placeholder="Escreva aqui… use a barra acima ou atalhos: Ctrl+B, “- ” lista, “[] ” checklist, “## ” título." className="mt-3" />
      </div>
    </article>
  )
}
