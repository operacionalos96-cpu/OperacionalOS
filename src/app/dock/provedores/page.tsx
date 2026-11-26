"use client"

import { useState } from "react"
import { CheckIcon, ChevronDownIcon, LockIcon, PlusIcon, PowerIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Card, Hint, Label, Tag } from "@/components/dock/ui"
import { endpointOk } from "@/lib/domain/dock"
import { DOCK_PROVIDERS, KIND_TEXT, type DockProvider } from "@/lib/domain/dock-providers"
import { useDock } from "@/lib/dock/store"
import { cn } from "@/lib/utils"

const DOT = { conectada: "bg-success", sem_cota: "bg-warning", desligada: "bg-muted-foreground/40" } as Record<string, string>
const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

/** IAs: as conectadas em cima; embaixo, o que dá para conectar. Fonte e termos aparecem ao conectar. */
export default function DockProvidersPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const [more, setMore] = useState(false)
  const [connect, setConnect] = useState<DockProvider | "custom" | null>(null)
  const [endpoint, setEndpoint] = useState("")
  const [label, setLabel] = useState("")
  const [ack, setAck] = useState(false)
  const have = (id: string) => d.connections.some((c) => c.provider === id)
  // o que já está conectado aparece só em cima, como cartão
  const featured = DOCK_PROVIDERS.filter((p) => p.featured && !have(p.id))
  const rest = DOCK_PROVIDERS.filter((p) => !p.featured && !have(p.id))

  async function save() {
    if (connect === "custom") {
      const id = await run((api) => api.saveConnection({ kind: "compativel", provider: (label || "personalizado").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "p").slice(0, 30), label: label || "Personalizado", endpoint, termsVersion: ack ? "aviso-v1" : null }), "Conectado.")
      if (id) setConnect(null)
      return
    }
    if (!connect) return
    const id = await run((api) => api.saveConnection({ kind: connect.kind === "local" ? "local" : "chave", provider: connect.id, label: connect.label }), `${connect.label} conectado.`)
    if (id) setConnect(null)
  }

  const row = (p: DockProvider) => {
    const locked = p.wave !== 1
    const on = have(p.id)
    return (
      <div key={p.id} className={cn("flex items-center gap-3 rounded-[11px] px-3 py-2.5", locked && "opacity-55")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-foreground/[0.06] text-sm font-semibold">{p.label.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">{p.label}{p.terms && <Hint text={p.terms}><TriangleAlertIcon className="size-3.5 text-warning" /></Hint>}</span>
          <span className="block truncate text-xs text-muted-foreground">{KIND_TEXT[p.kind]} · {p.cost}</span>
        </span>
        {locked ? (
          <Tag title={p.wave === 2 ? "Roda um programa no PC: chega com a área isolada do Windows" : (p.why ?? "Ainda em conferência")}><LockIcon />em breve</Tag>
        ) : on ? (
          <Tag className="bg-success-soft text-success"><CheckIcon />conectado</Tag>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConnect(p)}><PlusIcon />Conectar</Button>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      {d.connections.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {d.connections.map((c) => {
            const main = d.agents.filter((a) => a.connectionId === c.id).length
            return (
              <Card key={c.id} className={cn("grid gap-2", c.status === "desligada" && "opacity-60")}>
                <div className="flex items-center gap-2">
                  <Hint text={c.status === "sem_cota" ? `Sem cota${c.quotaResetsAt ? ` até ${hm(c.quotaResetsAt)}` : ""}` : c.status === "conectada" ? "Conectada" : c.status}>
                    <span className={cn("size-2.5 shrink-0 rounded-full", DOT[c.status] ?? "bg-danger")} />
                  </Hint>
                  <b className="min-w-0 flex-1 truncate text-sm">{c.label}</b>
                  <Hint text={c.status === "desligada" ? "Religar" : "Desligar"}>
                    <Button size="icon-xs" variant="ghost" aria-label={c.status === "desligada" ? "Religar" : "Desligar"} onClick={() => run((api) => api.setConnectionEnabled(c.id, c.status === "desligada"))}><PowerIcon /></Button>
                  </Hint>
                </div>
                <span className="truncate text-xs text-muted-foreground">{c.models.join(" · ") || "—"}</span>
                <div className="flex gap-1.5">
                  <Tag title="Bots que usam como IA principal">{main} {main === 1 ? "bot" : "bots"}</Tag>
                  {c.status === "sem_cota" && <Tag className="bg-warning-soft text-foreground">sem cota{c.quotaResetsAt ? ` até ${hm(c.quotaResetsAt)}` : ""}</Tag>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="grid gap-2">
        <Label>Conectar</Label>
        <Card className="grid gap-0.5 p-1.5 sm:grid-cols-2">
          {featured.map(row)}
          <div className="flex items-center gap-3 rounded-[11px] px-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-dashed border-border text-muted-foreground"><PlusIcon className="size-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Personalizado</span><span className="block truncate text-xs text-muted-foreground">Endereço compatível com a OpenAI</span></span>
            <Button size="sm" variant="outline" onClick={() => setConnect("custom")}><PlusIcon />Adicionar</Button>
          </div>
        </Card>
        <button className="flex items-center gap-2 px-1 py-1 text-left text-sm text-muted-foreground hover:text-foreground" aria-expanded={more} onClick={() => setMore(!more)}>
          <ChevronDownIcon className={cn("size-4 transition-transform", !more && "-rotate-90")} />Mais ({rest.length})
        </button>
        {more && <Card className="grid gap-0.5 p-1.5 sm:grid-cols-2">{rest.map(row)}</Card>}
      </div>

      <Dialog open={!!connect} onOpenChange={(o) => !o && setConnect(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{connect === "custom" ? "Personalizado" : `Conectar ${connect?.label}`}</DialogTitle></DialogHeader>
          {connect === "custom" ? (
            <>
              <Input aria-label="Nome" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome. Ex.: Servidor da HZK" />
              <Input aria-label="Endereço" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://meu-servidor/v1" aria-invalid={!!endpoint && !endpointOk(endpoint)} />
              {endpoint && !endpointOk(endpoint) && <p className="text-xs text-danger">Use https, sem usuário, senha ou “?”.</p>}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />Eu respondo por este endereço.</label>
            </>
          ) : connect ? (
            <>
              <p className="text-sm text-muted-foreground">{connect.kind === "local"
                  ? `O Dock procura o ${connect.label} neste PC.`
                  : connect.id === "openrouter" && d.cloud
                    ? "Com o motor na nuvem ligado, o OpenRouter usa a chave da empresa: você não cola nada. Os modelos grátis aparecem no bot em até 1 minuto."
                    : "A chave fica só neste PC."}</p>
              {connect.terms && <p className="flex gap-2 rounded-[11px] bg-warning-soft p-3 text-sm"><TriangleAlertIcon className="size-4 shrink-0" />{connect.terms}</p>}
              <p className="text-xs text-muted-foreground">{connect.cost} · {connect.source}</p>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConnect(null)}>Cancelar</Button>
            <Button variant="brand" disabled={connect === "custom" && (!ack || !endpointOk(endpoint))} onClick={save}>Conectar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
