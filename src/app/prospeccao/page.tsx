"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ExternalLinkIcon, KeyboardIcon, MessageCircleIcon, PartyPopperIcon, PhoneIcon, TimerIcon, Undo2Icon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { whatsappLink } from "@/lib/domain/contact"
import { dayStats, duration, greeting, isDiscarded, prospectQueue, rejectionLabel, reviewStatus } from "@/lib/domain/prospecting"
import type { Lead } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { approveLead, confirmContact, undoReview } from "@/lib/services/ai-office"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader } from "@/components/shared/layout"
import { AnalysisBlock } from "@/components/prospecting/review-panel"
import { RejectLeadDialog } from "@/components/prospecting/reject-dialog"

/**
 * Modo Prospecção: revisar dezenas de leads o mais rápido possível.
 * A = aprovar e contatar · D = descartar · E = confirmar enviado · N = não enviei · ← → navegar.
 * Abrir o WhatsApp NÃO conta como enviado: só o "ENVIEI" registra o contato.
 */
export default function ProspectingPage() {
  const leads = useStore((s) => s.leads)
  const meId = useStore((s) => s.meId)
  const [tab, setTab] = useState<"fila" | "aguardando" | "descartados">("fila")
  const [scope, setScope] = useState<"meus" | "todos">("meus")
  const queue = useMemo(() => prospectQueue(leads, scope === "meus" ? meId : undefined), [leads, scope, meId])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ leadId: string; name: string; message: string } | null>(null)
  const [rejecting, setRejecting] = useState(false)
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
    const message = greeting(new Date())
    approveLead(current.id)
    const link = whatsappLink(current.contact)
    const following = queue[index + 1]?.id ?? null
    if (!link) {
      toast.warning(`${current.name} aprovado, mas sem WhatsApp válido`, { description: "Contate por outro meio e registre na página do lead." })
      setCurrentId(following)
      return
    }
    window.open(`${link}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")
    setPending({ leadId: current.id, name: current.name, message })
    setCurrentId(following)
  }, [current, pending, queue, index])

  const confirmSent = useCallback(() => {
    if (!pending) return
    confirmContact(pending.leadId, pending.message)
    toast.success(`Contato com ${pending.name} registrado`)
    setPending(null) // o próximo da fila já está na tela
  }, [pending])

  const notSent = useCallback(() => {
    if (!pending) return
    toast(`${pending.name} ficou aprovado, sem contato`, { description: "Está em “Aguardando contato”." })
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
  const waiting = leads.filter((l) => reviewStatus(l) === "approved" && l.contactStatus !== "contacted" && (scope === "todos" || l.review?.approvedBy === meId))
  const discarded = leads.filter((l) => isDiscarded(l)).sort((a, b) => (b.review?.rejectedAt ?? "").localeCompare(a.review?.rejectedAt ?? ""))

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prospecção"
        description="Revise rápido: aprovar e chamar no WhatsApp, ou descartar dizendo o porquê."
        actions={
          <div className="flex rounded-lg border p-0.5 text-xs">
            {(["meus", "todos"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className={cn("rounded-md px-2.5 py-1 font-medium", scope === s ? "bg-accent" : "text-muted-foreground hover:text-foreground")}>
                {s === "meus" ? "Meus leads" : "Todos"}
              </button>
            ))}
          </div>
        }
      />
      <div className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6">
        {/* Progresso do dia e da sessão */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="Na sessão" value={`${done} / ${done + queue.length}`} />
          <Stat label="Contatados hoje" value={String(stats.contacted)} tone="success" />
          <Stat label="Descartados hoje" value={String(stats.rejected)} />
          <Stat label="Restantes" value={String(queue.length)} />
          <Stat label="Tempo · média" value={done ? `${duration(elapsed)} · ${duration(elapsed / done)}` : "—"} icon={TimerIcon} />
        </div>

        <div className="flex gap-1 border-b text-sm">
          {(
            [
              ["fila", `Fila (${queue.length})`],
              ["aguardando", `Aguardando contato (${waiting.length})`],
              ["descartados", `Descartados (${discarded.length})`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={cn("-mb-px border-b-2 px-3 py-2", tab === id ? "border-brand font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {label}
            </button>
          ))}
        </div>

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
            <LeadCard lead={current} position={index + 1} total={queue.length} onPrev={() => go(-1)} onNext={() => go(1)} onApprove={approveAndContact} onReject={() => setRejecting(true)} blocked={!!pending} />
          ) : (
            <EmptyState icon={PartyPopperIcon} title="Fila zerada" description={scope === "meus" ? "Nenhum lead seu esperando revisão. Veja “Todos” ou importe mais." : "Nenhum lead esperando revisão."} className="py-16" />
          ))}

        {tab === "aguardando" && (
          <List
            empty="Nenhum lead aprovado esperando contato."
            items={waiting.map((l) => ({
              lead: l,
              detail: `aprovado ${l.review?.approvedAt ? relative(l.review.approvedAt) : ""}`,
              action: whatsappLink(l.contact) ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    const message = greeting(new Date())
                    window.open(`${whatsappLink(l.contact)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer")
                    setPending({ leadId: l.id, name: l.name, message })
                  }}
                >
                  <MessageCircleIcon /> Contatar
                </Button>
              ) : null,
            }))}
          />
        )}

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
            setCurrentId(queue[index + 1]?.id ?? null)
          }}
        />
      )}
    </div>
  )
}

function LeadCard({
  lead,
  position,
  total,
  onPrev,
  onNext,
  onApprove,
  onReject,
  blocked,
}: {
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
      </div>

      <div className="flex flex-wrap gap-2">
        {lead.website ? (
          <a href={lead.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent">
            <ExternalLinkIcon className="size-4" /> Abrir site
          </a>
        ) : (
          <span className="inline-flex h-9 items-center rounded-lg border border-dashed px-3 text-sm text-muted-foreground">Sem site</span>
        )}
        <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm", !whatsappLink(lead.contact) && "text-muted-foreground")}>
          <PhoneIcon className="size-4" /> {lead.contact || "Sem telefone"}
        </span>
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

function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone?: "success"; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <p className="t-label flex items-center gap-1">
        {Icon && <Icon className="size-3" />} {label}
      </p>
      <p className={cn("tabular mt-0.5 text-base font-semibold", tone === "success" && "text-success")}>{value}</p>
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="ml-1 rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground">{children}</kbd>
}
