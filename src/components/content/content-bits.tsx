"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { CONTENT_FORMATS, PLATFORMS, type AccountRole, type ContentAccount, type ContentFormat, type Platform } from "@/lib/domain/content"
import { safeUrl } from "@/lib/domain/products"
import { uid } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useContentAccounts, useContentItems } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Chip, DueDateField, Field, ProductSelect, Segmented, SubmitRow, submitOnModEnter } from "@/components/shared/fields"

/** Selo monocromático da plataforma (a biblioteca de ícones não traz logos de marcas). */
const PLATFORM_CODE: Record<Platform, string> = { youtube: "YT", instagram: "IG", tiktok: "TT", kwai: "KW", facebook: "FB", x: "X", linkedin: "IN", outro: "•" }

export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-4 min-w-5 items-center justify-center rounded-[4px] border border-current/30 px-0.5 text-[9px] leading-none font-bold tracking-tight", className)}
      aria-label={platformLabel(platform)}
    >
      {PLATFORM_CODE[platform]}
    </span>
  )
}

export function platformLabel(p: Platform) {
  return PLATFORMS.find((x) => x.id === p)?.label ?? p
}

export function formatLabel(f: ContentFormat) {
  return CONTENT_FORMATS.find((x) => x.id === f)?.label ?? f
}

export function accountLabel(a: ContentAccount | undefined) {
  if (!a) return "Conta removida"
  return a.handle ? `${a.name} (@${a.handle.replace(/^@/, "")})` : a.name
}

/** Criar/editar conta de plataforma: principal ou de cortes (ligada a uma principal). */
export function AccountFormDialog({ open, account, onClose }: { open: boolean; account: ContentAccount | null; onClose: () => void }) {
  const accounts = useContentAccounts((s) => s.items)
  const save = useContentAccounts((s) => s.save)
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [platform, setPlatform] = useState<Platform>("youtube")
  const [role, setRole] = useState<AccountRole>("principal")
  const [parentId, setParentId] = useState<string | undefined>()
  const [productId, setProductId] = useState<string | undefined>()
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(account?.name ?? "")
    setHandle(account?.handle ?? "")
    setPlatform(account?.platform ?? "youtube")
    setRole(account?.role ?? "principal")
    setParentId(account?.parentId)
    setProductId(account?.productId)
    setUrl(account?.url ?? "")
    setError(null)
  }, [open, account])

  const principals = accounts.filter((a) => a.role === "principal" && a.id !== account?.id)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const cleanUrl = url.trim() ? safeUrl(url) : undefined
    if (cleanUrl === null) {
      setError("Link inválido (use http/https).")
      return
    }
    save({
      id: account?.id ?? uid(),
      createdAt: account?.createdAt ?? new Date().toISOString(),
      active: account?.active ?? true,
      name: name.trim(),
      handle: handle.trim().replace(/^@/, "") || undefined,
      platform,
      role,
      parentId: role === "cortes" ? parentId : undefined,
      productId,
      url: cleanUrl,
    })
    toast.success(account ? "Conta atualizada" : "Conta adicionada")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
          <DialogDescription>Conta principal da marca ou conta de cortes (várias por principal).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Field label="Plataforma">
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <Chip key={p.id} active={platform === p.id} onClick={() => setPlatform(p.id)}>
                  <PlatformIcon platform={p.id} /> {p.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Tipo de conta">
            <Segmented
              value={role}
              onChange={setRole}
              options={[
                { value: "principal", label: "Principal" },
                { value: "cortes", label: "Cortes" },
              ]}
            />
          </Field>
          {role === "cortes" && (
            <Field label="Pertence à conta principal" hint="subdivisão">
              <Select value={parentId ?? "none"} onValueChange={(v) => setParentId(v === "none" ? undefined : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (solta)</SelectItem>
                  {principals.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {platformLabel(p.platform)} · {accountLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome *">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Canal principal" />
            </Field>
            <Field label="@ da conta">
              <Input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@operacional" />
            </Field>
          </div>
          <Field label="Link do perfil" hint="opcional">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
          </Field>
          <Field label="Produto principal" hint="opcional">
            <ProductSelect value={productId} onChange={setProductId} />
          </Field>
          {error && <p className="text-xs text-danger">{error}</p>}
          <SubmitRow onCancel={onClose} submitLabel={account ? "Salvar" : "Adicionar conta"} disabled={!name.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Criar um conteúdo (ideia). O resto (roteiro, arquivos, posts) é na página dele. */
export function NewContentDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const meId = useStore((s) => s.meId)
  const save = useContentItems((s) => s.save)
  const [title, setTitle] = useState("")
  const [format, setFormat] = useState<ContentFormat>("short")
  const [productId, setProductId] = useState<string | undefined>()
  const [dueDate, setDueDate] = useState<string | undefined>()

  useEffect(() => {
    if (!open) return
    setTitle("")
    setFormat("short")
    setProductId(undefined)
    setDueDate(undefined)
  }, [open])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const item = save({
      id: uid(),
      title: title.trim(),
      format,
      stage: "ideia",
      productId,
      ownerId: meId,
      dueDate,
      assets: [],
      posts: [],
      createdAt: new Date().toISOString(),
    })
    onClose()
    onCreated?.(item.id)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo conteúdo</DialogTitle>
          <DialogDescription>Começa como ideia. Roteiro, arquivos e publicações ficam na página dele.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título ou pauta do vídeo" className="h-10 text-base" />
          <Field label="Formato">
            <div className="flex flex-wrap gap-1.5">
              {CONTENT_FORMATS.map((f) => (
                <Chip key={f.id} active={format === f.id} onClick={() => setFormat(f.id)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </Field>
          <Field label="Prazo para publicar" hint="opcional">
            <DueDateField allowEmpty value={dueDate} onChange={setDueDate} />
          </Field>
          <Field label="Produto" hint="opcional · o que este conteúdo divulga">
            <ProductSelect value={productId} onChange={setProductId} />
          </Field>
          <SubmitRow onCancel={onClose} submitLabel="Criar conteúdo" disabled={!title.trim()} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
