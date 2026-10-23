"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { AppWindowIcon, ExternalLinkIcon, EyeIcon, MessageSquareIcon, PlusIcon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { correctText } from "@/lib/domain/autocorrect"
import { KNOWN_APPS, NOTE_KINDS, addNote, makeNote, noteKind, removeNote } from "@/lib/domain/node-notes"
import type { NodeNote } from "@/lib/domain/types"
import { relative, uid } from "@/lib/format"
import { useStore } from "@/lib/store"
import { autocorrected, spellProps } from "@/lib/use-autocorrect"
import { cn } from "@/lib/utils"

/** Ícone de cada tipo. Tipo novo sem ícone aqui usa o de comentário. */
const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  comentario: MessageSquareIcon,
  observacao: EyeIcon,
  citacao: AppWindowIcon,
}

/** Distância entre o balão principal e o primeiro balão de anotação; recuo do galho. */
const GAP = 28
const INDENT = 22

/**
 * Anotações como BALÕES RAMIFICADOS saindo do balão principal (comentário,
 * observação, citação de app/plataforma). Só aparecem com o balão principal
 * selecionado; fora disso, o mapa fica limpo (o balão mostra só o contador).
 * Ficam dentro do próprio balão: não são balões do mapa, não contam, não vão para a IA.
 */
