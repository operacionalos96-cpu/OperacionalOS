"use client"

import { useState } from "react"
import { ChevronDownIcon, LockIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Card, Label, Tag } from "@/components/dock/ui"
import { endpointOk } from "@/lib/domain/dock"
import { DOCK_PROVIDERS, KIND_TEXT, type DockProvider } from "@/lib/domain/dock-providers"
import { useDock } from "@/lib/dock/store"

/** Provedores: as IAs da pessoa, os destaques, "Mais provedores" com fonte e o personalizado. */
export default function DockProvidersPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const [more, setMore] = useState(false)
  const [connect, setConnect] = useState<DockProvider | "custom" | null>(null)
  const [endpoint, setEndpoint] = useState("")
  const [label, setLabel] = useState("")
  const [ack, setAck] = useState(false)
  const have = (id: string) => d.connections.some((c) => c.provider === id)
  const featured = DOCK_PROVIDERS.filter((p) => p.featured)
  const rest = DOCK_PROVIDERS.filter((p) => !p.featured)

  const button = (p: DockProvider) =>
    p.wave === 0 ? <Tag className="bg-warning-soft text-foreground">a confirmar</Tag>
      : p.wave === 2 ? <Tag title="Programa de agente roda processo no PC: chega com a área isolada do Windows"><LockIcon />leva 2</Tag>
      : <Button size="sm" variant={have(p.id) ? "outline" : "default"} onClick={() => setConnect(p)}>{have(p.id) ? "Conectado" : "Conectar"}</Button>

  async function save() {
    if (connect === "custom") {
      const id = await run((api) => api.saveConnection({ kind: "compativel", provider: (label || "personalizado").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "p").slice(0, 30), label: label || "Personalizado", endpoint, termsVersion: ack ? "aviso-v1" : null }), "Personalizado salvo. A chave fica só neste PC.")
      if (id) setConnect(null)
      return
    }
    if (!connect) return
    const id = await run((api) => api.saveConnection({ kind: connect.kind === "local" ? "local" : "chave", provider: connect.id, label: connect.label }), `${connect.label} conectado. A chave fica só neste PC.`)
    if (id) setConnect(null)
  }

  return (
    <div className="grid gap-4">
      <p className="t-desc">As IAs que os seus bots usam. Chaves e logins ficam no cofre do Windows deste PC (pela Ponte HZK), nunca no servidor.</p>
      <Card className="grid gap-3">
        <div className="flex items-center"><h3 className="t-title flex-1">Suas IAs</h3><span className="t-desc">{d.connections.length} conectadas</span></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {d.connections.map((c) => (
            <div key={c.id} className="grid gap-1.5 rounded-[11px] bg-foreground/[0.05] p-3">
              <div className="flex items-center gap-2"><b className="flex-1 text-sm">{c.label}</b>
                {c.status === "conectada" ? <Tag className="bg-success-soft text-success">conectada</Tag> : c.status === "sem_cota" ? <Tag className="bg-warning-soft text-foreground">sem cota{c.quotaResetsAt ? ` até ${new Date(c.quotaResetsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</Tag> : <Tag>{c.status}</Tag>}
              </div>
              <span className="text-xs text-muted-foreground">{c.models.join(" · ") || "a Ponte ainda vai conferir"}</span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex-1">{d.agents.filter((a) => a.connectionId === c.id).length} bots · {d.agents.filter((a) => a.backupModels.some((b) => b.connectionId === c.id)).length} como reserva</span>
                <Button size="xs" variant="ghost" onClick={() => run((api) => api.setConnectionEnabled(c.id, c.status === "desligada"))}>{c.status === "desligada" ? "Religar" : "Desligar"}</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Label>Em destaque</Label>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {featured.map((p) => (
          <Card key={p.id} className="grid content-start gap-2">
            <div className="flex items-center gap-2"><h3 className="t-title flex-1">{p.label}</h3><Tag>{KIND_TEXT[p.kind]}</Tag></div>
            <p className="t-desc">{p.how} · {p.cost}</p>
            {p.terms && <p className="flex gap-1.5 text-xs text-muted-foreground"><TriangleAlertIcon className="size-3.5 shrink-0 text-warning" />{p.terms}</p>}
            <div className="flex items-center gap-2"><span className="flex-1 font-mono text-[11px] text-muted-foreground">fonte: {p.source}</span>{button(p)}</div>
          </Card>
        ))}
      </div>

      <Card className="grid gap-2">
        <button className="flex items-center gap-2 text-left text-sm font-semibold" aria-expanded={more} onClick={() => setMore(!more)}>
          <ChevronDownIcon className={`size-4 transition-transform ${more ? "" : "-rotate-90"}`} />Mais provedores ({rest.length})
        </button>
        {more && rest.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 border-t border-border py-2 text-sm">
            <span className="min-w-0 flex-1"><b>{p.label}</b> <Tag>{KIND_TEXT[p.kind]}</Tag><span className="block text-xs text-muted-foreground">{p.why ?? `${p.how} · ${p.cost}`}</span></span>
            <span className="font-mono text-[11px] text-muted-foreground max-sm:hidden" title="Fonte conferida em 12/11/2026">{p.source}</span>
            {button(p)}
          </div>
        ))}
      </Card>

      <Card className="grid gap-2">
        <div className="flex items-center gap-2"><h3 className="t-title flex-1">Provedor personalizado</h3><Tag>sempre disponível</Tag></div>
        <p className="t-desc">Um endereço compatível com a OpenAI: um servidor seu ou outro provedor.</p>
        <div><Button variant="outline" onClick={() => setConnect("custom")}>Adicionar endereço</Button></div>
      </Card>
      <p className="t-desc">Cada provedor mostra a fonte oficial conferida em 12/11/2026. Sem fonte, fica “a confirmar” e sem botão.</p>

      <Dialog open={!!connect} onOpenChange={(o) => !o && setConnect(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{connect === "custom" ? "Provedor personalizado" : `Conectar ${connect?.label}`}</DialogTitle></DialogHeader>
          {connect === "custom" ? (
            <>
              <Label>Nome</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Servidor da HZK" />
              <Label>Endereço (compatível com a OpenAI)</Label><Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://meu-servidor/v1" />
              {endpoint && !endpointOk(endpoint) && <p className="text-xs text-danger">Use https (ou http só para o próprio PC), sem usuário, senha ou “?”.</p>}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />Entendi: eu respondo por este endereço. O Dock não conferiu quem está do outro lado.</label>
            </>
          ) : connect ? (
            <>
              <p className="t-desc">{connect.kind === "local" ? `O Dock procura o ${connect.label} rodando no seu PC.` : "A chave é colada na janela do app para PC e vai para o cofre do Windows. Nunca passa pelo navegador nem pelo servidor."}</p>
              {connect.terms && <p className="flex gap-1.5 rounded-[11px] bg-warning-soft p-3 text-sm"><TriangleAlertIcon className="size-4 shrink-0" />{connect.terms}</p>}
              <p className="text-xs text-muted-foreground">Fonte: {connect.source} (conferida em 12/11/2026) · {connect.cost}</p>
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
