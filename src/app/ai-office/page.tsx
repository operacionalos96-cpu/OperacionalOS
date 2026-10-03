"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ActivityIcon, BotIcon, FlaskConicalIcon, LightbulbIcon, PlusIcon } from "lucide-react"
import { AGENT_STATUS, HYPOTHESIS_NEXT, HYPOTHESIS_STATUS, describeEvent, type Agent, type HypothesisStatus } from "@/lib/domain/ai-office"
import { conversionData, rejectionLabel } from "@/lib/domain/prospecting"
import { useEventFeed } from "@/lib/event-service"
import { relative } from "@/lib/format"
import { useAgents, useHypotheses, useLearnings } from "@/lib/modules"
import { addLearning, createHypothesis, decideHypothesis, ensureDefaultAgents, updateAgent } from "@/lib/services/ai-office"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PageHeader, Panel } from "@/components/shared/layout"

const MODELS = ["Claude", "GPT", "Gemini", "Outro"]

/**
 * AI Office: onde os funcionários IA vão trabalhar. Hoje: cadastro e status dos agentes,
 * feed do que aconteceu (tabela de eventos) e os dados de aprendizado. Nenhuma IA paga:
 * os agentes serão ligados por MCP/webhooks usando as assinaturas que vocês já têm.
 */
