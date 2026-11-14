"use client"

import { useState } from "react"
import { BadgeCheckIcon, BlocksIcon, Building2Icon, CheckIcon, ChevronDownIcon, LockIcon, MonitorIcon, PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, ClassTag, Empty, Hint, Tag, pick } from "@/components/dock/ui"
import { CATEGORIES, type DockConnector } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAccess } from "@/lib/use-access"

/** Apps: o catálogo aprovado pelos founders. Instalar é por bot, no painel do bot. */
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
      {founder && open.map((r) => (
        <Card key={r.id} className="flex flex-wrap items-center gap-3 shadow-[0_0_0_1.5px_var(--highlight-soft)]">
          <Tag className="bg-highlight-soft text-highlight">pedido</Tag>
          <span className="min-w-0 flex-1 text-sm"><b>{r.name}</b><span className="block truncate text-xs text-muted-foreground">{r.why}</span></span>
          <Hint text="Aceitar o pedido"><Button size="icon-sm" aria-label="Aceitar" onClick={() => run((api) => api.decideRequest(r.id, true), "Aceito.")}><CheckIcon /></Button></Hint>
          <Hint text="Recusar"><Button size="icon-sm" variant="ghost" aria-label="Recusar" onClick={() => run((api) => api.decideRequest(r.id, false), "Recusado.")}><XIcon /></Button></Hint>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-1.5">
        {[{ id: "todos" as const, label: "Todos" }, ...CATEGORIES].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={pick(cat === c.id)}>{c.label}</button>
        ))}
        <span className="flex-1" />
        <Button variant="outline" onClick={() => setReq(true)}><PlusIcon />Pedir app</Button>
      </div>

      {list.length === 0 && <Empty icon={BlocksIcon} text="Nenhum app aqui" />}
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((c) => {
          const actions = d.actions.filter((x) => x.connectorId === c.id && x.enabled)
          const soon = c.status === "suspenso" || c.wave !== 1
          return (
            <Card key={c.id} className={soon ? "opacity-60" : ""}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-foreground/[0.06] text-sm font-semibold">{c.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">{c.name}{c.approvedBy && !soon && <Hint text="Aprovado por um founder"><BadgeCheckIcon className="size-4 text-success" /></Hint>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.description}</span>
                  </span>
                  {c.status === "suspenso" ? <Tag className="bg-danger-soft text-danger">suspenso</Tag> : c.wave !== 1 ? <Tag title={c.wave === 2 ? "Chega na próxima leva" : "Ainda em conferência"}><LockIcon />em breve</Tag> : null}
                  <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-3 grid gap-1.5 border-t border-border pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Tag title={c.runsAt === "pc" ? "Roda no seu PC" : "Mexe em coisa da empresa: passa pelo porteiro"}>{c.runsAt === "pc" ? <MonitorIcon /> : <Building2Icon />}{c.runsAt === "pc" ? "PC" : "empresa"}</Tag>
                    {c.minLevel > 0 && <Tag title="Nível mínimo do bot">nível {c.minLevel}</Tag>}
                  </div>
                  {actions.map((x) => (
                    <div key={x.actionKey} className="flex items-center gap-2 text-sm"><span className="flex-1">{x.label}</span><ClassTag k={x.actionClass} /></div>
                  ))}
                  {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                </div>
              </details>
            </Card>
          )
        })}
      </div>

      <Dialog open={req} onOpenChange={setReq}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pedir app</DialogTitle></DialogHeader>
          <Input aria-label="Qual app" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Qual app? Ex.: Trello, Canva" />
          <Input aria-label="Site oficial" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="Site oficial (opcional) https://" />
          <Textarea aria-label="Para quê" value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} placeholder="O que o bot faria com ele" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReq(false)}>Cancelar</Button>
            <Button variant="brand" disabled={!form.name.trim() || !form.why.trim() || (!!form.url && !form.url.startsWith("https://"))}
              onClick={async () => { await run((api) => api.requestConnector(form.name.trim(), form.url.trim() || null, form.why.trim()), "Pedido enviado."); setReq(false); setForm({ name: "", url: "", why: "" }) }}>Enviar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
