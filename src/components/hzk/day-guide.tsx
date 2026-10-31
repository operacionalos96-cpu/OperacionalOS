"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ArrowRightIcon, CalendarClockIcon, CheckIcon, FlameIcon, InboxIcon, LightbulbIcon, MinusIcon, MoonIcon, ScaleIcon, SunriseIcon, TriangleAlertIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { BECAME_LABEL, checkInStreak, dayPlan, dayProgress, greeting, guideMood, lastDayCaptures, type GuideMood, type GuideStep, type StepKind } from "@/lib/domain/day-guide"
import { needsCheckIn, planId, type DailyPlan } from "@/lib/domain/presence"
import { useCheckins, useDailyPlans } from "@/lib/modules"
import { weeklyAsk } from "@/lib/domain/weekly"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { useDoing, useMyDay } from "@/lib/use-my-day"
import { useUI } from "@/lib/ui-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CloseDay } from "./close-day"
import { DoingButton } from "./doing-now"
import { GuideOrb } from "./guide-orb"
import { WeeklyCheckinCard } from "./weekly-checkin"
import { usePersonWork } from "./team-overview"

/** Preferências só deste navegador (como no Workspace): já viu o guia alguma vez / em que dia abriu. */
const KEY_FIRST = "hzk-os-guide-first"
const KEY_DAY = "hzk-os-guide-day"
const KEY_HINT = "hzk-os-guide-hint"
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {}
}
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

const STEP_ICON: Record<StepKind, typeof CheckIcon> = {
  atrasada: TriangleAlertIcon,
  decisao: ScaleIcon,
  reuniao: CalendarClockIcon,
  hoje: CheckIcon,
  caixa: InboxIcon,
}

/**
 * Guia do dia (o "agente" do HZK Workspace, para o time): ao abrir o app no dia, surge com uma
 * saudação, o check-in de um botão (com o foco de hoje) e "Por onde vamos começar?", a lista da
 * pessoa em ordem de prioridade. Minimizado, vira uma bolinha com a marca HZK no canto; um toque
 * reabre. Regras em src/lib/domain/day-guide.ts; presença em ADR 0009.
 */
