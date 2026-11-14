"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpIcon, CheckIcon, ClipboardCheckIcon, CpuIcon, ForwardIcon, HashIcon, PencilIcon, PlusIcon, SlidersHorizontalIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { connectionFor, type DockAgent, type DockApproval, type DockData, type DockMessage, type DockThread } from "@/lib/domain/dock"
import { newKey, useDock } from "@/lib/dock/store"
import { cn } from "@/lib/utils"
import { BotApps, BotSettings, BotSkills } from "./bot-panels"
import { BotAvatar, ClassTag, Label, LevelTag, StateTag, Tag, agentState } from "./ui"

const hm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const directThread = (d: DockData, agentId: string) => d.threads.find((t) => t.kind === "direta" && t.agentIds.length === 1 && t.agentIds[0] === agentId && !t.archived && !t.continuedFromThreadId)

/** Conversas: lista de bots e canais, a conversa e o painel do bot. */
export function Conversations({ d }: { d: DockData }) {
  const [sel, setSel] = useState<{ kind: "bot" | "thread"; id: string } | null>(() => (d.agents[0] ? { kind: "bot", id: d.agents[0].id } : null))
  const [panel, setPanel] = useState<"config" | "skills" | "apps" | null>(null)
  const thread: DockThread | undefined = sel?.kind === "thread" ? d.threads.find((t) => t.id === sel.id) : sel ? directThread(d, sel.id) : undefined
  const agent = sel?.kind === "bot" ? d.agents.find((a) => a.id === sel.id) : thread?.kind === "direta" ? d.agents.find((a) => a.id === thread.agentIds[0]) : undefined
  const channels = d.threads.filter((t) => t.kind === "canal" && !t.archived)
  const continued = d.threads.filter((t) => t.continuedFromThreadId && !t.archived)

  if (!d.agents.length)
    return (
      <div className="grid justify-items-start gap-3 rounded-[20px] bg-card p-6">
        <h2 className="t-title text-lg">Seu Dock está vazio</h2>
        <p className="t-desc">Crie o primeiro bot do zero ou a partir do Kit da sua área.</p>
        <Button variant="brand" asChild><Link href="/dock/bots"><PlusIcon />Criar um bot</Link></Button>
      </div>
    )

  return (
    <div className="grid min-h-[70dvh] gap-3 lg:grid-cols-[260px_minmax(0,1fr)_auto]">
      <aside className="grid content-start gap-1 rounded-[20px] bg-card/80 p-2 backdrop-blur max-lg:max-h-60 max-lg:overflow-auto" aria-label="Conversas">
        <div className="flex items-center px-2 pt-1"><Label>Bots</Label><span className="flex-1" /><Button asChild size="icon-xs" variant="ghost" aria-label="Novo bot"><Link href="/dock/bots"><PlusIcon /></Link></Button></div>
        {d.agents.map((a) => {
          const pend = d.approvals.filter((x) => x.agentId === a.id && x.status === "pendente").length
          return (
            <button key={a.id} onClick={() => setSel({ kind: "bot", id: a.id })} aria-current={sel?.kind === "bot" && sel.id === a.id}
              className={cn("flex items-center gap-2.5 rounded-[11px] px-2 py-1.5 text-left text-sm hover:bg-foreground/[0.05]", sel?.kind === "bot" && sel.id === a.id && "bg-card font-semibold shadow-[var(--shadow-lift)]")}>
              <BotAvatar d={d} a={a} size={28} />
              <span className="min-w-0 flex-1 truncate">{a.name}<span className="block text-xs font-normal text-muted-foreground">{agentState(d, a) === "ocioso" ? a.title : <StateTextShort d={d} a={a} />}</span></span>
              {pend > 0 && <span className="tabular rounded-full bg-highlight px-1.5 text-[11px] font-semibold text-white">{pend}</span>}
            </button>
          )
        })}
        {(channels.length > 0 || continued.length > 0) && <div className="px-2 pt-3"><Label>Canais e continuações</Label></div>}
        {[...channels, ...continued].map((t) => (
          <button key={t.id} onClick={() => setSel({ kind: "thread", id: t.id })} aria-current={sel?.kind === "thread" && sel.id === t.id}
            className={cn("flex items-center gap-2.5 rounded-[11px] px-2 py-1.5 text-left text-sm hover:bg-foreground/[0.05]", sel?.kind === "thread" && sel.id === t.id && "bg-card font-semibold shadow-[var(--shadow-lift)]")}>
            <HashIcon className="size-4 text-muted-foreground" /><span className="truncate">{t.title || d.agents.find((a) => a.id === t.agentIds[0])?.name}</span>
          </button>
        ))}
      </aside>

      <Chat d={d} thread={thread} agent={agent} onPanel={(p) => setPanel(panel === p ? null : p)} panel={panel} onOpen={(t) => setSel({ kind: "thread", id: t })} />

      {agent && panel && (
        <aside className="w-full rounded-[20px] bg-card p-4 lg:w-[380px]" aria-label="Painel do bot">
          <div className="mb-3 flex items-center gap-1">
            {(["config", "skills", "apps"] as const).map((p) => (
              <button key={p} onClick={() => setPanel(p)} className={cn("rounded-[11px] px-3 py-1.5 text-sm", panel === p ? "bg-foreground/[0.08] font-semibold" : "text-muted-foreground hover:text-foreground")}>
                {p === "config" ? "Configurar" : p === "skills" ? "Skills" : "Apps"}
              </button>
            ))}
            <span className="flex-1" />
            <Button size="icon-xs" variant="ghost" aria-label="Fechar painel" onClick={() => setPanel(null)}><XIcon /></Button>
          </div>
          {panel === "config" ? <BotSettings d={d} a={agent} /> : panel === "skills" ? <BotSkills d={d} a={agent} /> : <BotApps d={d} a={agent} />}
        </aside>
      )}
    </div>
  )
}

