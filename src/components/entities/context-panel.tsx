"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { DownloadIcon, ExternalLinkIcon, FileIcon, Loader2Icon, MessageSquareIcon, PaperclipIcon, PlusIcon, SendIcon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { safeUrl } from "@/lib/domain/products"
import { deleteContentFile, signedContentUrl, uploadAttachment, uploadProblem } from "@/lib/content-storage"
import { emptyContext, refKey, type EntityContext, type EntityRef } from "@/lib/entities/types"
import { relative, uid } from "@/lib/format"
import { useEntityContexts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Panel } from "@/components/shared/layout"
import { AvatarDot } from "@/components/shared/user-avatar"

/**
 * Contexto comum de QUALQUER entidade: notas, links, anexos e comentários.
 * Mesmo componente no lead, na tarefa, no produto, no conteúdo e no balão do mapa.
 */
export function ContextPanel({ entity, className, bare = false }: { entity: EntityRef; className?: string; bare?: boolean }) {
  const key = refKey(entity)
  const ctx = useEntityContexts((s) => s.items.find((c) => c.id === key))
  const save = useEntityContexts((s) => s.save)
  const meId = useStore((s) => s.meId)
  const current = ctx ?? emptyContext(entity)

  /** Sempre parte do estado mais novo (evita perder o que outro campo acabou de gravar). */
  const update = (fn: (c: EntityContext) => EntityContext) => {
    const latest = useEntityContexts.getState().items.find((c) => c.id === key) ?? emptyContext(entity)
    save(fn(latest))
  }

  const body = (
    <div className="grid gap-4 p-4">
      <Section icon={FileIcon} title="Notas">
        <NotesField value={current.notes ?? ""} onSave={(notes) => update((c) => ({ ...c, notes: notes || undefined }))} />
      </Section>
      <Section icon={ExternalLinkIcon} title="Links" count={current.links.length}>
        <Links ctx={current} update={update} />
      </Section>
      <Section icon={PaperclipIcon} title="Anexos" count={current.attachments.length}>
        <Attachments entity={entity} ctx={current} update={update} meId={meId} />
      </Section>
      <Section icon={MessageSquareIcon} title="Comentários" count={current.comments.length}>
        <Comments ctx={current} update={update} meId={meId} />
      </Section>
    </div>
  )

  if (bare) return body
  return (
    <Panel className={className} title="Contexto" description="Notas, links, anexos e conversa sobre este item.">
      {body}
    </Panel>
  )
}

function Section({ icon: Icon, title, count, children }: { icon: React.ComponentType<{ className?: string }>; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <p className="t-label flex items-center gap-1.5">
        <Icon className="size-3.5" /> {title}
        {!!count && <span className="tabular rounded bg-muted px-1 text-[10px] font-medium normal-case">{count}</span>}
      </p>
      {children}
    </section>
  )
}

function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dirty.current) setText(value)
  }, [value])
  const flush = (v: string) => {
    if (timer.current) clearTimeout(timer.current)
    dirty.current = false
    if (v !== value) onSave(v.trim())
  }
  return (
    <Textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        dirty.current = true
        if (timer.current) clearTimeout(timer.current)
        const v = e.target.value
        timer.current = setTimeout(() => flush(v), 800)
      }}
      onBlur={() => flush(text)}
      placeholder="Contexto, decisões, referências…"
      className="min-h-20 text-sm"
    />
  )
}

type Updater = (fn: (c: EntityContext) => EntityContext) => void