export function DayGuide() {
  const meId = useStore((s) => s.meId)
  const hydrated = useStore((s) => s.hydrated)
  const tasks = useStore((s) => s.tasks)
  const items = useStore((s) => s.items)
  const toggleTask = useStore((s) => s.toggleTask)
  const doingActions = useDoing()
  const loaded = useDailyPlans((s) => s.loaded)
  const checkins = useCheckins((s) => s.items)
  const plans = useDailyPlans((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  const now = useMinute()
  const work = usePersonWork(meId, 1)

  const today = format(now, "yyyy-MM-dd")
  const mine = plans.find((p) => p.id === planId(meId, now))
  const day = useMyDay()
  const steps = useMemo(() => dayPlan(day, now), [day, now])
  const progress = useMemo(() => dayProgress(meId, now, tasks), [meId, now, tasks])
  const streak = useMemo(() => checkInStreak(meId, now, plans), [meId, now, plans])
  const captures = useMemo(() => lastDayCaptures(meId, now, [...tasks, ...items]), [meId, now, tasks, items])

  const [view, setView] = useState<"closed" | "open" | "min">("closed")
  const [hello, setHello] = useState<{ firstTime: boolean; seenToday: boolean } | null>(null)
  const [waving, setWaving] = useState(false)
  /** Abertura em etapas (como no Workspace): saudação → frase digitando → a lista do dia. */
  const [stage, setStage] = useState<"title" | "line" | "body">("body")
  const [typed, setTyped] = useState(0)
  const [flight, setFlight] = useState<{ from: DOMRect; to: DOMRect } | null>(null)
  const [hint, setHint] = useState(false)
  const [focus, setFocus] = useState("")
  /** O que o painel mostra: o dia (padrão), o ritual Fechar o dia, ou Planejar hoje. */
  const [mode, setMode] = useState<"dia" | "fechar" | "planejar">("dia")
  const request = useUI((s) => s.guide)
  const panelRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLSpanElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const started = useRef(false)

  // Primeira abertura do dia (ou check-in pendente): o guia surge aberto. Depois, fica na bolinha.
  useEffect(() => {
    if (!hydrated || !loaded || started.current) return
    started.current = true
    const seenToday = read(KEY_DAY) === today
    setHello({ firstTime: !read(KEY_FIRST), seenToday })
    write(KEY_FIRST, "1")
    write(KEY_DAY, today)
    if (needsCheckIn(mine) || !seenToday) open(true)
    else setView("min")
  }, [hydrated, loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // O foco planejado ontem ("Fechar o dia") já vem preenchido no check-in.
  useEffect(() => {
    if (mine?.focus && !mine.checkedInAt) setFocus((f) => f || mine.focus!)
  }, [mine?.focus, mine?.checkedInAt])

  // A Início pede para abrir ("Planejar meu dia" / "Fechar o dia").
  useEffect(() => {
    if (!request || !started.current) return
    open()
    setMode(request.mode === "fechar" ? "fechar" : "dia")
  }, [request])

  /** `intro`: a abertura automática do dia passa pelas etapas; reabrir pela bolinha vai direto à lista. */
  function open(intro = false) {
    setMode("dia")
    setHint(false)
    setView("open")
    setWaving(true)
    setTimeout(() => setWaving(false), 2400)
    setTyped(0)
    setStage(intro && !reducedMotion() ? "title" : "body")
  }

  const lineText = useRef("")
  useEffect(() => {
    if (stage === "title") {
      const id = setTimeout(() => setStage("line"), 900)
      return () => clearTimeout(id)
    }
    if (stage !== "line") return
    if (typed >= lineText.current.length) {
      const id = setTimeout(() => setStage("body"), 650)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => setTyped((n) => n + 1), 24)
    return () => clearTimeout(id)
  }, [stage, typed])

  /** Minimizar: o painel encolhe no orbe, que voa em arco até o canto (como no Workspace). */
  function minimize() {
    const from = orbRef.current?.getBoundingClientRect()
    const to = launcherRef.current?.getBoundingClientRect()
    const showHint = !read(KEY_HINT)
    write(KEY_HINT, "1")
    if (!from || !to || reducedMotion()) {
      setView("min")
      setHint(showHint)
      return
    }
    panelRef.current?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.35)" }], { duration: 280, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" })
    setFlight({ from, to })
    setTimeout(() => {
      setView("min")
      setHint(showHint)
    }, 260)
  }

  useEffect(() => {
    if (!hint) return
    const id = setTimeout(() => setHint(false), 6000)
    return () => clearTimeout(id)
  }, [hint])

  if (!hydrated || !loaded || view === "closed" || !hello) return null

  const me = getUser(meId)
  const needs = needsCheckIn(mine)
  const g = greeting(me.name, now, { ...hello, pending: steps.length })
  const mood: GuideMood = waving ? "hello" : needs ? "calm" : guideMood(steps, progress)
  const allDone = progress.total > 0 && progress.done === progress.total
  const line = allDone && !needs ? "Tudo entregue hoje. Mandou bem!" : g.line
  lineText.current = line

  function checkIn(e: React.FormEvent) {
    e.preventDefault()
    const base: DailyPlan = { ...(mine ?? {}), id: planId(meId, now), memberId: meId, date: today }
    save({ ...base, focus: focus.trim() || mine?.focus, checkedInAt: new Date().toISOString(), skippedAt: undefined })
    const s = checkInStreak(meId, now, [...plans, { ...base, checkedInAt: "x" }])
    toast.success("Check-in feito", { description: s > 1 ? `${s} dias seguidos. O time vê você no expediente.` : "O time vê você no expediente." })
    setWaving(true)
    setTimeout(() => setWaving(false), 1800)
  }

  function skip() {
    save({ ...(mine ?? {}), id: planId(meId, now), memberId: meId, date: today, skippedAt: new Date().toISOString() })
    minimize()
  }

  function complete(step: GuideStep) {
    const task = taskOf(step.taskId)
    if (!task) return
    doingActions.complete(task)
    toast.success("Feito!", { description: step.title, action: { label: "Desfazer", onClick: () => toggleTask(step.taskId!) } })
  }

  const yesterday = plans.find((p) => p.id === planId(meId, new Date(+now - 864e5)))
  const canPlanToday = !needs && !!yesterday?.checkedInAt && !yesterday.closedAt && !day.planItems.some((x) => x.task.plannedFor === today)
  const canClose = !needs && !!mine?.checkedInAt && !mine.closedAt && now.getHours() >= 15
  const weekly = needs ? null : weeklyAsk(meId, now, checkins)
  const taskOf = (id?: string) => (id ? tasks.find((t) => t.id === id) : undefined)

  const capturedDay = captures && (captures.day === format(new Date(+now - 864e5), "yyyy-MM-dd") ? "ontem" : format(parseISO(captures.day), "EEEE", { locale: ptBR }))

  return (
    <>
      {view === "open" && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Guia do dia"
          onClick={() => stage !== "body" && setStage("body")}
          className="fixed right-4 bottom-20 z-50 flex max-h-[min(40rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] origin-bottom-right animate-enter flex-col overflow-hidden rounded-3xl border bg-card shadow-lift md:right-6 md:bottom-6"
        >
          <header className="flex items-start gap-3 p-4 pb-3">
            <span ref={orbRef} className="size-12 shrink-0">
              <GuideOrb mood={mood} className="size-12" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Guia do dia</p>
              <p className="animate-enter text-lg leading-tight font-semibold">{g.title}</p>
              {/* Leitor de tela recebe a frase inteira; a digitação é só visual. Um toque pula a abertura. */}
              <p className="t-desc mt-0.5 min-h-10 text-sm">
                <span className="sr-only">{line}</span>
                {stage !== "title" && (
                  <span aria-hidden>
                    {stage === "line" ? line.slice(0, typed) : line}
                    {stage === "line" && <span className="ml-px inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-highlight" />}
                  </span>
                )}
              </p>
            </div>
            <button type="button" onClick={minimize} aria-label="Minimizar o guia" className="-mt-1 -mr-1 rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
              <MinusIcon className="size-4" />
            </button>
          </header>

          {stage === "body" && mode !== "dia" && (
            <div className="animate-enter overflow-y-auto px-4 pb-4">
              <CloseDay day={day} target={mode === "fechar" ? "amanha" : "hoje"} onDone={() => setMode("dia")} />
            </div>
          )}
          {stage === "body" && mode === "dia" && (
          <div className="grid animate-enter gap-4 overflow-y-auto px-4 pb-4">
            {work.areas.length > 0 && (
              <p className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                Suas áreas:
                {work.areas.map((a) => (
                  <span key={a.id} className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                    {a.name}
                  </span>
                ))}
              </p>
            )}

            {needs ? (
              <form onSubmit={checkIn} className="grid gap-2 rounded-2xl bg-highlight-soft p-3">
                <label htmlFor="guide-focus" className="text-sm font-medium">
                  Foco de hoje <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <Input id="guide-focus" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ex.: fechar o roteiro do lançamento" maxLength={140} autoFocus />
                <Button type="submit" size="lg" className="w-full">
                  Fazer check-in
                </Button>
                <button type="button" onClick={skip} className="justify-self-center text-xs text-muted-foreground underline-offset-2 hover:underline">
                  Agora não
                </button>
              </form>
            ) : (
              <div className="grid gap-2 rounded-2xl border p-3">
                {mine?.checkedInAt && (
                  <p className="text-sm">
                    <span className="font-medium">Check-in às {format(new Date(mine.checkedInAt), "HH:mm")}</span>
                    {mine.focus && <span className="text-muted-foreground"> · Foco: {mine.focus}</span>}
                  </p>
                )}
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="Entregas de hoje">
                    <div className={cn("h-full rounded-full transition-[width] duration-500", allDone ? "bg-success" : "bg-brand")} style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  <span className="tabular text-xs text-muted-foreground">
                    {progress.done} de {progress.total} hoje
                  </span>
                </div>
                {streak > 0 && (
                  <p className="inline-flex items-center gap-1 text-xs font-medium text-highlight">
                    <FlameIcon className="size-3.5" /> {streak} {streak === 1 ? "dia" : "dias seguidos"} de check-in
                  </p>
                )}
              </div>
            )}

            {weekly && <WeeklyCheckinCard kind={weekly} />}

            {(canPlanToday || canClose) && (
              <div className="flex flex-wrap gap-2">
                {canPlanToday && (
                  <Button size="sm" variant="outline" onClick={() => setMode("planejar")}>
                    <SunriseIcon /> Planejar hoje
                  </Button>
                )}
                {canClose && (
                  <Button size="sm" variant="outline" onClick={() => setMode("fechar")}>
                    <MoonIcon /> Fechar o dia
                  </Button>
                )}
              </div>
            )}

            <section className="grid gap-2">
              <p className="font-semibold">Por onde vamos começar?</p>
              {steps.length ? (
                <ol className="grid grid-cols-1 gap-1.5">
                  {steps.slice(0, 6).map((s, i) => {
                    const Icon = STEP_ICON[s.kind]
                    return (
                      <li key={s.id} className="stagger flex items-center gap-2 rounded-xl border bg-background p-2" style={{ "--i": i } as React.CSSProperties}>
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.kind === "atrasada" ? "bg-highlight-soft text-highlight" : "bg-muted")}>{i + 1}</span>
                        <Link href={s.href} onClick={minimize} className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{s.title}</span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Icon className="size-3" /> {s.hint}
                          </span>
                        </Link>
                        {taskOf(s.taskId) && <DoingButton task={taskOf(s.taskId)!} compact />}
                        {s.taskId ? (
                          <button type="button" onClick={() => complete(s)} aria-label={`Concluir: ${s.title}`} title="Concluir" className="flex size-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:border-success hover:bg-success/10 hover:text-success">
                            <CheckIcon className="size-4" />
                          </button>
                        ) : (
                          <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                        )}
                      </li>
                    )
                  })}
                  {steps.length > 6 && (
                    <li>
                      <Link href="/tarefas" onClick={minimize} className="text-xs font-medium text-brand">
                        + {steps.length - 6} na sua lista
                      </Link>
                    </li>
                  )}
                </ol>
              ) : (
                <p className="t-desc text-sm">Nada pendente agora. Bom momento para adiantar algo ou anotar uma ideia.</p>
              )}
            </section>

            {captures && (
              <details className="group rounded-2xl border p-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                  <LightbulbIcon className="size-4 text-highlight" />
                  O que você anotou {capturedDay} ({captures.list.length})
                </summary>
                <ul className="mt-2 grid grid-cols-1 gap-1.5">
                  {captures.list.map(({ item, became }) => (
                    <li key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">{item.title}</span>
                      <span className={cn("shrink-0 text-xs", became === "caixa" ? "text-highlight" : "text-muted-foreground")}>{BECAME_LABEL[became]}</span>
                    </li>
                  ))}
                </ul>
                {captures.list.some((c) => c.became === "caixa") && (
                  <Link href="/caixa-de-entrada" onClick={minimize} className="mt-2 inline-block text-xs font-medium text-brand">
                    Decidir o que fica na caixa de entrada
                  </Link>
                )}
              </details>
            )}
          </div>
          )}
        </div>
      )}

      {/* A bolinha no canto: sempre no mesmo lugar (o voo mira nela), escondida com o guia aberto. */}
      <button
        ref={launcherRef}
        type="button"
        onClick={() => open()}
        aria-label={steps.length ? `Abrir o guia do dia (${steps.length} na lista)` : "Abrir o guia do dia"}
        aria-hidden={view === "open"}
        tabIndex={view === "open" ? -1 : 0}
        className={cn("fixed right-4 bottom-36 z-40 size-12 rounded-full shadow-lift transition-[opacity,transform] duration-300 hover:scale-105 md:right-6 md:bottom-6 md:size-14", view === "open" || flight ? "pointer-events-none scale-75 opacity-0" : "opacity-100")}
      >
        <GuideOrb mood={view === "min" && !needs && !steps.length ? "rest" : mood} className="size-full" />
        {steps.length > 0 && (
          <span className="tabular absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-highlight text-[10px] font-bold text-white ring-2 ring-background">{steps.length}</span>
        )}
      </button>

      {hint && view === "min" && (
        <button type="button" onClick={() => open()} className="fixed right-20 bottom-44 z-40 flex animate-enter items-end gap-1 text-left md:right-24 md:bottom-16">
          <span className="max-w-48 rounded-2xl border bg-card px-3 py-2 text-xs shadow-card">
            <span className="block font-semibold">Guia do dia</span>
            Minimizado aqui. Toque para reabrir quando quiser.
          </span>
          <svg viewBox="0 0 110 80" className="mb-[-1.5rem] size-14 shrink-0 text-highlight" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path className="draw-line" style={{ "--len": 110 } as React.CSSProperties} d="M10 12c22-6 52 0 70 18 10 10 15 24 16 40" />
            <path className="draw-line" style={{ "--len": 40, animationDelay: "500ms" } as React.CSSProperties} d="M86 62l10 12 8-15" />
          </svg>
        </button>
      )}

      {flight && <FlyingOrb from={flight.from} to={flight.to} mood={mood} onDone={() => setFlight(null)} />}
    </>
  )
}

