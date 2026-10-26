"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeftIcon,
  CheckIcon,
  ClapperboardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileVideoIcon,
  LinkIcon,
  Loader2Icon,
  PlusIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import {
  ASSET_KINDS,
  CONTENT_FORMATS,
  CONTENT_STAGES,
  EMPTY_METRICS,
  engagementRate,
  sumMetrics,
  type AssetKind,
  type ContentAsset,
  type ContentItem,
  type ContentPost,
  type PostMetrics,
} from "@/lib/domain/content"
import { safeUrl } from "@/lib/domain/products"
import { dateTime, shortDate, uid } from "@/lib/format"
import { deleteContentFile, signedContentUrl, uploadContentFile, uploadProblem } from "@/lib/content-storage"
import { useContentAccounts, useContentItems } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { setContentStage } from "@/lib/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Chip, DueDateField, Field, OwnerToggle, ProductSelect } from "@/components/shared/fields"
import { EmptyState, Panel } from "@/components/shared/layout"
import { PlatformIcon, accountLabel } from "@/components/content/content-bits"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { ContextPanel } from "@/components/entities/context-panel"

export default function ContentItemPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const item = useContentItems((s) => s.items.find((i) => i.id === id))
  const accounts = useContentAccounts((s) => s.items)
  const patch = useContentItems((s) => s.patch)
  const remove = useContentItems((s) => s.remove)

  if (!item) {
    return (
      <EmptyState
        className="py-24"
        icon={ClapperboardIcon}
        title="Conteúdo não encontrado"
        description="Ele pode ter sido excluído."
        action={
          <Button variant="outline" onClick={() => router.push("/conteudos")}>
            <ArrowLeftIcon /> Voltar
          </Button>
        }
      />
    )
  }

  const set = (p: Partial<ContentItem>) => patch(item.id, p)

  function destroy() {
    if (item!.assets.some((a) => a.storagePath) && !window.confirm("Excluir o conteúdo e os arquivos enviados? Os arquivos não voltam.")) return
    for (const a of item!.assets) if (a.storagePath) deleteContentFile(a.storagePath).catch(() => {})
    const removed = remove(item!.id)
    router.push("/conteudos")
    if (removed && !removed.assets.some((a) => a.storagePath))
      toast("Conteúdo excluído", { action: { label: "Desfazer", onClick: () => useContentItems.getState().restore(removed) } })
  }

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-6">
        <Link href="/conteudos" className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> Conteúdos
        </Link>
        <div className="flex items-start gap-3">
          <TitleEditor value={item.title} onSave={(title) => set({ title })} />
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={destroy} aria-label="Excluir conteúdo">
            <Trash2Icon />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_STAGES.map((s, i) => {
            const current = CONTENT_STAGES.findIndex((x) => x.id === item.stage)
            return (
              <Chip key={s.id} active={item.stage === s.id} onClick={() => setContentStage(item, s.id)} className={cn(i < current && "text-foreground")}>
                {i < current && <CheckIcon className="size-3 text-success" />}
                {s.label}
              </Chip>
            )
          })}
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ScriptPanel item={item} />
          <AssetsPanel item={item} />
          <PostsPanel item={item} />
        </div>

        <div className="flex h-fit flex-col gap-4">
        <Panel title="Detalhes">
          <div className="grid gap-4 p-4">
            <Field label="Formato">
              <div className="flex flex-wrap gap-1.5">
                {CONTENT_FORMATS.map((f) => (
                  <Chip key={f.id} active={item.format === f.id} onClick={() => set({ format: f.id })}>
                    {f.label}
                  </Chip>
                ))}
              </div>
            </Field>
            <Field label="Frente / marca">
              <Input list="content-item-brands" value={item.brand ?? ""} onChange={(e) => set({ brand: e.target.value.trim() || undefined })} placeholder="HZK, Gabriel ou outra" />
              <datalist id="content-item-brands">{[...new Set(["HZK", "Gabriel", ...accounts.map((a) => a.brand).filter(Boolean)])].map((b) => <option key={b} value={b!} />)}</datalist>
            </Field>
            <Field label="Conta principal">
              <select value={item.accountId ?? "none"} onChange={(e) => { const accountId = e.target.value === "none" ? undefined : e.target.value; const account = accounts.find((a) => a.id === accountId); set({ accountId, ...(account?.brand ? { brand: account.brand } : {}) }) }} className="h-9 w-full rounded-md border bg-card px-2 text-sm">
                <option value="none">Selecionar depois</option>
                {accounts.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.brand ? `${a.brand} · ` : ""}{a.name} · {a.platform}</option>)}
              </select>
            </Field>
            <Field label="Responsável">
              <OwnerToggle value={item.ownerId} onChange={(ownerId) => set({ ownerId })} />
            </Field>
            <Field label="Prazo para publicar">
              <DueDateField allowEmpty value={item.dueDate} onChange={(dueDate) => set({ dueDate })} />
            </Field>
            <Field label="Produto">
              <ProductSelect value={item.productId} onChange={(productId) => set({ productId })} />
            </Field>
            <Field label="Observações">
              <DebouncedTextarea value={item.notes ?? ""} onSave={(notes) => set({ notes: notes || undefined })} placeholder="Referências, CTA, trilha, legenda…" className="min-h-24" />
            </Field>
            <p className="t-desc text-xs">Criado {dateTime(item.createdAt)}</p>
          </div>
        </Panel>
        <ConnectionsPanel entity={{ type: "content", id: item.id }} />
        <ContextPanel entity={{ type: "content", id: item.id }} />
        </div>
      </div>
    </div>
  )
}

function TitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <textarea
      rows={1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() ? text !== value && onSave(text.trim()) : setText(value))}
      className="field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-xl leading-snug font-bold tracking-tight outline-none"
      aria-label="Título do conteúdo"
    />
  )
}

/** Salva sozinho 800 ms depois de parar de digitar (e ao sair do campo). */
function DebouncedTextarea({ value, onSave, ...props }: { value: string; onSave: (v: string) => void } & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange">) {
  const [text, setText] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  useEffect(() => {
    if (!dirty.current) setText(value)
  }, [value])
  function flush(v: string) {
    if (timer.current) clearTimeout(timer.current)
    dirty.current = false
    if (v !== value) onSave(v)
  }
  return (
    <Textarea
      {...props}
      value={text}
      onChange={(e) => {
        const v = e.target.value
        setText(v)
        dirty.current = true
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => flush(v), 800)
      }}
      onBlur={() => flush(text)}
    />
  )
}

function ScriptPanel({ item }: { item: ContentItem }) {
  const patch = useContentItems((s) => s.patch)
  const words = (item.script ?? "").trim().split(/\s+/).filter(Boolean).length
  return (
    <Panel title="Roteiro" description={words ? `${words} palavras · ~${Math.max(1, Math.round(words / 150))} min falado` : "Gancho, desenvolvimento, CTA."}>
      <div className="p-4">
        <DebouncedTextarea
          value={item.script ?? ""}
          onSave={(script) => patch(item.id, { script: script || undefined })}
          placeholder={"GANCHO (0–3s):\n\nDESENVOLVIMENTO:\n\nCTA:"}
          className="min-h-64 font-mono text-sm leading-relaxed"
        />
      </div>
    </Panel>
  )
}

// ---------- Arquivos por etapa ----------

function AssetsPanel({ item }: { item: ContentItem }) {
  return (
    <Panel title="Arquivos" description="Uma versão por etapa. Upload até 50 MB ou link (Drive, Frame.io) para arquivos grandes.">
      <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
        {ASSET_KINDS.map((kind, i) => (
          <AssetSlot key={kind.id} item={item} kind={kind.id} label={kind.label} hint={kind.hint} className={cn("sm:border-b", i % 2 === 0 && "sm:border-r", i >= 2 && "sm:border-b-0")} />
        ))}
      </div>
    </Panel>
  )
}

