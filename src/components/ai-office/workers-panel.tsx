"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CodeIcon, CpuIcon, KeyRoundIcon, PlusIcon } from "lucide-react"
import { BigEmpty } from "@/components/shared/layout"
import { workerHealth, type WorkerHealth } from "@/lib/domain/jobs"
import { relative } from "@/lib/format"
import { useAgents } from "@/lib/modules"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { opsAction, useOps, type WorkerRow } from "./ops-store"
import { RevealOnce } from "./webhooks-panel"

const CAPS = ["reasoning", "web", "filesystem", "mcp_read", "mcp_write"]
const SCOPES: Record<string, string> = {
  "queue:read": "ver fila",
  "jobs:claim": "pegar jobs",
  "jobs:execute": "executar/concluir",
  "context:read": "ler contexto",
  "knowledge:read": "ler conhecimento",
}
/** Escopos sugeridos por agente (menor privilégio). */
const SUGGESTED: Record<string, string[]> = {
  "web-analyst": ["queue:read", "jobs:claim", "jobs:execute", "context:read"],
  intelligence: ["queue:read", "jobs:claim", "jobs:execute", "context:read", "knowledge:read"],
  prospector: ["queue:read", "jobs:claim", "jobs:execute", "context:read"],
  "knowledge-manager": ["queue:read", "jobs:claim", "jobs:execute", "knowledge:read"],
}

export const HEALTH: Record<WorkerHealth, { dot: string; label: string }> = {
  online: { dot: "🟢", label: "online" },
  idle: { dot: "🟡", label: "ocioso" },
  offline: { dot: "🔴", label: "offline" },
}

export function WorkerHealthLine({ w }: { w: WorkerRow }) {
  const h = workerHealth(w.last_seen_at)
  return (
    <span className="text-xs text-muted-foreground" title="Só indica heartbeat/atividade recente — não garante que o app esteja aberto.">
      {HEALTH[h].dot} {HEALTH[h].label} · último sinal {w.last_seen_at ? relative(w.last_seen_at) : "nunca"}
    </span>
  )
}