function Links({ ctx, update }: { ctx: EntityContext; update: Updater }) {
  const [url, setUrl] = useState("")
  function add(e: React.FormEvent) {
    e.preventDefault()
    const clean = safeUrl(url)
    if (!clean) return toast.error("Link inválido (use http/https).")
    update((c) => ({ ...c, links: [...c.links, { id: uid(), label: new URL(clean).hostname.replace(/^www\./, ""), url: clean }] }))
    setUrl("")
  }
  return (
    <div className="grid gap-1.5">
      {ctx.links.map((l) => (
        <div key={l.id} className="group flex items-center gap-2 text-sm">
          <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 truncate hover:underline" title={l.url}>
            {l.label}
          </a>
          <button onClick={() => update((c) => ({ ...c, links: c.links.filter((x) => x.id !== l.id) }))} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100" aria-label="Remover link">
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
      <form onSubmit={add} className="flex gap-1.5">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" className="h-7 text-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={!url.trim()}>
          <PlusIcon />
        </Button>
      </form>
    </div>
  )
}

function Attachments({ entity, ctx, update, meId }: { entity: EntityRef; ctx: EntityContext; update: Updater; meId: string }) {
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    const problem = uploadProblem(file)
    if (problem) return toast.error(problem)
    setBusy(true)
    try {
      const path = await uploadAttachment(entity.type, entity.id, file)
      update((c) => ({ ...c, attachments: [...c.attachments, { id: uid(), name: file.name, storagePath: path, sizeBytes: file.size, uploadedAt: new Date().toISOString(), uploadedBy: meId }] }))
    } catch (e) {
      toast.error(e instanceof Error && e.message.startsWith("Limite") ? e.message : "Não foi possível enviar o arquivo.")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function remove(id: string, path?: string) {
    if (path) {
      if (!window.confirm("Apagar este anexo? Não dá para desfazer.")) return
      await deleteContentFile(path).catch(() => {})
    }
    update((c) => ({ ...c, attachments: c.attachments.filter((a) => a.id !== id) }))
  }

  return (
    <div className="grid gap-1.5">
      {ctx.attachments.map((a) => (
        <div key={a.id} className="group flex items-center gap-2 text-sm">
          <button
            onClick={async () => {
              try {
                if (a.storagePath) window.open(await signedContentUrl(a.storagePath), "_blank", "noopener,noreferrer")
              } catch {
                toast.error("Não foi possível abrir.")
              }
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left hover:underline"
          >
            <DownloadIcon className="size-3.5 shrink-0 text-muted-foreground" /> {a.name}
          </button>
          <span className="shrink-0 text-[11px] text-muted-foreground">{a.sizeBytes ? `${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}</span>
          <button onClick={() => remove(a.id, a.storagePath)} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100" aria-label="Remover anexo">
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
      <input ref={fileRef} type="file" className="hidden" accept="video/*,audio/*,image/*,application/pdf,text/plain" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button size="sm" variant="outline" className="w-fit" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />} {busy ? "Enviando…" : "Anexar arquivo"}
      </Button>
    </div>
  )
}

function Comments({ ctx, update, meId }: { ctx: EntityContext; update: Updater; meId: string }) {
  const [text, setText] = useState("")
  function send(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    update((c) => ({ ...c, comments: [...c.comments, { id: uid(), authorId: meId, text: text.trim(), createdAt: new Date().toISOString() }] }))
    setText("")
  }
  return (
    <div className="grid gap-2">
      {ctx.comments.map((c) => (
        <div key={c.id} className="group flex gap-2">
          <AvatarDot userId={c.authorId} size="xs" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{getUser(c.authorId).name}</span> · {relative(c.createdAt)}
            </p>
            <p className="text-sm whitespace-pre-wrap">{c.text}</p>
          </div>
          {c.authorId === meId && (
            <button onClick={() => update((x) => ({ ...x, comments: x.comments.filter((k) => k.id !== c.id) }))} className="self-start text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100" aria-label="Apagar comentário">
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <form onSubmit={send} className={cn("flex gap-1.5", ctx.comments.length > 0 && "border-t pt-2")}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escrever um comentário…" className="h-8 text-sm" />
        <Button type="submit" size="sm" variant="outline" disabled={!text.trim()} aria-label="Enviar">
          <SendIcon />
        </Button>
      </form>
    </div>
  )
}
