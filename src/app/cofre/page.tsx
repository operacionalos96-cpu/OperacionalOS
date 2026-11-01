"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { CopyIcon, EyeIcon, EyeOffIcon, KeyRoundIcon, LockIcon, PencilIcon, PlusIcon, RefreshCwIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react"
import { getUser } from "@/config/team"
import { relative } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageHeader } from "@/components/shared/layout"

/**
 * Cofre de senhas. Nada de segredo fica guardado no navegador: a lista traz só nomes,
 * cada segredo é pedido ao servidor na hora (e some da tela em 30 s), e tudo tranca
 * sozinho em 5 min. Criptografia e controle de acesso: src/lib/server/vault.ts.
 */
interface Item {
  id: string
  name: string
  url: string | null
  updated_by: string | null
  updated_at: string
  last_revealed_by: string | null
  last_revealed_at: string | null
}
interface Secret {
  username?: string
  password?: string
  totp?: string
  recoveryKey?: string
  recovery?: string
  notes?: string
}

const FIELDS: { key: keyof Secret; label: string; secret?: boolean; multiline?: boolean }[] = [
  { key: "username", label: "Usuário / e-mail" },
  { key: "password", label: "Senha", secret: true },
  { key: "totp", label: "2FA (chave ou onde está)", secret: true },
  { key: "recoveryKey", label: "Chave de recuperação", secret: true },
  { key: "recovery", label: "Códigos de recuperação", secret: true, multiline: true },
  { key: "notes", label: "Observações", multiline: true },
]

const HIDE_AFTER = 30
const MIN_LENGTH = 10 // igual a MIN_VAULT_PASSWORD no servidor