export function NoteBranches({ notes, adding, onChange, onDoneAdding }: { notes?: NodeNote[]; adding: boolean; onChange: (notes: NodeNote[] | undefined) => void; onDoneAdding: () => void }) {
  const list = notes ?? []
  const [formOpen, setFormOpen] = useState(adding || !list.length)
  const boxRef = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState<number[]>([])

  // Galho: desce do meio de baixo do balão principal e se ramifica até o meio de cada anotação.
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    setEnds(([...box.children] as HTMLElement[]).map((k) => k.offsetTop + k.offsetHeight / 2))
  }, [list.length, formOpen, notes])
  const last = ends.length ? ends[ends.length - 1] : 0

  function remove(n: NodeNote) {
    const before = notes
    onChange(removeNote(notes, n.id))
    toast("Anotação apagada", { action: { label: "Desfazer", onClick: () => onChange(before) } })
  }

  return (
    <div
      className="nodrag nopan absolute top-full left-1/2 cursor-default"
      style={{ marginTop: GAP, paddingLeft: INDENT }}
      onKeyDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <svg className="pointer-events-none absolute left-0 overflow-visible" style={{ top: 0, width: INDENT, height: 1 }} aria-hidden>
        {ends.length > 0 && (
          <path
            d={[`M 0,${-GAP} L 0,${last - 8}`, ...ends.map((y) => (y === last ? `M 0,${y - 8} Q 0,${y} 8,${y} L ${INDENT},${y}` : `M 0,${y} L ${INDENT},${y}`))].join(" ")}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />
        )}
      </svg>
      <div ref={boxRef} className="flex w-max flex-col items-start gap-2">
        {list.map((n) => (
          <NoteBubble key={n.id} note={n} onRemove={() => remove(n)} />
        ))}
        {formOpen ? (
          <NewNoteBubble
            onAdd={(note) => {
              onChange(addNote(notes, note))
              setFormOpen(false)
              onDoneAdding()
            }}
            onCancel={() => {
              setFormOpen(false)
              onDoneAdding()
            }}
            canCancel={list.length > 0}
          />
        ) : (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex size-8 items-center justify-center rounded-full border border-dashed bg-card text-muted-foreground shadow-xs transition-colors hover:border-brand hover:text-brand"
            title="Nova anotação: comentário, observação ou citação de app"
            aria-label="Nova anotação"
          >
            <PlusIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}

/** Um balão de anotação. Clique mostra o texto inteiro, autor e quando. */
function NoteBubble({ note, onRemove }: { note: NodeNote; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const k = noteKind(note.kind)
  const Icon = KIND_ICON[k.id] ?? MessageSquareIcon
  return (
    <div
      onClick={() => setOpen(!open)}
      className={cn(
        "group/note relative w-48 cursor-pointer rounded-lg border bg-card px-2.5 py-2 text-left shadow-xs transition-shadow hover:shadow-md",
        k.cites && "border-brand/40",
      )}
    >
      <p className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3" /> {k.label}
        {note.app && <span className="ml-auto truncate rounded bg-brand/10 px-1 normal-case tracking-normal text-brand">{note.app}</span>}
      </p>
      {note.text && <p className={cn("mt-1 text-xs leading-snug break-words whitespace-pre-wrap", !open && "line-clamp-3")}>{note.text}</p>}
      {open && (
        <>
          {note.url && (
            <a
              href={note.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 flex items-center gap-1 truncate text-xs text-brand hover:underline"
            >
              <ExternalLinkIcon className="size-3 shrink-0" /> {note.url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {getUser(note.authorId).name} · {relative(note.createdAt)}
          </p>
        </>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="absolute -top-2 -right-2 hidden size-5 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-xs group-hover/note:flex hover:text-danger"
        aria-label="Apagar anotação"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  )
}

/** Balão em branco para escrever uma anotação nova. Enter adiciona · Esc cancela. */
function NewNoteBubble({ onAdd, onCancel, canCancel }: { onAdd: (n: NodeNote) => void; onCancel: () => void; canCancel: boolean }) {
  const meId = useStore((s) => s.meId)
  const [kind, setKind] = useState(NOTE_KINDS[0].id)
  const [text, setText] = useState("")
  const [app, setApp] = useState("")
  const [url, setUrl] = useState("")
  const k = noteKind(kind)

  function add() {
    const note = makeNote({ kind, text: correctText(text), app, url }, meId, uid())
    if (note) onAdd(note)
  }

  const input = "h-6 w-full min-w-0 rounded-md border bg-background px-1.5 text-xs outline-none focus:border-brand"
  return (
    <div className="grid w-60 gap-1.5 rounded-lg border border-dashed border-brand/60 bg-card p-2 shadow-md">
      <div className="flex gap-1" role="radiogroup" aria-label="Tipo de anotação">
        {NOTE_KINDS.map((x) => {
          const Icon = KIND_ICON[x.id] ?? MessageSquareIcon
          return (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={kind === x.id}
              onClick={() => setKind(x.id)}
              title={x.hint}
              className={cn(
                "inline-flex h-5 items-center gap-0.5 rounded px-1 text-xs font-medium transition-colors",
                kind === x.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3" /> {x.label}
            </button>
          )
        })}
      </div>
      {k.cites && (
        <div className="flex gap-1">
          <input value={app} onChange={(e) => setApp(e.target.value)} list="operacional-apps" placeholder="App/plataforma" className={input} aria-label="App ou plataforma citada" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="Link (opcional)" className={input} aria-label="Link" />
          <datalist id="operacional-apps">
            {KNOWN_APPS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      )}
      <textarea
        autoFocus
        value={text}
        rows={2}
        {...spellProps}
        onChange={(e) => setText(autocorrected(text, e.currentTarget))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            add()
          }
          if (e.key === "Escape" && canCancel) onCancel()
        }}
        placeholder={k.placeholder}
        className="field-sizing-content max-h-28 min-h-10 resize-none rounded-md border bg-background px-1.5 py-1 text-xs outline-none focus:border-brand"
      />
      <div className="flex items-center gap-1">
        <span className="flex-1 text-xs text-muted-foreground">Enter adiciona · Shift+Enter quebra linha</span>
        {canCancel && (
          <button type="button" onClick={onCancel} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={add}
          disabled={!text.trim() && !(k.cites && app.trim())}
          className="rounded bg-foreground px-2 py-0.5 text-xs font-medium text-background disabled:opacity-40"
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}
