"use client"

import { Segmented, SectionTabs } from "@/components/shared/fields"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { GlobeIcon, LoaderIcon, CopyIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ExternalLinkIcon, KeyboardIcon, MessageCircleIcon, PartyPopperIcon, PhoneIcon, TimerIcon, Undo2Icon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { isLikelyMobile, whatsappLink, whatsappNumber, whatsappProblem, type WhatsappTarget } from "@/lib/domain/contact"
import { openWhatsapp, useWhatsappTarget } from "@/lib/whatsapp-open"
import { renderTemplate } from "@/lib/domain/funnel"
import { regionOf, segmentPhrase } from "@/lib/domain/lead-context"
import { InlineText } from "@/components/shared/inline-edit"
import { needsSiteInfo, readSite, useSiteInfoRunner } from "@/lib/site-info-runner"
import { useFunnel } from "@/lib/funnel-store"
import { dayStats, duration, isDiscarded, wasContacted, prospectQueue, rejectionLabel, reviewStatus } from "@/lib/domain/prospecting"
import type { Lead } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { approveLead, funnelSent, undoReview } from "@/lib/services/ai-office"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/shared/layout"
import { AnalysisBlock } from "@/components/prospecting/review-panel"
import { RejectLeadDialog } from "@/components/prospecting/reject-dialog"
import { FunnelTab, type FunnelPending } from "@/components/prospecting/funnel-tab"

/**
 * Modo Prospecção: revisar dezenas de leads o mais rápido possível.
 * A = aprovar e contatar · D = descartar · E = confirmar enviado · N = não enviei · ← → navegar.
 * Abrir o WhatsApp NÃO conta como enviado: só o "ENVIEI" registra o contato.
 */
export default function ProspectingPage() {
  const leads = useStore((s) => s.leads)
  const meId = useStore((s) => s.meId)
  const [tab, setTab] = useState<"fila" | "aguardando" | "funil" | "descartados">("fila")
  // Link direto para uma aba (ex.: a Início abre /prospeccao?aba=funil).
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba")
    if (aba === "aguardando" || aba === "funil" || aba === "descartados") setTab(aba)
  }, [])
  const steps = useFunnel((s) => s.steps)
  const loadFunnel = useFunnel((s) => s.load)
  useEffect(() => void loadFunnel(), [loadFunnel])
  /** 1ª mensagem do funil, personalizada para o lead. */
  const firstMessage = useCallback((l: Lead) => renderTemplate(steps[0].template, l, new Date()), [steps])
  const [scope, setScope] = useState<"meus" | "todos">("meus")
  const queue = useMemo(() => prospectQueue(leads, scope === "meus" ? meId : undefined), [leads, scope, meId])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [pending, setPending] = useState<FunnelPending | null>(null)
  const [rejecting, setRejecting] = useState(false)
  /** O card que acabou de sair (aprovado → direita, descartado → esquerda), animando por 220 ms. */
  const [leaving, setLeaving] = useState<{ lead: Lead; dir: "left" | "right" } | null>(null)
  const [whatsTarget, setWhatsTarget] = useWhatsappTarget()
  // Sessão: começa na primeira decisão.
  const session = useRef<{ start: number | null; done: number }>({ start: null, done: 0 })
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Lead atual: o escolhido, se ainda está na fila; senão o primeiro.
  const index = Math.max(0, queue.findIndex((l) => l.id === currentId))
  const current: Lead | undefined = queue[index]
  useEffect(() => {
    if (current && current.id !== currentId) setCurrentId(current.id)
  }, [current, currentId])

  const countDecision = () => {
    session.current.start ??= Date.now()
    session.current.done++
  }

  const go = useCallback(
    (delta: number) => {
      if (!queue.length) return
      const next = queue[Math.min(queue.length - 1, Math.max(0, index + delta))]
      setCurrentId(next.id)
    },
    [queue, index],
  )

  /** Aprovar e contatar: aprova, monta a saudação pelo horário e abre o WhatsApp. */
  const approveAndContact = useCallback(() => {
    if (!current || pending) return
    countDecision()
    const message = firstMessage(current)
    approveLead(current.id)
    setLeaving({ lead: current, dir: "right" })
    const following = queue[index + 1]?.id ?? null
    if (!openWhatsapp(current.contact, message, whatsTarget)) {
      toast.warning(`${current.name} aprovado, mas sem WhatsApp válido`, { description: `${whatsappProblem(current.contact)}. Contate por outro meio ou cadastre o número no lead.` })
      setCurrentId(following)
      return
    }
    setPending({ leadId: current.id, name: current.name, message, step: 0 })
    setCurrentId(following)
  }, [current, pending, queue, index, whatsTarget, firstMessage])

  const confirmSent = useCallback(() => {
    if (!pending) return
    funnelSent(pending.leadId, pending.step, steps[pending.step] ?? steps[0], pending.message)
    toast.success(pending.step === 0 ? `Contato com ${pending.name} registrado` : `${steps[pending.step]?.label ?? "Passo"} enviado para ${pending.name}`)
    setPending(null) // o próximo da fila já está na tela
  }, [pending, steps])

  const notSent = useCallback(() => {
    if (!pending) return
    if (pending.step === 0) toast(`${pending.name} ficou aprovado, sem contato`, { description: "Está em “Aguardando contato”." })
    setPending(null)
  }, [pending])

  // Atalhos (só nesta tela, fora de campos de texto e com o modal fechado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (rejecting || e.ctrlKey || e.metaKey || e.altKey || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return
      const k = e.key.toLowerCase()
      if (pending) {
        if (k === "e") confirmSent()
        else if (k === "n") notSent()
        else return
      } else if (tab !== "fila") return
      else if (k === "a") approveAndContact()
      else if (k === "d" && current) setRejecting(true)
      else if (e.key === "ArrowRight") go(1)
      else if (e.key === "ArrowLeft") go(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [pending, rejecting, tab, current, approveAndContact, confirmSent, notSent, go])

  const stats = dayStats(leads, new Date(), meId)
  const elapsed = session.current.start ? Date.now() - session.current.start : 0
  const done = session.current.done
  const waiting = leads.filter((l) => reviewStatus(l) === "approved" && !wasContacted(l) && (scope === "todos" || l.review?.approvedBy === meId))
  const discarded = leads.filter((l) => isDiscarded(l)).sort((a, b) => (b.review?.rejectedAt ?? "").localeCompare(a.review?.rejectedAt ?? ""))

  return (
    <div className="flex flex-col">
      <PageHeader page="/prospeccao"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SiteInfoButton leads={leads} />
          </div>
        }
      />
      <div className="page-body is-narrow grid gap-4">
        {/* Faixa única de progresso da sessão: quanto falta na fila de hoje? */}
        <div className="grid gap-2 rounded-2xl border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="tabular text-sm font-semibold">
              {done} / {done + queue.length}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Progresso da sessão" aria-valuemin={0} aria-valuemax={done + queue.length} aria-valuenow={done}>
              <div className="h-full rounded-full bg-highlight transition-[width] duration-(--dur-4) ease-(--ease-std)" style={{ width: `${done + queue.length ? (done / (done + queue.length)) * 100 : 0}%` }} />
            </div>
          </div>
          <p className="tabular flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-success">{stats.contacted}</span> contatados hoje
            </span>
            <span>
              <span className="font-semibold text-foreground">{stats.rejected}</span> descartados hoje
            </span>
            <span>
              <span className="font-semibold text-foreground">{queue.length}</span> restantes
            </span>
            <span className="inline-flex items-center gap-1">
              <TimerIcon className="size-3" /> {done ? `${duration(elapsed)} · média ${duration(elapsed / done)}` : "—"}
            </span>
          </p>
        </div>

        {/* Filtros com rótulo, logo acima das abas (antes soltos no cabeçalho). */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="flex items-center gap-2">
            <span className="t-label">Canal</span>
            <Segmented size="sm" value={whatsTarget} onChange={setWhatsTarget} options={TARGETS.map((t) => ({ value: t.id, label: t.label }))} />
          </span>
          <span className="flex items-center gap-2">
            <span className="t-label">Dono</span>
            <Segmented
              size="sm"
              value={scope}
              onChange={setScope}
              options={[
                { value: "meus", label: "Meus leads" },
                { value: "todos", label: "Todos" },
              ]}
            />
          </span>
        </div>

        <SectionTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "fila", label: `Fila (${queue.length})` },
            { value: "aguardando", label: `Aguardando contato (${waiting.length})` },
            { value: "funil", label: "Funil" },
            { value: "descartados", label: `Descartados (${discarded.length})` },
          ]}
        />

        <SiteInfoProgress />

        {pending && (
          <div className="flex animate-enter flex-wrap items-center gap-3 rounded-xl border border-brand/50 bg-card p-4 shadow-lift" role="alertdialog" aria-label="Confirmar envio">
            <MessageCircleIcon className="size-5 text-success" />
            <p className="min-w-0 flex-1 text-sm">
              Você enviou a mensagem para <strong>{pending.name}</strong>?
            </p>
            <Button variant="outline" onClick={notSent}>
              NÃO <Kbd>N</Kbd>
            </Button>
            <Button onClick={confirmSent}>
              <CheckIcon /> ENVIEI <Kbd>E</Kbd>
            </Button>
          </div>
        )}

        {tab === "fila" &&
          (current ? (
            <div className="relative">
              {/* Pilha atrás do card: comunica "fila". */}
              {queue.length > 1 && <span aria-hidden className="absolute inset-x-3 -bottom-2 h-full rounded-2xl border bg-card/70" />}
              {queue.length > 2 && <span aria-hidden className="absolute inset-x-6 -bottom-4 h-full rounded-2xl border bg-card/40" />}
              <div key={current.id} className="relative card-rise">
                <LeadCard firstMessage={firstMessage} whatsTarget={whatsTarget} lead={current} position={index + 1} total={queue.length} onPrev={() => go(-1)} onNext={() => go(1)} onApprove={approveAndContact} onReject={() => setRejecting(true)} blocked={!!pending} />
              </div>
              {leaving && (
                <div key={`saindo-${leaving.lead.id}`} aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 z-10", leaving.dir === "right" ? "card-out-right" : "card-out-left")} onAnimationEnd={() => setLeaving(null)}>
                  <LeadCard firstMessage={firstMessage} whatsTarget={whatsTarget} lead={leaving.lead} position={index} total={queue.length} onPrev={() => {}} onNext={() => {}} onApprove={() => {}} onReject={() => {}} blocked />
                </div>
              )}
            </div>
          ) : (
            <EmptyState icon={PartyPopperIcon} title="Fila zerada" description={scope === "meus" ? "Nenhum lead seu esperando revisão. Veja “Todos” ou importe mais." : "Nenhum lead esperando revisão."} className="py-16" />
          ))}

        {tab === "aguardando" && (
          <List
            empty="Nenhum lead aprovado esperando contato."
            items={waiting.map((l) => ({
              lead: l,
              detail: `aprovado ${l.review?.approvedAt ? relative(l.review.approvedAt) : ""}${whatsappProblem(l.contact) ? ` · ${whatsappProblem(l.contact)}` : ""}`,
              action: whatsappLink(l.contact) ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const message = firstMessage(l)
                    openWhatsapp(l.contact, message, whatsTarget)
                    setPending({ leadId: l.id, name: l.name, message, step: 0 })
                  }}
                >
                  <MessageCircleIcon /> Contatar
                </Button>
              ) : null,
            }))}
          />
        )}

        {tab === "funil" && <FunnelTab leads={leads} ownerId={scope === "meus" ? meId : undefined} whatsTarget={whatsTarget} onPending={setPending} />}

        {tab === "descartados" && (
          <List
            empty="Nenhum lead descartado."
            items={discarded.map((l) => ({
              lead: l,
              detail: `${rejectionLabel(l.review?.rejectionReason)}${l.review?.rejectionNotes ? ` — “${l.review.rejectionNotes}”` : ""} · ${getUser(l.review?.rejectedBy ?? "").name} ${l.review?.rejectedAt ? relative(l.review.rejectedAt) : ""}`,
              action: (
                <Button size="xs" variant="ghost" onClick={() => undoReview(l.id, { status: "pending" })}>
                  <Undo2Icon /> Revisar de novo
                </Button>
              ),
            }))}
          />
        )}

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <KeyboardIcon className="size-3.5" />
          <span>
            <Kbd>A</Kbd> aprovar e contatar
          </span>
          <span>
            <Kbd>D</Kbd> descartar
          </span>
          <span>
            <Kbd>E</Kbd> enviei · <Kbd>N</Kbd> não enviei
          </span>
          <span>
            <Kbd>←</Kbd> <Kbd>→</Kbd> navegar
          </span>
        </p>
      </div>
      {current && (
        <RejectLeadDialog
          lead={current}
          open={rejecting}
          onOpenChange={setRejecting}
          onDone={() => {
            countDecision()
            setLeaving({ lead: current, dir: "left" })
            setCurrentId(queue[index + 1]?.id ?? null)
          }}
        />
      )}
    </div>
  )
}