export function WorkersPanel() {
  const workers = useOps((s) => s.workers)
  const agents = useAgents((s) => s.items)
  const [creating, setCreating] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  async function run(action: string, body: Record<string, unknown>, done?: string) {
    try {
      const r = await opsAction<{ token?: string }>(action, body)
      if (r.token) setToken(r.token)
      if (done) toast.success(done)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "falhou")
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="t-desc text-sm">Cada app/IA que trabalha na fila é um worker, com token próprio, capabilities e permissões mínimas.</p>
        <Button variant="brand" onClick={() => setCreating(true)}>
          <PlusIcon /> Novo worker
        </Button>
      </div>
      {workers.length === 0 ? (
        <BigEmpty icon={CpuIcon} title="Nenhum worker ainda" text="Cadastre o app ou a IA que vai pegar trabalho da fila." action={<Button variant="outline" className="border-brand" onClick={() => setCreating(true)}><PlusIcon /> Novo worker</Button>} />
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {workers.map((w) => (
            <li key={w.id} className={cn("grid gap-1.5 rounded-xl border bg-card p-4", !w.enabled && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {w.name} <span className="text-xs font-normal text-muted-foreground">· {agents.find((a) => a.id === w.agent_id)?.name ?? "qualquer agente"}{w.engine ? ` · ${w.engine}` : ""}</span>
                </p>
                <code className="text-xs text-muted-foreground">••••{w.token_hint}</code>
              </div>
              <WorkerHealthLine w={w} />
              <p className="text-xs text-muted-foreground">Último job: {w.last_job_at ? relative(w.last_job_at) : "—"}</p>
              <div className="flex flex-wrap gap-1">
                {w.capabilities.map((c) => (
                  <code key={c} className="rounded bg-muted px-1 text-xs">{c}</code>
                ))}
                {w.scopes.map((s) => (
                  <code key={s} className="rounded border px-1 text-xs text-muted-foreground">{s}</code>
                ))}
              </div>
              <div className="flex gap-1">
                <Button size="xs" variant="outline" onClick={() => run("workers.toggle", { id: w.id, enabled: !w.enabled }, w.enabled ? "Desligado" : "Ligado")}>
                  {w.enabled ? "Desligar" : "Ligar"}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => window.confirm("Gerar token novo? O antigo para de funcionar na hora.") && run("workers.rotate", { id: w.id })}>
                  <KeyRoundIcon /> Novo token
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-xs text-muted-foreground shadow-card md:flex-row md:items-center">
        <span className="flex items-center gap-3 md:w-52 md:shrink-0">
          <span className="flex size-11 items-center justify-center rounded-xl border border-highlight/20 bg-highlight-soft text-highlight">
            <CodeIcon className="size-5" />
          </span>
          <span className="text-base font-semibold text-foreground">Como conectar</span>
        </span>
        <div className="grid flex-1 gap-1">
        <p>
          <strong>MCP</strong> (Claude Code/Desktop, ChatGPT dev mode): servidor HTTP <code>{origin}/api/mcp</code> com cabeçalho <code>Authorization: Bearer &lt;token&gt;</code>.
        </p>
        <p className="mt-1">
          <strong>REST</strong> (automações): <code>POST {origin}/api/workers/claim_next_job</code> com o mesmo cabeçalho. Sem job, a resposta traz <code>poll.retry_after_seconds</code>.
        </p>
        </div>
      </div>
      {creating && <CreateWorker onClose={() => setCreating(false)} onCreated={setToken} />}
      {token && <RevealOnce title="Token do worker" value={token} hint="Configure no app/automação como Authorization: Bearer <token>. Se vazar, gere um novo aqui." onClose={() => setToken(null)} />}
    </div>
  )
}

function CreateWorker({ onClose, onCreated }: { onClose: () => void; onCreated: (token: string) => void }) {
  const agents = useAgents((s) => s.items)
  const [name, setName] = useState("")
  const [agentId, setAgentId] = useState("web-analyst")
  const [engine, setEngine] = useState("Claude")
  const [caps, setCaps] = useState<string[]>(["reasoning", "web", "mcp_read", "mcp_write"])
  const [scopes, setScopes] = useState<string[]>(SUGGESTED["web-analyst"])
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    try {
      const r = await opsAction<{ token: string }>("workers.create", { name, agentId: agentId || undefined, engine, capabilities: caps, scopes })
      onClose()
      onCreated(r.token)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "falhou")
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo worker</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3">
          <Input placeholder="Nome (ex.: Claude Web Analyst)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={agentId}
              onChange={(e) => {
                setAgentId(e.target.value)
                setScopes(SUGGESTED[e.target.value] ?? ["queue:read"])
              }}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
              <option value="">Qualquer agente</option>
            </select>
            <Input placeholder="Engine (Claude, GPT, Gemini…)" value={engine} onChange={(e) => setEngine(e.target.value)} />
          </div>
          <Chips title="Capabilities (o que ele CONSEGUE fazer)" all={CAPS} value={caps} onToggle={(c) => setCaps((v) => toggle(v, c))} />
          <Chips title="Permissões (o que ele PODE fazer)" all={Object.keys(SCOPES)} labels={SCOPES} value={scopes} onToggle={(s) => setScopes((v) => toggle(v, s))} />
          <Button type="submit" disabled={!name.trim() || !scopes.length}>
            Criar e ver o token
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Chips({ title, all, value, onToggle, labels }: { title: string; all: string[]; value: string[]; onToggle: (v: string) => void; labels?: Record<string, string> }) {
  return (
    <div className="grid gap-1">
      <p className="t-label">{title}</p>
      <div className="flex flex-wrap gap-1">
        {all.map((v) => (
          <button key={v} type="button" onClick={() => onToggle(v)} className={cn("rounded-full border px-2 py-0.5 text-xs", value.includes(v) ? "border-brand bg-accent" : "text-muted-foreground")}>
            {labels?.[v] ? `${labels[v]} (${v})` : v}
          </button>
        ))}
      </div>
    </div>
  )
}
