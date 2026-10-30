"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react"
import { ACTIVITY_LABELS, INTERACTION_KINDS, STAGES, isOpenStage } from "@/lib/domain/constants"
import type { Activity, ActivityKind, Lead } from "@/lib/domain/types"
import { daysSince, leadUrgency, taskPeople } from "@/lib/domain/rules"
import { dateTime, dueLabel, money, parseMoney, relative, shortDate } from "@/lib/format"
import { deleteLeadWithUndo, deleteTaskWithUndo, toggleTaskWithFeedback } from "@/lib/actions"
import { useStore } from "@/lib/store"
import { whatsappLink } from "@/lib/domain/contact"
import { openWhatsapp } from "@/lib/whatsapp-open"
import { safeUrl } from "@/lib/domain/products"
import { toast } from "sonner"
import { ExternalLinkIcon, MessageCircleIcon } from "lucide-react"
import { openTaskForm, openTxForm, useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { Chip, DueDateField, OwnerToggle, ProductSelect, TemperatureToggle } from "@/components/shared/fields"
import { InlineText } from "@/components/shared/inline-edit"
import { ReviewPanel } from "@/components/prospecting/review-panel"
import { LeadVideoCard } from "@/components/prospecting/lead-video-card"
import { NotFound } from "@/components/shared/layout"
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar"
import { moveLeadTo } from "@/components/dialogs/lead-flow-dialogs"
import { ConnectionsPanel } from "@/components/entities/connections-panel"
import { ContextPanel } from "@/components/entities/context-panel"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function LeadPage() {
  const { id } = useParams<{ id: string }>()
  const lead = useStore((s) => s.leads.find((l) => l.id === id))

  if (!lead) {
    return (
      <NotFound title="Lead não encontrado" backHref="/pipeline" backLabel="Voltar ao pipeline" />
    )
  }
  return <LeadDetail lead={lead} />
}

function LeadDetail({ lead }: { lead: Lead }) {
  const router = useRouter()
  const updateLead = useStore((s) => s.updateLead)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/pipeline">
            <ArrowLeftIcon /> Pipeline
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Mais opções">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                deleteLeadWithUndo(lead.id)
                router.push("/pipeline")
              }}
            >
              <Trash2Icon /> Excluir lead
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div>
        <InlineText
          value={lead.name}
          required
          onSave={(name) => updateLead(lead.id, { name })}
          className="text-2xl font-semibold tracking-tight"
        />
        <InlineText
          value={lead.company ?? ""}
          placeholder="Adicionar empresa"
          onSave={(company) => updateLead(lead.id, { company: company || undefined })}
          className="text-muted-foreground"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-4">
          <NextActionBlock lead={lead} />
          <Composer leadId={lead.id} />
          <Timeline leadId={lead.id} />
        </div>
        <aside className="flex flex-col gap-4">
          <ReviewPanel lead={lead} />
          <LeadVideoCard lead={lead} />
          <Properties lead={lead} />
          <LinkedTasks lead={lead} />
          <LinkedMoney lead={lead} />
          <ConnectionsPanel entity={{ type: "lead", id: lead.id }} />
          <ContextPanel entity={{ type: "lead", id: lead.id }} />
        </aside>
      </div>
    </div>
  )
}

function NextActionBlock({ lead }: { lead: Lead }) {
  const updateLead = useStore((s) => s.updateLead)
  const now = new Date()
  const urgency = leadUrgency(lead, now)

  if (!isOpenStage(lead.stage)) {
    return (
      <div className={cn("rounded-xl border p-4", lead.stage === "ganho" ? "border-success/30 bg-success-soft" : "bg-muted/50")}>
        <p className="text-sm font-medium">{lead.stage === "ganho" ? "🎉 Negócio ganho" : "Negócio perdido"}</p>
        <p className="text-sm text-muted-foreground">
          {lead.closedAt && `Fechado em ${shortDate(lead.closedAt)}.`}
          {lead.lostReason && ` Motivo: ${lead.lostReason}.`} Para reabrir, mude o estágio ao lado.
        </p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4",
        urgency === "vencida" && "border-danger/30 bg-danger-soft",
        urgency === "parado" && "border-warning/30 bg-warning-soft",
      )}
    >
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Próxima ação</p>
        {urgency === "parado" && (
          <span className="text-xs font-medium text-warning">· Sem atividade há {daysSince(lead.lastActivityAt, now)} dias</span>
        )}
      </div>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <InlineText
            value={lead.nextAction.text}
            required
            onSave={(text) => updateLead(lead.id, { nextAction: { ...lead.nextAction, text } })}
            className="text-base font-medium"
          />
          <DuePopover lead={lead} urgent={urgency === "vencida"} />
        </div>
        <Button onClick={() => useUI.getState().set({ nextActionFor: lead.id })}>
          <CheckIcon /> Feito → próxima
        </Button>
      </div>
    </div>
  )
}