/** O orbe voa em arco do painel até o canto, girando e deixando um rastro de luz. */
function FlyingOrb({ from, to, mood, onDone }: { from: DOMRect; to: DOMRect; mood: GuideMood; onDone: () => void }) {
  const refs = useRef<(HTMLDivElement | null)[]>([])
  useLayoutEffect(() => {
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    const s = to.width / from.width
    // Arco: sobe um pouco no meio do caminho (curva de Bézier aproximada por 3 quadros).
    const lift = Math.min(140, Math.abs(dx) * 0.35 + 60)
    const frames: Keyframe[] = [
      { transform: "translate(0, 0) rotate(0deg) scale(1)" },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) rotate(200deg) scale(${(1 + s) / 2 + 0.15})`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(360deg) scale(${s})` },
    ]
    const anims = refs.current.map((el, i) => el?.animate(frames, { duration: 720, delay: i * 45, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "both" }))
    anims[0]?.finished.then(onDone, onDone)
    return () => anims.forEach((a) => a?.cancel())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
      {/* Rastro: duas cópias atrasadas e mais apagadas, atrás do orbe principal. */}
      {[0.18, 0.35, 1].map((opacity, i, all) => (
        <div
          key={i}
          ref={(el) => {
            refs.current[all.length - 1 - i] = el
          }}
          className="absolute"
          style={{ left: from.left, top: from.top, width: from.width, height: from.height, opacity, filter: i < 2 ? "blur(3px)" : "drop-shadow(0 0 12px rgb(234 91 37 / 0.6))" }}
        >
          <GuideOrb mood={mood} className="size-full" />
        </div>
      ))}
    </div>
  )
}
