"use client"

import { useState } from "react"
import { BellIcon, SendIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, ClassTag, Label, Tag } from "@/components/dock/ui"
import { CATEGORIES, CLASS_RULE, type DockConnector } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAccess } from "@/lib/use-access"
import { cn } from "@/lib/utils"

/** Apps e conectores: catálogo curado pelos founders, com as ações por classe A–D. Instalar é por bot (no painel do bot). */
export default function DockAppsPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const founder = useAccess().hasMinimum("owner")
  const [cat, setCat] = useState<DockConnector["category"] | "todos">("todos")
  const [req, setReq] = useState(false)
  const [form, setForm] = useState({ name: "", url: "", why: "" })
  const list = d.connectors.filter((c) => (cat === "todos" || c.category === cat) && c.status !== "rascunho")
  const open = d.requests.filter((r) => r.status === "aberto")

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="t-desc flex-1">Só entra o que um founder aprova. Os tokens dos apps ficam no cofre do Windows do seu PC; o bot nunca vê.</p>
        <Button variant="outline" onClick={() => setReq(true)}><SendIcon />Pedir um app</Button>
      </div>

      {founder && open.length > 0 && (
        <Card className="grid gap-2 shadow-[0_0_0_1.5px_var(--highlight-soft)]">
          <div className="flex items-center gap-2"><Tag className="bg-highlight-soft text-highlight"><BellIcon />Precisa de você</Tag><b className="text-sm">Pedidos de app</b></div>
          {open.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
              <span className="min-w-0 flex-1"><b>{r.name}</b><span className="block text-xs text-muted-foreground">{r.why}</span></span>
              <Button size="sm" onClick={() => run((api) => api.decideRequest(r.id, true), "Aceito. Agora confira a fonte e as ações antes de pôr no catálogo.")}>Aceitar</Button>
              <Button size="sm" variant="ghost" onClick={() => run((api) => api.decideRequest(r.id, false), "Recusado.")}>Recusar</Button>
            </div>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap gap-1.5">
        {[{ id: "todos" as const, label: "Todos" }, ...CATEGORIES].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-[11px] px-3 py-1.5 text-sm", cat === c.id ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground hover:text-foreground")}>{c.label}</button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => (
          <Card key={c.id} className="grid content-start gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="t-title flex-1">{c.name}</h3>
              {c.status === "suspenso" ? <Tag className="bg-danger-soft text-danger">suspenso</Tag> : c.wave === 1 ? <Tag className="bg-success-soft text-success">no catálogo</Tag> : c.wave === 2 ? <Tag>leva 2</Tag> : <Tag className="bg-warning-soft text-foreground">a confirmar</Tag>}
            </div>
            <p className="t-desc">{c.description}</p>
            <div className="flex flex-wrap gap-1.5">
              <Tag>{c.runsAt === "pc" ? "roda no seu PC" : "roda na empresa"}</Tag>
              <Tag>nível mínimo {c.minLevel}</Tag>
            </div>
            <div className="grid gap-1">
              {d.actions.filter((x) => x.connectorId === c.id && x.enabled).map((x) => (
                <div key={x.actionKey} className="flex items-center gap-2 text-sm"><span className="flex-1">{x.label}</span><ClassTag k={x.actionClass} /></div>
              ))}
            </div>
            {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
            {c.approvedBy && <p className="text-xs text-muted-foreground">Aprovado por um founder{c.sourceUrl ? " · fonte oficial conferida" : ""}.</p>}
          </Card>
        ))}
      </div>

      <Card className="grid gap-1 text-sm">
        <Label>Como o porteiro decide</Label>
        {(["A", "B", "C", "D"] as const).map((k) => <p key={k} className="flex items-center gap-2"><ClassTag k={k} />{CLASS_RULE[k]}</p>)}
        <p className="t-desc mt-1">Para instalar num bot, abra o bot em Conversas → Apps. Ele começa em só leitura.</p>
      </Card>

      <Dialog open={req} onOpenChange={setReq}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pedir um app</DialogTitle></DialogHeader>
          <Label>Qual app?</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Trello, Canva, Notion" />
          <Label>Site oficial (opcional)</Label>
          <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" />
          <Label>Para quê?</Label>
          <Textarea value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} placeholder="O que o bot faria com ele" />
          <p className="t-desc">O pedido vai para "Precisa de você" dos founders. Um app só entra no catálogo depois que um founder confere a fonte e as ações.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReq(false)}>Cancelar</Button>
            <Button variant="brand" disabled={!form.name.trim() || !form.why.trim() || (!!form.url && !form.url.startsWith("https://"))}
              onClick={async () => { await run((api) => api.requestConnector(form.name.trim(), form.url.trim() || null, form.why.trim()), "Pedido enviado aos founders."); setReq(false); setForm({ name: "", url: "", why: "" }) }}>Enviar pedido</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