function LeadCard({
  firstMessage,
  whatsTarget,
  lead,
  position,
  total,
  onPrev,
  onNext,
  onApprove,
  onReject,
  blocked,
}: {
  firstMessage: (l: Lead) => string
  whatsTarget: WhatsappTarget
  lead: Lead
  position: number
  total: number
  onPrev: () => void
  onNext: () => void
  onApprove: () => void
  onReject: () => void
  blocked: boolean
}) {
  return (
    <article className="grid gap-5 rounded-2xl border bg-card p-5 shadow-lift sm:p-6">
      <header className="flex items-center justify-between gap-3">
        <span className="t-label">
          Lead {position} / {total}
        </span>
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" onClick={onPrev} disabled={position <= 1} aria-label="Anterior (←)">
            <ArrowLeftIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={onNext} disabled={position >= total} aria-label="Próximo (→)">
            <ArrowRightIcon />
          </Button>
        </div>
      </header>

      <div>
        <Link href={`/pipeline/${lead.id}`} className="text-2xl font-semibold tracking-tight hover:underline">
          {lead.name}
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">{[lead.company, lead.segment, lead.city].filter(Boolean).join(" · ") || "Sem segmento/cidade"}</p>
        <FunnelContext lead={lead} />
      </div>

      <div className="flex flex-wrap gap-2">
        {lead.website ? (
          <a href={lead.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent">
            <ExternalLinkIcon className="size-4" /> Abrir site
          </a>
        ) : (
          <span className="inline-flex h-9 items-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">Sem site</span>
        )}
        <WhatsChip lead={lead} target={whatsTarget} message={firstMessage(lead)} />
      </div>

      <section className="rounded-xl bg-muted/40 p-4">
        <p className="t-label mb-2">Análise</p>
        <AnalysisBlock lead={lead} compact />
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button size="lg" variant="outline" onClick={onReject} disabled={blocked}>
          <XIcon /> Descartar <Kbd>D</Kbd>
        </Button>
        <Button size="lg" onClick={onApprove} disabled={blocked}>
          <MessageCircleIcon /> Aprovar e contatar <Kbd>A</Kbd>
        </Button>
      </div>
      {blocked && <p className="-mt-2 text-center text-xs text-muted-foreground">Confirme o envio acima para seguir.</p>}
    </article>
  )
}

function List({ items, empty }: { items: { lead: Lead; detail: string; action: React.ReactNode }[]; empty: string }) {
  if (!items.length) return <p className="t-desc py-10 text-center text-sm">{empty}</p>
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map(({ lead, detail, action }) => (
        <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Link href={`/pipeline/${lead.id}`} className="truncate text-sm font-medium hover:underline">
              {lead.name}
            </Link>
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          </div>
          {action}
        </li>
      ))}
    </ul>
  )
}


