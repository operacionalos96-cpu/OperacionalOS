"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { toast } from "sonner"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowRightIcon, BellIcon, CalendarCheckIcon, CalendarPlusIcon, CheckIcon, CircleCheckBigIcon, GripVerticalIcon, InboxIcon, VideoIcon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { EVENT_KINDS, timeRange, type CalendarEvent } from "@/lib/domain/calendar"
import { TEAM_SETTINGS_ID, dailyState } from "@/lib/domain/daily"
import { PLAN_GROUP_LABEL, reorder, type Badge, type MyDay, type PlanGroup, type PlanItem } from "@/lib/domain/my-day"
import { sectorSteps } from "@/lib/domain/sectors"
import { relative } from "@/lib/format"
import { useCalendarEvents, useCheckins, useContentItems, useDailyPlans, useTeamSettings } from "@/lib/modules"
import { weeklyAsk } from "@/lib/domain/weekly"
import { dismissNotification, notify, useMyNotifications } from "@/lib/notifications"
import { useMinute } from "@/lib/presence"
import { useFunnel } from "@/lib/funnel-store"
import { useStore } from "@/lib/store"
import { useTeam } from "@/lib/use-team"
import { useAreaList } from "@/lib/use-hzk"
import { dayRow, useDoing } from "@/lib/use-my-day"
import { useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/layout"
import { UserAvatar } from "@/components/shared/user-avatar"
import { DecisionCard } from "./decision-card"
import { DoingButton } from "./doing-now"
import { PresenceBadge } from "./presence-badge"
import { WeeklyCheckinCard } from "./weekly-checkin"
import { usePersonWork } from "./team-overview"

// ---------- Reunião diária ----------

/** Daily: o "Pronto" libera quando todos fizeram check-in; com todos prontos, entrar na reunião (ADR 0010). */
export function DailyCard() {
  const meId = useStore((s) => s.meId)
  const team = useTeam()
  const plans = useDailyPlans((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  const events = useCalendarEvents((s) => s.items)
  const settings = useTeamSettings((s) => s.items.find((x) => x.id === TEAM_SETTINGS_ID))
  const now = useMinute()
  const state = dailyState(
    team.map((u) => u.id),
    plans,
    events,
    now,
  )
  const meReady = state.ready.includes(meId)
  const meChecked = !state.missingCheckIn.includes(meId)
  const link = settings?.daily?.link
  const names = (ids: string[]) => ids.map((id) => getUser(id).name).join(", ").replace(/, ([^,]*)$/, " e $1")

  function ready() {
    const row = dayRow(useDailyPlans.getState().items, meId, new Date())
    save({ ...row, readyAt: new Date().toISOString() })
    const willBeAll = state.expected.every((id) => id === meId || state.ready.includes(id))
    if (willBeAll) {
      notify(state.expected, { kind: "daily", title: "Todos prontos para a reunião diária", href: link ?? "/", fromId: meId })
      toast.success("Todos prontos!", { description: link ? "Entre na reunião pelo botão." : "Combinem onde é a reunião." })
    } else toast.success("Você está pronto para a daily")
  }

  return (
    <section aria-label="Reunião diária" className={cn("flex flex-wrap items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card", state.phase === "todos" && "border-success/50")}>
      <VideoIcon className="size-5 text-highlight" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Reunião diária{settings?.daily?.time && <span className="font-normal text-muted-foreground"> · {settings.daily.time}</span>}
        </p>
        <p className="t-desc text-xs">
          {state.phase === "checkin"
            ? `Libera quando todos fizerem o check-in. Falta: ${names(state.missingCheckIn)}.`
            : state.phase === "todos"
              ? "Todos prontos."
              : `${state.ready.length} de ${state.expected.length} prontos${meReady ? ` · esperando ${names(state.expected.filter((id) => !state.ready.includes(id)))}` : ""}.`}
        </p>
      </div>
      <div className="flex items-center -space-x-1.5" aria-hidden>
        {state.expected.map((id) => (
          <span key={id} className={cn("rounded-full ring-2", state.ready.includes(id) ? "ring-success" : state.missingCheckIn.includes(id) ? "ring-transparent opacity-50" : "ring-highlight/60")}>
            <UserAvatar userId={id} />
          </span>
        ))}
      </div>
      {state.phase === "todos" ? (
        link ? (
          <Button asChild size="sm">
            <a href={link} target="_blank" rel="noreferrer">
              Entrar na reunião
            </a>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href="/configuracoes#daily">Definir o link</Link>
          </Button>
        )
      ) : !meChecked ? (
        <Button size="sm" variant="outline" onClick={() => useUI.getState().set({ guide: { mode: "dia", at: Date.now() } })}>
          Fazer meu check-in
        </Button>
      ) : (
        <Button size="sm" onClick={ready} disabled={state.phase !== "liberado" || meReady} title={state.phase === "checkin" ? "Libera quando todos fizerem o check-in" : undefined}>
          <CheckIcon /> {meReady ? "Pronto" : "Estou pronto"}
        </Button>
      )}
    </section>
  )
}

// ---------- Agenda de hoje ----------

const KIND_BAR: Record<CalendarEvent["kind"], string> = { reuniao: "bg-warning", compromisso: "bg-chart-out", foco: "bg-brand", ausencia: "bg-muted-foreground" }

/** Linha do tempo de hoje, com o "agora" marcado; sessões (foco com área) mostram a área. */
export function AgendaToday({ day }: { day: MyDay }) {
  const now = useMinute()
  const areas = useAreaList()
  const nowIdx = day.agenda.findIndex((e) => new Date(e.end) > now)
  return (
    <Panel
      title="Agenda de hoje"
      aside={
        <Link href="/agenda" className="inline-flex items-center gap-1 text-sm font-medium text-brand">
          Abrir agenda <ArrowRightIcon className="size-4" />
        </Link>
      }
    >
      {day.agenda.length ? (
        <ol className="grid grid-cols-1 gap-1.5 p-4">
          {day.agenda.map((e, i) => {
            const live = +new Date(e.start) <= +now && +now < +new Date(e.end)
            const area = e.areaId && areas.find((a) => a.id === e.areaId)
            return (
              <li key={e.id}>
                {i === nowIdx && !live && <NowLine />}
                <div className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5", live && "bg-highlight-soft", new Date(e.end) <= now && "opacity-55")}>
                  <span className={cn("h-8 w-1 shrink-0 rounded-full", KIND_BAR[e.kind])} />
                  <span className="tabular w-24 shrink-0 text-sm font-semibold">{e.kind === "ausencia" ? "Dia todo" : timeRange(e)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {e.title}
                    <span className="text-xs text-muted-foreground"> · {area ? `Sessão ${area.name}` : EVENT_KINDS.find((k) => k.id === e.kind)?.label}</span>
                  </span>
                  {live && <span className="text-xs font-semibold text-highlight">Agora</span>}
                </div>
              </li>
            )
          })}
          {nowIdx === -1 && <NowLine />}
        </ol>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
          <p className="t-desc text-sm">Nada na agenda hoje.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/agenda">
              <CalendarPlusIcon /> Agendar
            </Link>
          </Button>
        </div>
      )}
    </Panel>
  )
}

function NowLine() {
  const now = useMinute()
  return (
    <div className="my-1 flex items-center gap-2 text-xs font-semibold text-highlight" aria-label={`Agora, ${format(now, "HH:mm")}`}>
      <span className="size-2 rounded-full bg-highlight" />
      {format(now, "HH:mm")}
      <span className="h-px flex-1 bg-highlight/50" />
    </div>
  )
}

// ---------- Time agora ----------

/** Um por pessoa: status ao vivo (agenda, app aberto, check-in) e o que está fazendo agora. */
export function TeamNow() {
  const team = useTeam()
  return (
    <Panel
      title="Time agora"
      aside={
        <Link href="/equipe" className="inline-flex items-center gap-1 text-sm font-medium text-brand">
          Equipe <ArrowRightIcon className="size-4" />
        </Link>
      }
    >
      <ul className="grid grid-cols-1 gap-2 p-4">
        {team.map((u) => (
          <li key={u.id}>
            <Link href={`/equipe/${u.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent">
              <UserAvatar userId={u.id} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{u.name}</span>
                <PresenceBadge memberId={u.id} showDetail className="max-w-full" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ---------- Plano do dia ----------

const BADGE: Record<Badge, { label: string; className: string }> = {
  atrasada: { label: "Atrasada", className: "bg-danger-soft text-danger" },
  fazendo: { label: "Fazendo agora", className: "bg-highlight text-white" },
  andamento: { label: "Em andamento", className: "bg-brand-soft text-brand" },
  sessao: { label: "Da sessão", className: "bg-highlight-soft text-highlight" },
  colaborando: { label: "Colaborando", className: "bg-muted text-muted-foreground" },
}

/** A lista única do dia em três grupos; arrastar reordena; ▶ começa; ✓ conclui. */
export function DayPlanPanel({ day }: { day: MyDay }) {
  const groups = (["atrasado", "hoje", "depois"] as PlanGroup[]).map((g) => ({ g, items: day.planItems.filter((i) => i.group === g) })).filter((x) => x.items.length)
  return (
    <Panel
      title="Plano do dia"
      description={day.session ? `Sessão agora: ${day.session.title} (até ${format(new Date(day.session.end), "HH:mm")}). As tarefas dessa área vêm primeiro.` : "Arraste para mudar a ordem. ▶ marca para o time o que você está fazendo."}
      aside={
        <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-medium text-brand">
          Tarefas <ArrowRightIcon className="size-4" />
        </Link>
      }
    >
      {groups.length ? (
        <div className="grid gap-4 p-4">
          {groups.map(({ g, items }, k) => (
            <PlanGroupList key={g} group={g} items={items} firstId={k === 0 ? items[0]?.task.id : undefined} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <CircleCheckBigIcon className="size-8 text-success" />
          <p className="font-medium">Nada no seu plano agora</p>
          <p className="t-desc text-sm">Tarefas com prazo ou planejadas para hoje aparecem aqui.</p>
        </div>
      )}
    </Panel>
  )
}

function PlanGroupList({ group, items, firstId }: { group: PlanGroup; items: PlanItem[]; firstId?: string }) {
  const updateTask = useStore((s) => s.updateTask)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const ids = items.map((i) => i.task.id)
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    for (const { id, order } of reorder(next, items.map((i) => ({ id: i.task.id, order: i.task.order })))) updateTask(id, { order })
  }
  return (
    <section>
      <p className={cn("t-label mb-1.5", group === "atrasado" && "text-danger")}>
        {PLAN_GROUP_LABEL[group]} · {items.length}
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="grid grid-cols-1 gap-1.5">
            {items.map((i, k) => (
              <PlanRow key={i.task.id} item={i} first={i.task.id === firstId} index={k} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

/**
 * Uma tarefa do plano, no jeito do guia do Workspace: o primeiro item ganha "Comece por aqui";
 * tocar no item o expande no detalhe (e recolhe); concluir mostra o "Feito!" antes de o item sair.
 */
function PlanRow({ item, first, index }: { item: PlanItem; first?: boolean; index: number }) {
  const { complete } = useDoing()
  const areas = useAreaList()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const rowRef = useRef<HTMLLIElement | null>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.task.id })
  const area = item.task.areaId && areas.find((a) => a.id === item.task.areaId)
  const t = item.task
  const checklist = t.checklist?.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length} do checklist` : null

  async function finish() {
    setDone(true)
    const el = rowRef.current
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (el && !reduce) {
      await new Promise((ok) => setTimeout(ok, 900))
      await el.animate([{ opacity: 1, height: `${el.offsetHeight}px` }, { opacity: 0, height: "0px", marginTop: "-6px" }], { duration: 420, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" }).finished
    }
    complete(t)
    toast.success("Feito!", { description: t.title, action: { label: "Desfazer", onClick: () => useStore.getState().toggleTask(t.id) } })
  }

  return (
    <li
      ref={(el) => {
        setNodeRef(el)
        rowRef.current = el
      }}
      style={{ transform: CSS.Transform.toString(transform), transition, "--i": index } as React.CSSProperties}
      className={cn(
        "guided relative overflow-hidden rounded-xl border bg-background transition-colors",
        isDragging && "z-10 shadow-lift",
        (first || item.badges.includes("fazendo")) && "border-highlight/70",
        open && "shadow-card",
        done && "border-success/60 bg-success/5",
      )}
    >
      {first && !done && (
        <span className="absolute top-0 right-3 rounded-b-md bg-highlight px-2 py-px text-[10px] font-bold tracking-wide text-white uppercase">Comece por aqui</span>
      )}
      {done ? (
        <div className="flex items-center gap-3 p-3" role="status">
          <span className="success-in flex size-8 items-center justify-center rounded-full bg-success text-white" style={{ "--i": 0 } as React.CSSProperties}>
            <CheckIcon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="success-in block text-sm font-semibold" style={{ "--i": 1 } as React.CSSProperties}>
              Feito!
            </span>
            <span className="success-in block truncate text-xs text-muted-foreground line-through" style={{ "--i": 2 } as React.CSSProperties}>
              {t.title}
            </span>
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 p-2">
            <button type="button" {...attributes} {...listeners} aria-label={`Mover: ${t.title}`} className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground">
              <GripVerticalIcon className="size-4" />
            </button>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {item.badges.map((b) => (
                  <span key={b} className={cn("rounded-full px-1.5 py-px font-medium", BADGE[b].className)}>
                    {BADGE[b].label}
                  </span>
                ))}
                {area && <span>{area.name}</span>}
                {t.estimateMin && <span>· {t.estimateMin} min</span>}
              </span>
            </button>
            <DoingButton task={t} compact />
            <button
              type="button"
              onClick={() => void finish()}
              aria-label={`Concluir: ${t.title}`}
              title="Concluir"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:border-success hover:bg-success/10 hover:text-success"
            >
              <CheckIcon className="size-4" />
            </button>
          </div>
          {/* Detalhe: abre a partir do próprio item (Movimento 2 do guia), com os filhos chegando em sequência. */}
          <div className="expand-rows" data-open={open ? "" : undefined}>
            <div>
              {open && (
                <div className="grid gap-2 border-t px-3 pt-2 pb-3 text-sm">
                  {t.description && (
                    <p className="success-in t-desc line-clamp-3 whitespace-pre-line" style={{ "--i": -3 } as React.CSSProperties}>
                      {t.description}
                    </p>
                  )}
                  <p className="success-in flex flex-wrap gap-x-3 text-xs text-muted-foreground" style={{ "--i": -2 } as React.CSSProperties}>
                    {t.dueDate && <span>Prazo {format(new Date(`${t.dueDate.slice(0, 10)}T12:00:00`), "dd/MM")}</span>}
                    {checklist && <span>{checklist}</span>}
                    {t.ownerId !== useStore.getState().meId && <span>Dono: {getUser(t.ownerId).name}</span>}
                  </p>
                  <div className="success-in flex flex-wrap gap-2" style={{ "--i": -1 } as React.CSSProperties}>
                    <DoingButton task={t} />
                    <Button size="sm" variant="outline" onClick={() => void finish()}>
                      <CheckIcon /> Concluir
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => useUI.getState().set({ taskDetail: t.id })}>
                      Abrir completa
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </li>
  )
}

// ---------- Esperando por você ----------

/** Decisões em que você decide + avisos para você (reuniões, pedidos de contexto…). */
export function WaitingForYou({ day }: { day: MyDay }) {
  const meId = useStore((s) => s.meId)
  const notifications = useMyNotifications(meId)
  if (!day.waiting.length && !notifications.length) return null
  return (
    <Panel title="Esperando por você" description="Decisões que só você toma e avisos do time.">
      {day.waiting.length > 0 && <ul className="divide-y">{day.waiting.map((d) => <DecisionCard key={d.id} item={d} canDecide />)}</ul>}
      {notifications.length > 0 && (
        <ul className={cn("grid grid-cols-1 gap-1 p-3", day.waiting.length && "border-t")}>
          {notifications.slice(0, 6).map((n) => (
            <li key={n.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
              <BellIcon className="size-4 shrink-0 text-highlight" />
              <Link href={n.data.href} onClick={() => dismissNotification(n.id)} className="min-w-0 flex-1 text-sm" {...(n.data.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                <span className="block truncate">{n.data.title}</span>
                <span className="text-xs text-muted-foreground">
                  {getUser(n.data.fromId).name} · {relative(n.created_at)}
                </span>
              </Link>
              <button type="button" onClick={() => dismissNotification(n.id)} aria-label="Dispensar aviso" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
                <XIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

// ---------- Próximo passo de cada setor ----------

/** Um cartão por setor, com o botão que abre a aba exata onde está a ação. */
export function SectorStepsPanel() {
  const meId = useStore((s) => s.meId)
  const leads = useStore((s) => s.leads)
  const transactions = useStore((s) => s.transactions)
  const content = useContentItems((s) => s.items)
  const funnel = useFunnel((s) => s.steps)
  const loadFunnel = useFunnel((s) => s.load)
  useEffect(() => void loadFunnel(), [loadFunnel])
  const now = useMinute()
  const work = usePersonWork(meId, 1)
  const steps = useMemo(
    () => sectorSteps(meId, now, { leads, funnel, content, transactions, myAreaIds: work.areas.map((a) => a.id) }),
    [meId, now, leads, funnel, content, transactions, work.areas],
  )
  return (
    <Panel title="Próximo passo de cada setor" description="O que está esperando você em cada setor, e o botão que leva direto para lá.">
      <ul className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.id} className="stagger flex flex-col gap-2 rounded-xl border bg-background p-3" style={{ "--i": i } as React.CSSProperties}>
            <p className="flex items-center justify-between text-sm font-semibold">
              {s.title}
              {s.count > 0 && <span className="tabular rounded-full bg-highlight px-2 py-px text-xs font-bold text-white">{s.count}</span>}
            </p>
            <p className="t-desc flex-1 text-sm">{s.text}</p>
            <Button asChild size="sm" variant={s.count ? "default" : "outline"} className="self-start">
              <Link href={s.href}>
                {s.action} <ArrowRightIcon />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ---------- Caixa de entrada ----------

export function InboxCounter({ count }: { count: number }) {
  return (
    <Link href="/caixa-de-entrada" className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 shadow-card hover:border-brand/50">
      <InboxIcon className="size-5 text-muted-foreground" />
      <span className="flex-1 text-sm">
        {count ? (
          <>
            <span className="font-semibold">{count}</span> {count === 1 ? "item" : "itens"} na sua caixa de entrada para triar
          </>
        ) : (
          "Caixa de entrada vazia"
        )}
      </span>
      <ArrowRightIcon className="size-4 text-muted-foreground" />
    </Link>
  )
}

// ---------- Check-in da semana ----------

/**
 * Aparece só quando falta responder (segunda: foco; sexta: retrospectiva — weeklyAsk). O botão abre
 * o formulário ali mesmo, a partir do próprio aviso; respondeu, o aviso some.
 */
export function WeeklyNudge() {
  const meId = useStore((s) => s.meId)
  const checkins = useCheckins((s) => s.items)
  const now = useMinute()
  const [open, setOpen] = useState(false)
  const kind = weeklyAsk(meId, now, checkins)
  if (!kind) return null
  return (
    <section aria-label="Check-in da semana" className="overflow-hidden rounded-2xl border border-highlight/40 bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <CalendarCheckIcon className="size-5 text-highlight" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{kind === "segunda" ? "Qual o seu foco da semana?" : "Como foi a semana?"}</p>
          <p className="t-desc text-xs">
            {kind === "segunda" ? "Até 3 coisas, leva 1 minuto. O time vê em Equipe › Semana do time." : "O que saiu, o que travou e o que precisa de alguém."}
          </p>
        </div>
        <Button size="sm" variant={open ? "ghost" : "default"} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Depois" : "Responder agora"}
        </Button>
        <Link href="/equipe?aba=semana" className="text-xs font-medium text-brand">
          Ver a semana do time
        </Link>
      </div>
      <div className="expand-rows" data-open={open ? "" : undefined}>
        <div>{open && <WeeklyCheckinCard kind={kind} onDone={() => setOpen(false)} className="success-in mx-4 mb-4" hideTitle />}</div>
      </div>
    </section>
  )
}