function AssetSlot({ item, kind, label, hint, className }: { item: ContentItem; kind: AssetKind; label: string; hint: string; className?: string }) {
  const meId = useStore((s) => s.meId)
  const patch = useContentItems((s) => s.patch)
  const assets = item.assets.filter((a) => a.kind === kind)
  const [busy, setBusy] = useState(false)
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const add = (asset: ContentAsset) => {
    const latest = useContentItems.getState().items.find((i) => i.id === item.id)
    if (latest) patch(item.id, { assets: [...latest.assets, asset] })
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    const problem = uploadProblem(file)
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      const path = await uploadContentFile(item.id, kind, file)
      add({ id: uid(), kind, name: file.name, storagePath: path, sizeBytes: file.size, uploadedAt: new Date().toISOString(), uploadedBy: meId })
      toast.success(`${label} enviado`)
    } catch (e) {
      toast.error(e instanceof Error && e.message.startsWith("Limite") ? e.message : "Não foi possível enviar o arquivo. Tente de novo.")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault()
    const clean = safeUrl(link)
    if (!clean) {
      toast.error("Link inválido (use http/https).")
      return
    }
    add({ id: uid(), kind, name: new URL(clean).hostname, url: clean, uploadedAt: new Date().toISOString(), uploadedBy: meId })
    setLink("")
    setLinking(false)
  }

  async function open(asset: ContentAsset) {
    if (asset.url) return window.open(asset.url, "_blank", "noopener,noreferrer")
    if (!asset.storagePath) return
    try {
      window.open(await signedContentUrl(asset.storagePath), "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Não foi possível abrir o arquivo.")
    }
  }

  async function removeAsset(asset: ContentAsset) {
    if (asset.storagePath) {
      if (!window.confirm(`Apagar "${asset.name}" do armazenamento? Não dá para desfazer.`)) return
      try {
        await deleteContentFile(asset.storagePath)
      } catch {
        toast.error("Não foi possível apagar o arquivo.")
        return
      }
    }
    const latest = useContentItems.getState().items.find((i) => i.id === item.id)
    if (latest) patch(item.id, { assets: latest.assets.filter((a) => a.id !== asset.id) })
  }

  return (
    <div className={cn("flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center gap-2">
        <span className={cn("size-2 rounded-full", assets.length ? "bg-success" : "bg-muted-foreground/40")} />
        <p className="text-sm font-semibold">{label}</p>
        <p className="t-desc text-xs">{hint}</p>
      </div>
      {assets.map((a) => (
        <div key={a.id} className="group flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1.5">
          {a.url ? <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" /> : <FileVideoIcon className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{a.name}</span>
            <span className="t-desc block text-[11px]">
              {shortDate(a.uploadedAt)}
              {a.sizeBytes ? ` · ${(a.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
            </span>
          </span>
          <button onClick={() => open(a)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Abrir">
            {a.url ? <ExternalLinkIcon className="size-3.5" /> : <DownloadIcon className="size-3.5" />}
          </button>
          <button onClick={() => removeAsset(a)} className="rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger focus:opacity-100" aria-label="Remover">
            <XIcon className="size-3.5" />
          </button>
        </div>
      ))}
      {linking ? (
        <form onSubmit={addLink} className="flex gap-1.5">
          <Input autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" className="h-7 text-xs" />
          <Button type="submit" size="sm" variant="outline">
            OK
          </Button>
        </form>
      ) : (
        <div className="flex gap-1.5">
          <input ref={fileRef} type="file" accept="video/*,audio/*,image/*,application/pdf,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} {busy ? "Enviando…" : "Enviar"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLinking(true)}>
            <LinkIcon /> Link
          </Button>
        </div>
      )}
    </div>
  )
}

// ---------- Publicações + métricas ----------

function PostsPanel({ item }: { item: ContentItem }) {
  const accounts = useContentAccounts((s) => s.items)
  const patch = useContentItems((s) => s.patch)
  const [accountId, setAccountId] = useState("")
  useEffect(() => setAccountId(""), [item.id])
  const used = new Set(item.posts.map((p) => p.accountId))
  const available = accounts.filter((a) => a.active && !used.has(a.id))
  const total = sumMetrics(item.posts.map((p) => p.metrics))

  function addPost() {
    if (!accountId) return
    patch(item.id, { posts: [...item.posts, { id: uid(), accountId, status: "planejado", source: "manual" }] })
    setAccountId("")
  }

  function updatePost(id: string, p: Partial<ContentPost>) {
    const latest = useContentItems.getState().items.find((i) => i.id === item.id)
    if (latest) patch(item.id, { posts: latest.posts.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  }

  return (
    <Panel
      title="Publicações"
      description={
        item.posts.some((p) => p.status === "publicado")
          ? `Total: ${total.views.toLocaleString("pt-BR")} views · ${(total.likes + total.comments + total.shares + total.saves).toLocaleString("pt-BR")} interações`
          : "Em quais contas este conteúdo vai (principal e cortes)."
      }
    >
      {item.posts.length > 0 && (
        <ul className="divide-y">
          {item.posts.map((post) => (
            <PostRow key={post.id} post={post} onChange={(p) => updatePost(post.id, p)} onRemove={() => patch(item.id, { posts: item.posts.filter((x) => x.id !== post.id) })} />
          ))}
        </ul>
      )}
      <div className={cn("flex flex-wrap items-center gap-2 p-4", item.posts.length > 0 && "border-t")}>
        {accounts.length === 0 ? (
          <p className="t-desc text-xs">
            Cadastre as contas em{" "}
            <Link href="/conteudos?aba=contas" className="text-foreground underline">
              Conteúdos → Contas
            </Link>{" "}
            para registrar publicações.
          </p>
        ) : (
          <>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border bg-card px-2 text-sm" aria-label="Conta">
              <option value="">Adicionar conta…</option>
              {available.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform.toUpperCase()} · {a.brand ? `${a.brand} · ` : ""}{accountLabel(a)} {a.role === "cortes" ? "(cortes)" : ""}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={addPost} disabled={!accountId}>
              <PlusIcon /> Adicionar
            </Button>
          </>
        )}
      </div>
    </Panel>
  )
}

function PostRow({ post, onChange, onRemove }: { post: ContentPost; onChange: (p: Partial<ContentPost>) => void; onRemove: () => void }) {
  const account = useContentAccounts((s) => s.items.find((a) => a.id === post.accountId))
  const [url, setUrl] = useState(post.url ?? "")
  const m = post.metrics ?? EMPTY_METRICS
  const eng = engagementRate(m)

  function setMetric(key: keyof PostMetrics, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw.replace(/\D/g, "")) || 0))
    onChange({ metrics: { ...m, [key]: n }, metricsAt: new Date().toISOString() })
  }

  return (
    <li className="grid gap-3 p-4">
      <div className="flex items-center gap-2">
        {account && <PlatformIcon platform={account.platform} />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {accountLabel(account)}
          {account?.role === "cortes" && <span className="t-desc font-normal"> · cortes</span>}
        </span>
        <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
          {(["planejado", "publicado"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onChange({ status: s, publishedAt: s === "publicado" ? (post.publishedAt ?? new Date().toISOString()) : post.publishedAt })}
              className={cn("rounded px-2 py-0.5 capitalize transition-colors", post.status === s ? "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted-foreground")}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={onRemove} className="rounded p-1 text-muted-foreground hover:text-danger" aria-label="Remover publicação">
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => {
            if (!url.trim()) return onChange({ url: undefined })
            const clean = safeUrl(url)
            if (clean) onChange({ url: clean })
            else toast.error("Link inválido (use http/https).")
          }}
          placeholder="Link do post"
          className="h-8 text-xs"
          inputMode="url"
        />
        {post.url && (
          <a href={post.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Abrir post">
            <SendIcon className="size-3.5" />
          </a>
        )}
      </div>
      {post.status === "publicado" && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {(
            [
              ["views", "Views"],
              ["likes", "Curtidas"],
              ["comments", "Coment."],
              ["shares", "Compart."],
              ["saves", "Salvos"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="grid gap-1">
              <span className="t-label text-[10px]">{label}</span>
              <Input value={m[key] ? String(m[key]) : ""} onChange={(e) => setMetric(key, e.target.value)} inputMode="numeric" placeholder="0" className="tabular h-8 text-xs" />
            </label>
          ))}
          <div className="grid gap-1">
            <span className="t-label text-[10px]">Engaj.</span>
            <span className="tabular flex h-8 items-center text-sm font-semibold">{eng === null ? "—" : `${(eng * 100).toFixed(1)}%`}</span>
          </div>
        </div>
      )}
      {post.metricsAt && (
        <p className="t-desc text-[11px]">
          Números atualizados {dateTime(post.metricsAt)} · {post.source === "api" ? "automático (API)" : "manual"}
        </p>
      )}
    </li>
  )
}