const without = <T,>(o: Record<string, T>, key: string) => {
  const next = { ...o }
  delete next[key]
  return next
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`/api/cofre${path}`, { ...init, headers: { "content-type": "application/json" }, cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export default function VaultPage() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, Secret>>({})
  const [editing, setEditing] = useState<{ item?: Item; secret?: Secret } | null>(null)
  const [changing, setChanging] = useState(false)
  const hideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const lockLocal = useCallback(() => {
    Object.values(hideTimers.current).forEach(clearTimeout)
    hideTimers.current = {}
    setItems(null)
    setRevealed({})
    setEditing(null)
    setSeconds(0)
  }, [])

  const load = useCallback(async () => {
    const r = await api("")
    if (r.status === 423) return lockLocal()
    if (!r.ok) return setError(r.data.erro ?? "Não foi possível abrir o cofre.")
    setError(null)
    setItems(r.data.itens)
    setSeconds(r.data.segundos)
  }, [lockLocal])

  useEffect(() => {
    load()
  }, [load])

  // Contagem até trancar sozinho.
  useEffect(() => {
    if (!items) return
    const t = setInterval(() => setSeconds((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(t)
  }, [items])
  useEffect(() => {
    if (items && seconds === 0) {
      lockLocal()
      toast("Cofre trancado", { description: "Passaram 5 minutos." })
    }
  }, [seconds, items, lockLocal])

  // Saiu da aba/página: some com o que estava à mostra.
  useEffect(() => {
    const hide = () => document.hidden && setRevealed({})
    document.addEventListener("visibilitychange", hide)
    return () => {
      document.removeEventListener("visibilitychange", hide)
      Object.values(hideTimers.current).forEach(clearTimeout)
    }
  }, [])

  async function lock() {
    await api("/desbloquear", { method: "DELETE" })
    lockLocal()
  }

  async function reveal(id: string) {
    const r = await api(`/${id}`, { method: "POST" })
    if (r.status === 423) return lockLocal()
    if (!r.ok) return toast.error(r.data.erro ?? "Não foi possível mostrar.")
    setRevealed((v) => ({ ...v, [id]: r.data.secret }))
    clearTimeout(hideTimers.current[id])
    hideTimers.current[id] = setTimeout(() => setRevealed((v) => without(v, id)), HIDE_AFTER * 1000)
    load()
    return r.data.secret as Secret
  }

  async function edit(item: Item) {
    const secret = revealed[item.id] ?? (await reveal(item.id))
    if (secret) setEditing({ item, secret })
  }

  async function remove(item: Item) {
    if (!window.confirm(`Apagar "${item.name}" do cofre? Não dá para desfazer.`)) return
    const r = await api(`/${item.id}`, { method: "DELETE" })
    if (!r.ok) return toast.error(r.data.erro ?? "Não foi possível apagar.")
    toast(`"${item.name}" apagado do cofre`)
    load()
  }

  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`

  return (
    <div className="flex flex-col">
      <PageHeader page="/cofre"
        actions={
          items && (
            <div className="flex items-center gap-2">
              <span className="tabular hidden text-xs text-muted-foreground sm:inline">tranca em {mm}</span>
              <Button variant="ghost" onClick={() => setChanging(true)}>
                Trocar senha do cofre
              </Button>
              <Button variant="outline" onClick={lock}>
                <LockIcon /> Trancar
              </Button>
              <Button onClick={() => setEditing({})}>
                <PlusIcon /> Novo
              </Button>
            </div>
          )
        }
      />
      <div className="page-body is-narrow grid gap-4">
        {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {!items && !error && <Unlock onUnlocked={load} />}
        {items && items.length === 0 && (
          <p className="t-desc rounded-xl border bg-card p-6 text-center text-sm">Cofre vazio. Clique em “Novo” para guardar o primeiro acesso.</p>
        )}
        {items && items.length > 0 && (
          <ul className="grid gap-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl border bg-card">
                <div className="flex items-center gap-3 px-4 py-3">
                  <KeyRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                          {it.url.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      )}
                      {it.last_revealed_at && (
                        <span>
                          {it.url ? " · " : ""}visto por {getUser(it.last_revealed_by ?? "").name} {relative(it.last_revealed_at)}
                        </span>
                      )}
                    </p>
                  </div>
                  {revealed[it.id] ? (
                    <Button size="sm" variant="ghost" onClick={() => setRevealed((v) => without(v, it.id))}>
                      <EyeOffIcon /> Esconder
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => reveal(it.id)}>
                      <EyeIcon /> Mostrar
                    </Button>
                  )}
                  <Button size="icon-sm" variant="ghost" onClick={() => edit(it)} aria-label="Editar">
                    <PencilIcon />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => remove(it)} aria-label="Apagar">
                    <Trash2Icon />
                  </Button>
                </div>
                {revealed[it.id] && <Revealed secret={revealed[it.id]} />}
              </li>
            ))}
          </ul>
        )}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-success" />
          Criptografado (AES-256) no servidor com uma chave que não fica no banco. O navegador não consegue ler a tabela; cada senha só aparece ao clicar em
          Mostrar, some em {HIDE_AFTER} s e fica registrado quem viu.
        </p>
      </div>
      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} />}
      {editing && <ItemDialog item={editing.item} secret={editing.secret} onClose={() => setEditing(null)} onSaved={load} onLocked={lockLocal} />}
    </div>
  )
}

/** Abre o cofre com a SENHA DO COFRE. Na primeira vez, cria essa senha (vale para a equipe). */
function Unlock({ onUnlocked }: { onUnlocked: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api("/desbloquear").then((r) => (r.ok ? setConfigured(r.data.configurado) : setError(r.data.erro ?? "Cofre indisponível.")))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (configured === false && password !== confirm) return setError("As duas senhas não são iguais.")
    setBusy(true)
    const body = configured ? { senha: password } : { nova: password }
    const r = await api("/desbloquear", { method: "POST", body: JSON.stringify(body) })
    setPassword("")
    setConfirm("")
    setBusy(false)
    if (!r.ok) return setError(r.data.erro ?? "Não foi possível abrir.")
    setError(null)
    onUnlocked()
  }

  if (configured === null) return error ? <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null
  const creating = !configured
  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-sm gap-3 rounded-xl border bg-card p-6 text-center" autoComplete="off">
      <LockIcon className="mx-auto size-8 text-muted-foreground" />
      <div>
        <p className="font-semibold">{creating ? "Crie a senha do cofre" : "Cofre trancado"}</p>
        <p className="t-desc text-sm">
          {creating
            ? `Use uma senha só para o cofre, com pelo menos ${MIN_LENGTH} caracteres. Ela vale para a equipe e não tem como ser recuperada: guarde-a bem.`
            : "Digite a senha do cofre. Ele fica aberto por 5 minutos."}
        </p>
      </div>
      <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha do cofre" autoFocus />
      {creating && <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repita a senha do cofre" />}
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button type="submit" disabled={!password || busy || (creating && password.length < MIN_LENGTH)}>
        {busy ? "Conferindo…" : creating ? "Criar e abrir" : "Abrir cofre"}
      </Button>
    </form>
  )
}

/** Trocar a senha do cofre (precisa da atual). */
function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) return toast.error("As duas senhas novas não são iguais.")
    setBusy(true)
    const r = await api("/desbloquear", { method: "POST", body: JSON.stringify({ senha: current, nova: next }) })
    setBusy(false)
    if (!r.ok) return toast.error(r.data.erro ?? "Não foi possível trocar.")
    toast.success("Senha do cofre trocada", { description: "Avise o sócio da senha nova." })
    onClose()
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Trocar senha do cofre</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-2" autoComplete="off">
          <Input type="password" autoComplete="new-password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Senha atual do cofre" autoFocus />
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={`Nova senha (mín. ${MIN_LENGTH})`} />
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repita a nova senha" />
          <Button type="submit" disabled={!current || next.length < MIN_LENGTH || busy}>
            {busy ? "Trocando…" : "Trocar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Revealed({ secret }: { secret: Secret }) {
  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value)
    toast(`${label} copiado`, { description: "A área de transferência é limpa em 30 s." })
    setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), HIDE_AFTER * 1000)
  }
  const shown = FIELDS.filter((f) => secret[f.key])
  return (
    <dl className="grid gap-2 border-t px-4 py-3 text-sm">
      {shown.length === 0 && <p className="t-desc text-xs">Nada preenchido.</p>}
      {shown.map((f) => (
        <div key={f.key} className="grid grid-cols-[9rem_1fr_auto] items-start gap-2">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="font-mono text-[13px] break-all whitespace-pre-wrap">{secret[f.key]}</dd>
          <button onClick={() => copy(f.label, secret[f.key]!)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label={`Copiar ${f.label}`}>
            <CopyIcon className="size-3.5" />
          </button>
        </div>
      ))}
    </dl>
  )
}

/** Senha forte (20 caracteres) gerada no próprio navegador. */
function strongPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?-_"
  const bytes = crypto.getRandomValues(new Uint32Array(20))
  return Array.from(bytes, (b) => chars[b % chars.length]).join("")
}

function ItemDialog({ item, secret, onClose, onSaved, onLocked }: { item?: Item; secret?: Secret; onClose: () => void; onSaved: () => void; onLocked: () => void }) {
  const [name, setName] = useState(item?.name ?? "")
  const [url, setUrl] = useState(item?.url ?? "")
  const [s, setS] = useState<Secret>(secret ?? {})
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await api("", { method: "POST", body: JSON.stringify({ id: item?.id, name, url, secret: s }) })
    setBusy(false)
    if (r.status === 423) return onLocked()
    if (!r.ok) return toast.error(r.data.erro ?? "Não foi possível salvar.")
    toast.success(item ? "Atualizado no cofre" : "Guardado no cofre")
    onSaved()
    onClose()
  }

  const field = "grid gap-1 text-xs text-muted-foreground"
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? `Editar ${item.name}` : "Novo acesso"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3" autoComplete="off">
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              Serviço
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Instagram" autoFocus required />
            </label>
            <label className={field}>
              Site (opcional)
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="instagram.com" />
            </label>
          </div>
          {FIELDS.map((f) => (
            <label key={f.key} className={field}>
              <span className="flex items-center justify-between">
                {f.label}
                {f.key === "password" && (
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setShow((v) => !v)} className="hover:text-foreground">
                      {show ? "esconder" : "ver"}
                    </button>
                    <button type="button" onClick={() => setS((v) => ({ ...v, password: strongPassword() }))} className="inline-flex items-center gap-1 hover:text-foreground">
                      <RefreshCwIcon className="size-3" /> gerar forte
                    </button>
                  </span>
                )}
              </span>
              {f.multiline ? (
                <textarea
                  value={s[f.key] ?? ""}
                  onChange={(e) => setS((v) => ({ ...v, [f.key]: e.target.value }))}
                  rows={2}
                  className="rounded-md border bg-background px-2 py-1.5 font-mono text-sm text-foreground outline-none focus:border-brand"
                />
              ) : (
                <Input
                  type={f.secret && !show ? "password" : "text"}
                  autoComplete="new-password"
                  value={s[f.key] ?? ""}
                  onChange={(e) => setS((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="font-mono"
                />
              )}
            </label>
          ))}
          <Button type="submit" disabled={!name.trim() || busy}>
            {busy ? "Salvando…" : item ? "Salvar" : "Guardar no cofre"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