function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded border bg-muted px-1 font-sans text-xs text-muted-foreground">{children}</kbd>
}

const TARGETS: { id: WhatsappTarget; label: string; hint: string }[] = [
  { id: "web", label: "Web", hint: "WhatsApp Web direto na conversa, sempre na mesma aba" },
  { id: "app", label: "App", hint: "WhatsApp instalado no computador" },
  { id: "celular", label: "Celular", hint: "wa.me (no celular abre o app)" },
]

/** Onde o WhatsApp abre (lembrado neste navegador). */

/** Telefone da empresa: clicar abre a conversa (sem aprovar); copiar; aviso se parecer fixo. */
function WhatsChip({ lead, target, message }: { lead: Lead; target: WhatsappTarget; message: string }) {
  const contact = lead.contact
  const number = whatsappNumber(contact)
  if (!number) return <NoWhatsapp lead={lead} />
  const mobile = isLikelyMobile(number)
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => openWhatsapp(contact, message, target)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-success/40 px-3 text-sm font-medium text-success transition-colors hover:bg-success-soft"
        title="Abrir a conversa (não aprova o lead)"
      >
        <MessageCircleIcon className="size-4" /> {contact}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(`+${number}`)
          toast.success("Número copiado")
        }}
        className="inline-flex size-9 items-center justify-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Copiar número"
        title="Copiar número"
      >
        <CopyIcon className="size-4" />
      </button>
      {!mobile && <span className="text-xs text-warning">fixo — pode não ter WhatsApp</span>}
    </span>
  )
}