export default function AiOfficePage() {
  const agents = useAgents((s) => s.items)
  const agentsLoaded = useAgents((s) => s.loaded)
  const events = useEventFeed((s) => s.events)
  const feedLoaded = useEventFeed((s) => s.loaded)
  const leads = useStore((s) => s.leads)

  useEffect(() => {
    if (agentsLoaded) ensureDefaultAgents()
  }, [agentsLoaded])

  const ordered = useMemo(() => {
    const order = ["prospector", "web-analyst", "intelligence", "knowledge-manager"]
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
    return [...agents].sort((a, b) => rank(a.id) - rank(b.id))
  }, [agents])
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name
  const data = useMemo(() => conversionData(leads), [leads])

  return (
    <div className="flex flex-col">
      <PageHeader title="AI Office" description="Os funcionários IA, o que está acontecendo e o que estamos aprendendo. Mudança de regra só com aprovação humana." />
      <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 sm:p-6">
        {!agentsLoaded ? null : agents.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Rode o SQL 0010 no Supabase para criar os agentes.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ordered.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <Panel
            title={
              <span className="flex items-center gap-2">
                <ActivityIcon className="size-4 text-muted-foreground" /> Atividade
              </span>
            }
            description="Tudo que acontece vira evento (base para os agentes aprenderem)."
          >
            {events.length === 0 ? (
              <p className="t-desc p-4 text-sm">{feedLoaded ? "Nenhum evento ainda. Aprovar, descartar e contatar leads aparece aqui." : "Carregando…"}</p>
            ) : (
              <ul className="grid max-h-[28rem] overflow-y-auto p-2">
                {events.slice(0, 80).map((e) => (
                  <li key={e.id} className="flex gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                    <span className="tabular w-11 shrink-0 text-xs text-muted-foreground">{format(new Date(e.created_at), "HH:mm")}</span>
                    <span className="min-w-0 flex-1">
                      {describeEvent(e, e.event_type.startsWith("agent.") ? agentName(e.entity_id) : leads.find((l) => l.id === e.entity_id)?.name)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{e.actor_type === "human" ? "" : e.actor_type === "agent" ? agentName(e.actor_id) ?? "agente" : "sistema"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Dados para aprendizado" description="O que o Intelligence Agent vai comparar: decisões, motivos e resultados por segmento.">
            <div className="grid gap-4 p-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 font-medium">Segmento</th>
                      <th className="py-1 text-right font-medium">Leads</th>
                      <th className="py-1 text-right font-medium">Aprov.</th>
                      <th className="py-1 text-right font-medium">Desc.</th>
                      <th className="py-1 text-right font-medium">Contato</th>
                      <th className="py-1 text-right font-medium">Proposta</th>
                      <th className="py-1 text-right font-medium">Ganho</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {data.bySegment.slice(0, 8).map((r) => (
                      <tr key={r.segment} className="border-t">
                        <td className="max-w-40 truncate py-1.5">{r.segment}</td>
                        <td className="py-1.5 text-right">{r.total}</td>
                        <td className="py-1.5 text-right">{r.approved}</td>
                        <td className="py-1.5 text-right">{r.rejected}</td>
                        <td className="py-1.5 text-right">{r.contacted}</td>
                        <td className="py-1.5 text-right">{r.proposal}</td>
                        <td className="py-1.5 text-right font-semibold">{r.won}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Object.keys(data.rejectionReasons).length > 0 && (
                <div>
                  <p className="t-label">Motivos de descarte</p>
                  <ul className="mt-1 grid gap-0.5 text-sm">
                    {Object.entries(data.rejectionReasons)
                      .sort((a, b) => b[1] - a[1])
                      .map(([reason, n]) => (
                        <li key={reason} className="flex justify-between">
                          <span>{rejectionLabel(reason)}</span>
                          <span className="tabular text-muted-foreground">{n}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <LearningsPanel />
          <HypothesesPanel />
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: Agent }) {
  const st = AGENT_STATUS[agent.status]
  return (
    <article className="grid gap-3 rounded-xl border bg-card p-4">
      <header className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <BotIcon className="size-5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{agent.name}</p>
          <p className="text-xs text-muted-foreground">{agent.role}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            st.tone === "brand" && "bg-brand/15 text-brand",
            st.tone === "warning" && "bg-warning/15 text-warning",
            st.tone === "danger" && "bg-danger-soft text-danger",
            st.tone === "muted" && "bg-muted text-muted-foreground",
          )}
        >
          {st.label}
        </span>
      </header>
      <dl className="grid gap-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Tarefa atual</dt>
          <dd className="truncate">{agent.currentTask || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">Última atividade</dt>
          <dd>{agent.lastActivity ? relative(agent.lastActivity) : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Modelo preferencial</dt>
          <dd>
            <select value={agent.preferredModel ?? ""} onChange={(e) => updateAgent(agent.id, { preferredModel: e.target.value || undefined })} className="rounded border bg-background px-1 py-0.5 text-xs">
              <option value="">—</option>
              {MODELS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{agent.description}</p>
      <div className="flex flex-wrap gap-1">
        {agent.permissions.map((p) => (
          <code key={p} className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
            {p}
          </code>
        ))}
      </div>
      <Button size="xs" variant="ghost" className="w-fit" onClick={() => updateAgent(agent.id, { status: agent.status === "disabled" ? "idle" : "disabled" })}>
        {agent.status === "disabled" ? "Ligar" : "Desligar"}
      </Button>
    </article>
  )
}

function LearningsPanel() {
  const items = useLearnings((s) => s.items)
  const [open, setOpen] = useState(false)
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <LightbulbIcon className="size-4 text-muted-foreground" /> Aprendizados
        </span>
      }
      aside={
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          <PlusIcon /> Novo
        </Button>
      }
    >
      <List items={items.map((l) => ({ id: l.id, title: l.title, meta: `${l.category} · confiança ${Math.round(l.confidence * 100)}% · ${relative(l.createdAt)}`, body: l.description }))} empty="Nada ainda. O Knowledge Manager vai preencher isto — e você pode registrar à mão." />
      {open && (
        <QuickForm
          title="Novo aprendizado"
          extra="Categoria"
          onClose={() => setOpen(false)}
          onSave={(f) => addLearning({ title: f.title, description: f.description, category: f.extra || "geral", evidence: f.evidence, confidence: f.confidence })}
        />
      )}
    </Panel>
  )
}

function HypothesesPanel() {
  const items = useHypotheses((s) => s.items)
  const [open, setOpen] = useState(false)
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <FlaskConicalIcon className="size-4 text-muted-foreground" /> Hipóteses
        </span>
      }
      description="Nenhuma hipótese muda a prospecção sozinha: só anda com sua aprovação."
      aside={
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          <PlusIcon /> Nova
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="t-desc p-4 text-sm">Nada ainda. O Intelligence Agent vai propor hipóteses com evidência.</p>
      ) : (
        <ul className="divide-y">
          {items.map((h) => (
            <li key={h.id} className="grid gap-1 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{h.title}</p>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">{HYPOTHESIS_STATUS[h.status]}</span>
              </div>
              {h.description && <p className="text-xs text-muted-foreground">{h.description}</p>}
              {h.proposedTest && <p className="text-xs">Teste: {h.proposedTest}</p>}
              <div className="flex flex-wrap gap-1 pt-1">
                {HYPOTHESIS_NEXT[h.status].map((to: HypothesisStatus) => (
                  <Button key={to} size="xs" variant={to === "rejected" ? "ghost" : "outline"} onClick={() => decideHypothesis(h.id, to)}>
                    {HYPOTHESIS_STATUS[to]}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <QuickForm
          title="Nova hipótese"
          extra="Como testar"
          onClose={() => setOpen(false)}
          onSave={(f) => createHypothesis({ title: f.title, description: f.description, evidence: f.evidence, confidence: f.confidence, proposedTest: f.extra })}
        />
      )}
    </Panel>
  )
}

function List({ items, empty }: { items: { id: string; title: string; meta: string; body?: string }[]; empty: string }) {
  if (!items.length) return <p className="t-desc p-4 text-sm">{empty}</p>
  return (
    <ul className="divide-y">
      {items.map((i) => (
        <li key={i.id} className="px-4 py-3">
          <p className="text-sm font-medium">{i.title}</p>
          <p className="text-[11px] text-muted-foreground">{i.meta}</p>
          {i.body && <p className="mt-1 text-xs text-muted-foreground">{i.body}</p>}
        </li>
      ))}
    </ul>
  )
}

function QuickForm({
  title,
  extra,
  onClose,
  onSave,
}: {
  title: string
  extra: string
  onClose: () => void
  onSave: (f: { title: string; description: string; evidence: string; confidence: number; extra: string }) => void
}) {
  const [f, setF] = useState({ title: "", description: "", evidence: "", confidence: 50, extra: "" })
  const area = "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-brand"
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!f.title.trim()) return
            onSave({ ...f, title: f.title.trim(), confidence: f.confidence / 100 })
            onClose()
          }}
        >
          <Input autoFocus placeholder="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea rows={2} placeholder="Descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={area} />
          <textarea rows={2} placeholder="Evidência (números, leads, eventos)" value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} className={area} />
          <Input placeholder={extra} value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Confiança {f.confidence}%
            <input type="range" min={0} max={100} step={5} value={f.confidence} onChange={(e) => setF({ ...f, confidence: Number(e.target.value) })} className="flex-1 accent-[var(--brand)]" />
          </label>
          <Button type="submit" disabled={!f.title.trim()}>
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
