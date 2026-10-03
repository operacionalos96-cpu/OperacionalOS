"use client"

import { useState } from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import { CopyIcon, KeyRoundIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { EVENT_TYPES } from "@/lib/domain/ai-office"
import { relative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { opsAction, useOps } from "./ops-store"

const JOB_EVENTS = ["job.created", "job.completed", "job.failed", "job.dead_lettered", "job.lease_expired"]
const ALL_EVENTS = ["*", ...EVENT_TYPES, ...JOB_EVENTS]

const DELIVERY_LABEL: Record<string, string> = { pending: "pendente", sending: "enviando", delivered: "entregue", retry_scheduled: "nova tentativa", dead_letter: "dead letter", cancelled: "cancelada" }

/** Segredo/token: aparece UMA vez. Depois só os 4 últimos caracteres. */
export function RevealOnce({ title, value, hint, onClose }: { title: string; value: string; hint: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copie agora: ele não será mostrado de novo. Guarde num lugar seguro (o Cofre serve).</DialogDescription>
        </DialogHeader>
        <code className="block break-all rounded-md border bg-muted p-3 text-xs">{value}</code>
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(value)
            toast.success("Copiado")
          }}
        >
          <CopyIcon /> Copiar
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export function WebhooksPanel() {
  const webhooks = useOps((s) => s.webhooks)
  const deliveries = useOps((s) => s.deliveries)
  const [creating, setCreating] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  async function run(action: string, body: Record<string, unknown>, done?: string) {
    try {
      const r = await opsAction<{ secret?: string }>(action, body)
      if (r.secret) setSecret(r.secret)
      if (done) toast.success(done)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "falhou")
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="t-desc text-sm">Avisam sistemas externos (n8n, Make, servidor de um worker) quando algo acontece. Assinados com HMAC-SHA256; entregues em segundo plano, com novas tentativas.</p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <PlusIcon /> Novo webhook
        </Button>
      </div>
      {webhooks.length === 0 ? (
        <p className="t-desc rounded-xl border bg-card p-6 text-center text-sm">Nenhum webhook. Sem push, os workers usam polling inteligente.</p>
      ) : (
        <ul className="grid gap-2">
          {webhooks.map((w) => {
            const mine = deliveries.filter((d) => d.webhook_id === w.id)
            const last = mine[0]
            const ok = mine.filter((d) => d.status === "delivered").length
            const bad = mine.filter((d) => d.status === "dead_letter").length
            return (
              <li key={w.id} className="grid gap-2 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("size-2 rounded-full", w.enabled ? "bg-success" : "bg-muted-foreground")} />
                  <p className="font-medium">{w.name}</p>
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{w.endpoint}</code>
                  <span className="text-xs text-muted-foreground">segredo ••••{w.secret_hint}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Eventos: {w.event_types.join(", ") || "nenhum"} · última entrega: {last ? `${DELIVERY_LABEL[last.status] ?? last.status} ${relative(last.created_at)}` : "—"} · {ok} entregues · {bad} dead letter
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button size="xs" variant="outline" onClick={() => run("webhooks.toggle", { id: w.id, enabled: !w.enabled }, w.enabled ? "Desligado" : "Ligado")}>
                    {w.enabled ? "Desligar" : "Ligar"}
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => run("webhooks.rotate", { id: w.id })}>
                    <KeyRoundIcon /> Trocar segredo
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => window.confirm(`Apagar o webhook ${w.name}?`) && run("webhooks.delete", { id: w.id }, "Apagado")}>
                    <Trash2Icon /> Apagar
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {deliveries.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <p className="t-label px-3 pt-3">Histórico de entregas</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 font-medium">Entrega</th>
                <th className="px-3 py-2 font-medium">Evento</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">HTTP</th>
                <th className="px-3 py-2 text-right font-medium">Tent.</th>
                <th className="px-3 py-2 font-medium">Horário</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {deliveries.slice(0, 60).map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{d.id.slice(0, 12)}…</td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{d.event_id.slice(0, 12)}…</td>
                  <td className={cn("px-3 py-1.5 text-xs", d.status === "delivered" ? "text-success" : d.status === "dead_letter" ? "text-danger" : "text-muted-foreground")}>
                    {DELIVERY_LABEL[d.status] ?? d.status}
                    {d.error ? ` · ${d.error}` : ""}
                  </td>
                  <td className="tabular px-3 py-1.5 text-xs">{d.response_status ?? "—"}</td>
                  <td className="tabular px-3 py-1.5 text-right text-xs">{d.attempt_count}</td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground">{format(new Date(d.last_attempt_at ?? d.created_at), "dd/MM HH:mm:ss")}</td>
                  <td className="px-3 py-1.5 text-right">
                    {["dead_letter", "retry_scheduled", "cancelled"].includes(d.status) && (
                      <Button size="xs" variant="ghost" onClick={() => run("deliveries.retry", { id: d.id }, "Reenvio agendado")}>
                        <RotateCcwIcon /> Reenviar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <CreateWebhook onClose={() => setCreating(false)} onCreated={setSecret} />}
      {secret && (
        <RevealOnce
          title="Segredo do webhook"
          value={secret}
          hint="Quem recebe confere: HMAC-SHA256(segredo, timestamp + '.' + corpo cru) = cabeçalho X-OperacionalOS-Signature (v1=…), timestamp com no máximo 5 min e event_id ainda não visto."
          onClose={() => setSecret(null)}
        />
      )}
    </div>
  )
}

function CreateWebhook({ onClose, onCreated }: { onClose: () => void; onCreated: (secret: string) => void }) {
  const [name, setName] = useState("")
  const [endpoint, setEndpoint] = useState("https://")
  const [events, setEvents] = useState<string[]>(["lead.approved", "lead.rejected"])
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const r = await opsAction<{ secret: string }>("webhooks.create", { name, endpoint, eventTypes: events })
      onClose()
      onCreated(r.secret)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "falhou")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo webhook</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3">
          <Input placeholder="Nome (ex.: n8n produção)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input placeholder="https://…" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
          <div className="grid gap-1">
            <p className="t-label">Eventos</p>
            <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">
              {ALL_EVENTS.map((ev) => (
                <button
                  key={ev}
                  type="button"
                  onClick={() => setEvents((v) => (v.includes(ev) ? v.filter((x) => x !== ev) : [...v, ev]))}
                  className={cn("rounded-full border px-2 py-0.5 font-mono text-[11px]", events.includes(ev) ? "border-brand bg-accent" : "text-muted-foreground")}
                >
                  {ev === "*" ? "* (todos)" : ev}
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={busy || !name.trim() || !endpoint.startsWith("https://") || !events.length}>
            {busy ? "Criando…" : "Criar e ver o segredo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