function StateTextShort({ d, a }: { d: DockData; a: DockAgent }) {
  return <StateTag state={agentState(d, a)} />
}

function Chat({ d, thread, agent, onPanel, panel, onOpen }: { d: DockData; thread?: DockThread; agent?: DockAgent; onPanel: (p: "config" | "skills" | "apps") => void; panel: string | null; onOpen: (threadId: string) => void }) {
  const run = useDock((s) => s.run)
  const [text, setText] = useState("")
  const [swap, setSwap] = useState(false)
  const [handoff, setHandoff] = useState<DockMessage | null>(null)
  const stream = useRef<HTMLDivElement>(null)
  const messages = useMemo(() => (thread ? d.messages.filter((m) => m.threadId === thread.id) : []), [d.messages, thread])
  const approvals = thread ? d.approvals.filter((a) => a.threadId === thread.id) : []
  const members = thread ? thread.agentIds.map((id) => d.agents.find((a) => a.id === id)).filter((a): a is DockAgent => !!a) : agent ? [agent] : []
  const lead = agent ?? members[0]
  const cur = thread && lead ? connectionFor(d, thread.id, lead.id) : { connectionId: lead?.connectionId ?? null, model: lead?.model ?? null, override: false }
  const conn = d.connections.find((c) => c.id === cur.connectionId)
  useEffect(() => {
    stream.current?.scrollTo({ top: stream.current.scrollHeight })
  }, [messages.length, approvals.length])

  async function send() {
    const body = text.trim()
    if (!body || !lead) return
    setText("")
    let tid = thread?.id
    if (!tid) tid = (await run((api) => api.openThread("direta", [lead.id]))) ?? undefined
    if (!tid) return
    const mentions = members.filter((m) => body.includes("@" + m.name)).map((m) => m.id)
    await run((api) => api.sendMessage(tid!, body, mentions, newKey("msg")))
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-[20px] bg-card/80 backdrop-blur" aria-label="Conversa">
      <header className="flex flex-wrap items-center gap-3 p-4">
        {agent ? <BotAvatar d={d} a={agent} size={44} /> : <span className="grid size-11 place-items-center rounded-full bg-muted"><HashIcon className="size-5" /></span>}
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">{agent?.name ?? thread?.title ?? "Canal"}{agent && <StateTag state={agentState(d, agent)} />}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {agent && <LevelTag level={agent.accessLevel} />}
            {lead && (
              <button onClick={() => setSwap(true)} title="Trocar a IA só nesta conversa" className="inline-flex items-center gap-1 rounded-[5px] bg-info-soft px-2 py-0.5 text-xs font-medium">
                <CpuIcon className="size-3" />{conn?.label ?? "sem IA"}{cur.model ? ` · ${cur.model}` : ""}{cur.override ? " (só aqui)" : ""}
              </button>
            )}
            {!agent && <span className="text-xs text-muted-foreground">{members.map((m) => m.name).join(", ")}</span>}
          </div>
        </div>
        {agent && (["config", "skills", "apps"] as const).map((p) => (
          <Button key={p} size="sm" variant={panel === p ? "secondary" : "ghost"} onClick={() => onPanel(p)}>
            {p === "config" ? <SlidersHorizontalIcon /> : null}{p === "config" ? "Configurar" : p === "skills" ? "Skills" : "Apps"}
          </Button>
        ))}
      </header>

      <div ref={stream} className="grid flex-1 content-start gap-4 overflow-auto px-4 pb-4 max-lg:max-h-[60dvh] lg:max-h-[62dvh]">
        {messages.length === 0 && <p className="t-desc py-10 text-center">Comece a conversa.</p>}
        {messages.map((m) => <Message key={m.id} d={d} m={m} onHandoff={() => setHandoff(m)} />)}
        {approvals.map((a) => <Approval key={a.id} d={d} a={a} />)}
      </div>

      <form className="m-3 grid gap-2 rounded-[20px] bg-card p-3 shadow-[var(--shadow-lift)]" onSubmit={(e) => { e.preventDefault(); void send() }}>
        <label className="sr-only" htmlFor="dock-msg">Mensagem</label>
        <textarea id="dock-msg" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={lead ? (members.length > 1 ? "Escreva no canal · use @ para chamar um bot" : `Escreva para ${lead.name}…`) : ""}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send() } }}
          className="resize-none bg-transparent text-[15px] outline-none" />
        <div className="flex items-center gap-2">
          {members.length > 1 && members.map((m) => <button type="button" key={m.id} className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setText((t) => `${t}@${m.name} `)}>@{m.name}</button>)}
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground max-sm:hidden">Enter envia</span>
          <Button type="submit" size="icon" variant="brand" className="rounded-full" aria-label="Enviar" disabled={!text.trim()}><ArrowUpIcon /></Button>
        </div>
      </form>

      <Dialog open={swap} onOpenChange={setSwap}>
        <DialogContent>
          <DialogHeader><DialogTitle>Trocar a IA só nesta conversa</DialogTitle></DialogHeader>
          <p className="t-desc">{lead?.name} continua com as mesmas instruções, skills e apps. Só muda quem pensa daqui para a frente, e cada mensagem mostra qual IA respondeu.</p>
          <div className="grid gap-1.5">
            {d.connections.flatMap((c) => (c.models.length ? c.models : ["padrão"]).map((model) => ({ c, model }))).map(({ c, model }) => (
              <button key={c.id + model} disabled={c.status !== "conectada" || !thread} onClick={async () => { await run((api) => api.setThreadModel(thread!.id, lead!.id, c.id, model)); setSwap(false) }}
                className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-left text-sm hover:bg-foreground/[0.08] disabled:opacity-45">
                <span className="flex-1"><b>{c.label}</b> · {model}<span className="block text-xs text-muted-foreground">{c.status === "conectada" ? (d.policies.find((p) => p.provider === c.provider)?.dataClass === "treina" ? "grátis, mas usa o conteúdo para treinar: o porteiro não deixa dado da empresa ir para ela" : "") : "sem cota agora"}</span></span>
                {cur.connectionId === c.id && cur.model === model && <CheckIcon className="size-4" />}
              </button>
            ))}
          </div>
          {!thread && <p className="t-desc">Mande a primeira mensagem para poder trocar a IA desta conversa.</p>}
          {cur.override && thread && <Button variant="outline" onClick={async () => { await run((api) => api.setThreadModel(thread.id, lead!.id, null)); setSwap(false) }}>Voltar à IA do bot</Button>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!handoff} onOpenChange={(o) => !o && setHandoff(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Continuar com outro bot</DialogTitle></DialogHeader>
          <p className="t-desc">Abre uma conversa nova com o outro bot, ligada a esta. O histórico entra como informação, não como ordem; nada é copiado e ele só trabalha quando você escrever.</p>
          <div className="grid gap-1.5">
            {d.agents.filter((a) => a.id !== handoff?.authorId).map((a) => (
              <button key={a.id} onClick={async () => { const t = await run((api) => api.continueWith(handoff!.threadId, a.id, newKey("cont"))); setHandoff(null); if (t) onOpen(t) }}
                className="flex items-center gap-3 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-left text-sm hover:bg-foreground/[0.08]">
                <BotAvatar d={d} a={a} size={28} /><span className="flex-1"><b>{a.name}</b><span className="block text-xs text-muted-foreground">{a.title}</span></span><LevelTag level={a.accessLevel} />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Message({ d, m, onHandoff }: { d: DockData; m: DockMessage; onHandoff: () => void }) {
  if (m.authorType === "human")
    return (
      <div className="grid justify-items-end gap-1">
        <div className="max-w-[78%] rounded-[16px_16px_5px_16px] bg-foreground px-4 py-2.5 whitespace-pre-wrap text-background">{m.body}</div>
        <time className="text-xs text-muted-foreground">{hm(m.createdAt)}</time>
      </div>
    )
  if (m.authorType === "system") return <p className="text-center text-xs text-muted-foreground">{m.body}</p>
  const a = d.agents.find((x) => x.id === m.authorId)
  const conn = d.connections.find((c) => c.id === m.connectionId)
  return (
    <article className="group grid grid-cols-[34px_minmax(0,1fr)] gap-3">
      {a ? <BotAvatar d={d} a={{ ...a }} size={34} /> : <span />}
      <div className="grid min-w-0 gap-1.5">
        <div className="flex items-baseline gap-2"><b className="text-sm">{a?.name ?? "Bot"}</b><time className="text-xs text-muted-foreground">{hm(m.createdAt)}</time></div>
        {(m.provider || conn) && (
          <div className="-mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground" title="Qual IA respondeu esta mensagem">
            <CpuIcon className="size-3" />{conn?.label ?? m.provider}{m.model ? ` · ${m.model}` : ""}
            {m.fallbackFrom && <Tag className="bg-warning-soft text-foreground">reserva no lugar de {m.fallbackFrom}{m.fallbackReason ? `: ${m.fallbackReason}` : ""}</Tag>}
          </div>
        )}
        <p className="whitespace-pre-wrap">{m.body}</p>
        {m.report && (
          <div className="grid gap-2 rounded-[15px] bg-card p-3 text-sm shadow-[var(--shadow-lift)]">
            <div className="flex items-center gap-2"><ClipboardCheckIcon className="size-4" /><b className="flex-1">Relatório</b>{m.report.status && <Tag className="bg-success-soft text-success">{m.report.status}</Tag>}</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {m.report.result && <><dt className="t-label">Resultado</dt><dd>{m.report.result}</dd></>}
              {m.report.evidence && <><dt className="t-label">Evidência</dt><dd>{m.report.evidence}</dd></>}
              {m.report.unblock && <><dt className="t-label">Desbloqueio</dt><dd>{m.report.unblock}</dd></>}
            </dl>
          </div>
        )}
        <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 max-lg:opacity-100">
          <Button size="xs" variant="ghost" onClick={onHandoff}><ForwardIcon />Continuar com outro bot</Button>
        </div>
      </div>
    </article>
  )
}

const ORIGIN: Record<DockApproval["origin"], string> = { humano: "pedido seu", rotina: "rotina", bot: "outro bot", externo: "conteúdo de fora (página, arquivo ou e-mail)" }

/** Aprovação do porteiro: o que a ação é (catálogo), o que o bot disse, de onde veio e o rascunho que SERÁ executado. */
function Approval({ d, a }: { d: DockData; a: DockApproval }) {
  const run = useDock((s) => s.run)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(JSON.stringify(a.draft, null, 2))
  const [always, setAlways] = useState(false)
  const bot = d.agents.find((x) => x.id === a.agentId)
  const connector = d.connectors.find((c) => c.id === a.connectorId)
  if (a.status !== "pendente")
    return (
      <p className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm text-muted-foreground">
        {a.status === "recusada" ? <XIcon className="size-4" /> : <CheckIcon className="size-4" />}
        {a.actionLabel || a.title}: {a.status === "executada" ? `feito${a.resultSummary ? ` (${a.resultSummary})` : ""}` : a.status}
      </p>
    )
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(draft)
  } catch {}
  const money = a.approver === "founder"
  return (
    <div role="group" aria-label={a.title} className="grid gap-2.5 rounded-[15px] bg-card p-4 shadow-[0_0_0_1.5px_var(--highlight-soft),var(--shadow-lift)]">
      <div className="flex flex-wrap items-center gap-2">
        <b className="flex-1">{connector?.name}: {a.actionLabel || a.title}</b>
        <ClassTag k={a.actionClass} />
      </div>
      <p className="t-desc">{bot?.name} pediu: “{a.title}”. Origem: {ORIGIN[a.origin]}{a.itemCount > 1 ? ` · ${a.itemCount} itens` : ""}.</p>
      {editing ? (
        <textarea className="min-h-32 rounded-[5px] border border-input bg-card p-2 font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Rascunho" />
      ) : (
        <pre className="overflow-auto rounded-[5px] bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{draft}</pre>
      )}
      {money && <p className="text-xs text-muted-foreground">Envolve dinheiro: precisa de você e de um founder. {a.ownerOkAt ? "Você já confirmou." : ""}{a.founderOkAt ? " Um founder já confirmou." : ""}</p>}
      {a.actionClass === "C" && a.origin === "humano" && !money && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
          Sempre permitir “{a.actionLabel || a.actionKey}” para {bot?.name} (90 dias)
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="brand" disabled={!parsed} onClick={() => run((api) => api.decideApproval(a.id, true, editing ? parsed : null, always), "Aprovado. O bot executa exatamente este rascunho.")}><CheckIcon />Aprovar</Button>
        <Button variant="outline" onClick={() => setEditing(!editing)}><PencilIcon />{editing ? "Pronto" : "Editar rascunho"}</Button>
        <Button variant="ghost" onClick={() => run((api) => api.decideApproval(a.id, false), "Recusado.")}>Recusar</Button>
      </div>
    </div>
  )
}