/** Sem WhatsApp válido: diz POR QUÊ e deixa cadastrar o número ali mesmo. */
function NoWhatsapp({ lead }: { lead: Lead }) {
  const [value, setValue] = useState("")
  const problem = whatsappProblem(lead.contact)
  const ok = !!whatsappLink(value)
  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!ok) return toast.error(whatsappProblem(value) ?? "Número inválido")
    // Contato antigo que não era telefone (e-mail etc.) não se perde: vai para o histórico.
    if (lead.contact) useStore.getState().logInteraction(lead.id, "nota", `Contato anterior: ${lead.contact}`)
    useStore.getState().updateLead(lead.id, { contact: value.trim() })
    toast.success("WhatsApp adicionado")
    setValue("")
  }
  return (
    <div className="grid w-full gap-1.5 rounded-lg border border-dashed border-warning/50 px-3 py-2">
      <p className="flex items-center gap-1.5 text-sm text-warning">
        <PhoneIcon className="size-4" /> {problem}
        {lead.contact && problem !== "Sem telefone cadastrado" && <span className="truncate text-xs text-muted-foreground">· “{lead.contact}”</span>}
      </p>
      <form onSubmit={save} className="flex flex-wrap items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="(11) 90000-0000"
          inputMode="tel"
          className="h-8 min-w-40 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus:border-brand"
          aria-label="WhatsApp da empresa"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!value.trim()}>
          Adicionar WhatsApp
        </Button>
        {lead.website && (
          <a href={lead.website} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-muted-foreground underline hover:text-foreground">
            procurar no site
          </a>
        )}
      </form>
    </div>
  )
}