function DuePopover({ lead, urgent }: { lead: Lead; urgent: boolean }) {
  const updateLead = useStore((s) => s.updateLead)
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn("mt-0.5 flex items-center gap-1 text-sm hover:underline", urgent ? "font-medium text-danger" : "text-muted-foreground")}>
          <ClockIcon className="size-3.5" /> {dueLabel(lead.nextAction.dueDate)} · {shortDate(lead.nextAction.dueDate)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <DueDateField
          value={lead.nextAction.dueDate}
          onChange={(d) => {
            if (!d) return
            updateLead(lead.id, { nextAction: { ...lead.nextAction, dueDate: d } })
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** Registrar interação: 1 clique no tipo, digita, Enter. Conta como atividade. */
function Composer({ leadId }: { leadId: string }) {
  const logInteraction = useStore((s) => s.logInteraction)
  const [kind, setKind] = useState<ActivityKind>("ligacao")
  const [text, setText] = useState("")

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    logInteraction(leadId, kind, text)
    setText("")
  }

  return (
    <form onSubmit={submit} className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {INTERACTION_KINDS.map((k) => (
          <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
            {k.label}
          </Chip>
        ))}
      </div>
      <Textarea
        placeholder="O que aconteceu? (Enter registra, Shift+Enter quebra linha)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        className="min-h-16 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Registrar
        </Button>
      </div>
    </form>
  )
}

const KIND_DOT: Partial<Record<ActivityKind, string>> = {
  estagio: "bg-sky-500",
  acao_concluida: "bg-success",
  criado: "bg-zinc-400",
}

function Timeline({ leadId }: { leadId: string }) {
  const all = useStore((s) => s.activities)
  const activities = useMemo(
    () => all.filter((a) => a.leadId === leadId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [all, leadId],
  )

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">Histórico</h2>
      <ol className="relative ml-2 border-l pl-5">
        {activities.map((a) => (
          <TimelineItem key={a.id} activity={a} />
        ))}
      </ol>
    </section>
  )
}

function TimelineItem({ activity: a }: { activity: Activity }) {
  const system = a.kind === "estagio" || a.kind === "criado" || a.kind === "acao_concluida"
  return (
    <li className="relative pb-4 last:pb-0">
      <span className={cn("absolute top-1.5 -left-[25px] size-2 rounded-full ring-4 ring-background", KIND_DOT[a.kind] ?? "bg-foreground")} />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserAvatar userId={a.authorId} size="xs" />
        <span className="font-medium text-foreground">{ACTIVITY_LABELS[a.kind]}</span>
        <span title={dateTime(a.createdAt)}>{relative(a.createdAt)}</span>
      </div>
      <p className={cn("mt-0.5 text-sm whitespace-pre-wrap", system && "text-muted-foreground")}>
        {a.kind === "acao_concluida" ? `✓ ${a.text}` : a.text}
      </p>
    </li>
  )
}

function Properties({ lead }: { lead: Lead }) {
  const updateLead = useStore((s) => s.updateLead)
  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <Prop label="Estágio">
        <div className="flex flex-wrap gap-1">
          {STAGES.map((s) => (
            <Chip key={s.id} active={lead.stage === s.id} onClick={() => moveLeadTo(lead, s.id)} className="h-6 px-1.5">
              {s.label}
            </Chip>
          ))}
        </div>
      </Prop>
      <Prop label="Responsável">
        <OwnerToggle value={lead.ownerId} onChange={(ownerId) => updateLead(lead.id, { ownerId })} />
      </Prop>
      <Prop label="Valor estimado">
        <InlineText
          value={money(lead.valueCents)}
          required
          onSave={(v) => {
            const cents = parseMoney(v)
            if (cents !== null) updateLead(lead.id, { valueCents: cents })
          }}
          className="tabular text-sm font-semibold"
        />
      </Prop>
      <Prop label="Temperatura">
        <TemperatureToggle value={lead.temperature} onChange={(temperature) => updateLead(lead.id, { temperature })} />
      </Prop>
      <Prop label="Produto">
        <ProductSelect value={lead.productId} onChange={(productId) => updateLead(lead.id, { productId })} />
      </Prop>
      <Prop label="Segmento · cidade · origem">
        <div className="grid grid-cols-3 gap-1.5">
          <InlineText value={lead.segment ?? ""} placeholder="segmento" onSave={(v) => updateLead(lead.id, { segment: v.trim() || undefined })} className="min-w-0 truncate text-sm" />
          <InlineText value={lead.city ?? ""} placeholder="cidade" onSave={(v) => updateLead(lead.id, { city: v.trim() || undefined })} className="min-w-0 truncate text-sm" />
          <InlineText value={lead.source ?? ""} placeholder="origem" onSave={(v) => updateLead(lead.id, { source: v.trim() || undefined })} className="min-w-0 truncate text-sm" />
        </div>
      </Prop>
      <Prop label="WhatsApp / contato">
        <div className="flex items-center gap-2">
          <InlineText
            value={lead.contact ?? ""}
            placeholder="(11) 90000-0000 ou e-mail"
            onSave={(contact) => updateLead(lead.id, { contact: contact || undefined })}
            className="min-w-0 flex-1 text-sm"
          />
          {whatsappLink(lead.contact) && (
            <button
              type="button"
              onClick={() => openWhatsapp(lead.contact)}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium text-success transition-colors hover:bg-success-soft"
              title="Abre no WhatsApp escolhido no Modo Prospecção (Web, App ou Celular)"
            >
              <MessageCircleIcon className="size-3.5" /> Conversar
            </button>
          )}
        </div>
      </Prop>
      <Prop label="Site">
        <div className="flex items-center gap-2">
          <InlineText
            value={lead.website ?? ""}
            placeholder="https://site-do-cliente.com.br"
            onSave={(v) => {
              if (!v.trim()) return updateLead(lead.id, { website: undefined })
              const clean = safeUrl(v)
              if (clean) updateLead(lead.id, { website: clean })
              else toast.error("Link inválido (use http/https).")
            }}
            className="min-w-0 flex-1 truncate text-sm"
          />
          {lead.website && (
            <a
              href={lead.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3.5" /> Abrir
            </a>
          )}
        </div>
      </Prop>
      <p className="text-xs text-muted-foreground">Criado {relative(lead.createdAt)}</p>
    </section>
  )
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function LinkedTasks({ lead }: { lead: Lead }) {
  const all = useStore((s) => s.tasks)
  const tasks = all.filter((t) => t.leadId === lead.id).sort((a, b) => Number(a.done) - Number(b.done))
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center">
        <h2 className="text-sm font-semibold">Tarefas</h2>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => openTaskForm({ prefill: { leadId: lead.id, ownerId: lead.ownerId } })}
        >
          <PlusIcon /> Tarefa
        </Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Coisas a fazer para este negócio (ex.: preparar proposta).</p>
      ) : (
        <ul className="grid gap-1">
          {tasks.map((t) => (
            <li key={t.id} className="group flex items-start gap-2 py-0.5">
              <Checkbox className="mt-0.5" checked={t.done} onCheckedChange={() => toggleTaskWithFeedback(t.id)} />
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm leading-tight", t.done && "text-muted-foreground line-through")}>{t.title}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AvatarStack userIds={taskPeople(t)} size="xs" />
                  {t.dueDate && dueLabel(t.dueDate)}
                </p>
              </div>
              <button
                onClick={() => deleteTaskWithUndo(t.id)}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                aria-label="Excluir tarefa"
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function LinkedMoney({ lead }: { lead: Lead }) {
  const all = useStore((s) => s.transactions)
  const txs = all.filter((t) => t.leadId === lead.id)
  if (lead.stage !== "ganho" && txs.length === 0) return null
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center">
        <h2 className="text-sm font-semibold">Recebido</h2>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() =>
            openTxForm({ prefill: { type: "entrada", leadId: lead.id, category: "Serviços", description: lead.name } })
          }
        >
          <WalletIcon /> Entrada
        </Button>
      </div>
      {txs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma entrada vinculada ainda.</p>
      ) : (
        <ul className="grid gap-1 text-sm">
          {txs.map((t) => (
            <li key={t.id} className="flex justify-between">
              <span className="text-muted-foreground">{shortDate(t.date)}</span>
              <span className="tabular font-medium text-success">+{money(t.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