/** O que entra no [segmento] e no [cidade/região] da mensagem. Editar grava no lead (vazio = volta ao automático). */
function FunnelContext({ lead }: { lead: Lead }) {
  const updateLead = useStore((s) => s.updateLead)
  const [reading, setReading] = useState(false)
  const field = "h-7 rounded-md border border-transparent bg-muted/60 px-2 text-sm font-medium text-foreground hover:border-border focus:border-brand focus:outline-none"
  const info = lead.siteInfo
  const fromSite = (v: "segment" | "city") => !lead[v] && !!info?.[v]
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" title="Usado nas mensagens do funil. Clique para corrigir.">
      <span>Na mensagem: empresas de</span>
      <InlineText value={segmentPhrase(lead)} placeholder="segmento" onSave={(v) => updateLead(lead.id, { segment: v || undefined })} className={cn(field, "w-52", fromSite("segment") && "bg-success-soft")} />
      <span>em</span>
      <InlineText value={regionOf(lead)} placeholder="cidade/região" onSave={(v) => updateLead(lead.id, { city: v || undefined })} className={cn(field, "w-44", fromSite("city") && "bg-success-soft")} />
      {lead.website && (
        <button
          type="button"
          disabled={reading}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-accent hover:text-foreground disabled:opacity-60"
          title={info ? `Lido do site ${new Date(info.checkedAt).toLocaleDateString("pt-BR")}${info.evidence ? ` — ${info.evidence}` : ""}${info.error ? ` (${info.error})` : ""}. Clique para ler de novo.` : "Ler segmento e cidade no site da empresa"}
          onClick={async () => {
            setReading(true)
            const r = await readSite(lead.id)
            setReading(false)
            if (r.siteInfo) {
              updateLead(lead.id, { siteInfo: r.siteInfo })
              if (r.siteInfo.error && !r.siteInfo.city) toast.warning(`Não deu para ler: ${r.siteInfo.error}`)
            } else toast.error(r.erro ?? "Falhou")
          }}
        >
          {reading ? <LoaderIcon className="size-3.5 animate-spin" /> : <GlobeIcon className="size-3.5" />}
          {info && !info.error ? "do site" : info?.error ? "site: erro" : "ler site"}
        </button>
      )}
    </div>
  )
}

/** Lê o site de todos os leads ainda não lidos. */
function SiteInfoButton({ leads }: { leads: Lead[] }) {
  const { running, start, stop } = useSiteInfoRunner()
  const missing = leads.filter(needsSiteInfo).length
  if (running)
    return (
      <Button size="sm" variant="outline" onClick={stop}>
        <XIcon /> Parar leitura
      </Button>
    )
  if (!missing) return null
  return (
    <Button size="sm" variant="outline" onClick={() => start(leads)} title="Lê o site de cada empresa e descobre o segmento exato e a cidade (para as mensagens do funil)">
      <GlobeIcon /> Ler sites ({missing})
    </Button>
  )
}

function SiteInfoProgress() {
  const { running, done, total, current, last } = useSiteInfoRunner()
  if (!running && !done) return null
  const left = Math.max(0, total - done)
  return (
    <div className="grid gap-1.5 rounded-xl border bg-card px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        {running ? <LoaderIcon className="size-3.5 animate-spin text-brand" /> : <CheckIcon className="size-3.5 text-success" />}
        <span className="font-medium">{running ? `Lendo sites: ${done}/${total}${current ? ` · ${current}` : ""}` : `Leitura dos sites: ${done}/${total}`}</span>
        {running && <span className="ml-auto text-muted-foreground">~{Math.ceil((left * 7) / 60)} min · deixe esta aba aberta</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-brand transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      {last && <p className="truncate text-muted-foreground">{last}</p>}
    </div>
  )
}
