"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ArrowRightIcon, CalendarClockIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, FlameIcon, InboxIcon, LightbulbIcon, MinusIcon, MoonIcon, ScaleIcon, StickyNoteIcon, SunriseIcon, TriangleAlertIcon, VideoIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { BECAME_LABEL, checkInStreak, dayPlan, greeting, guideMood, lastDayCaptures, type GuideMood, type GuideStep, type StepKind } from "@/lib/domain/day-guide"
import { needsCheckIn, planId, type DailyPlan } from "@/lib/domain/presence"
import { useCalendarEvents, useCheckins, useDailyPlans } from "@/lib/modules"
import { dailyState } from "@/lib/domain/daily"
import { useTeam } from "@/lib/use-team"
import { weeklyAsk } from "@/lib/domain/weekly"
import { useMinute } from "@/lib/presence"
import { useStore } from "@/lib/store"
import { dayProgress } from "@/lib/domain/rules"
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

type Screen = "ola" | "direcao" | "lista" | "fecho" | "fechar" | "planejar"

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
  const progress = useMemo(() => dayProgress(tasks, meId, now), [meId, now, tasks])
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
  /** As telas do guia (como no Workspace): olá → direção do dia → por onde começar → fecho; e os rituais. */
  const [screen, setScreen] = useState<Screen>("ola")
  const [dir, setDir] = useState<1 | -1>(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const [autoPaused, setAutoPaused] = useState(false)
  const team = useTeam()
  const events = useCalendarEvents((s) => s.items)
  const panelHeight = useRef<number | null>(null)
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
    open(false, request.mode === "fechar" ? "fechar" : "direcao")
  }, [request])

  /** `intro`: a abertura automática do dia passa pelas etapas; reabrir pela bolinha vai direto à lista. */
  function open(intro = false, start?: Screen) {
    setScreen(start ?? (intro ? "ola" : "lista"))
    setDir(1)
    setOpenId(null)
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

  /**
   * Trocar de tela (Movimento 1 do Workspace): a tela atual sai desfocando e deslizando, a nova entra
   * em sequência (CSS .guide-pane) e o painel acompanha a altura nova, suave.
   */
  function go(next: Screen, direction: 1 | -1 = 1) {
    setDir(direction)
    setOpenId(null)
    panelHeight.current = panelRef.current?.offsetHeight ?? null
    setScreen(next)
  }
  useLayoutEffect(() => {
    const el = panelRef.current
    const h0 = panelHeight.current
    panelHeight.current = null
    if (!el || h0 == null || reducedMotion()) return
    const h1 = el.offsetHeight
    if (Math.abs(h1 - h0) < 2) return
    el.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 640, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
  }, [screen])

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
    go("lista")
  }

  function skip() {
    save({ ...(mine ?? {}), id: planId(meId, now), memberId: meId, date: today, skippedAt: new Date().toISOString() })
    minimize()
  }

  function complete(step: GuideStep) {
    const task = taskOf(step.taskId)
    if (!task) return
    doingActions.complete(task)
  }

  const yesterday = plans.find((p) => p.id === planId(meId, new Date(+now - 864e5)))
  const canPlanToday = !needs && !!yesterday?.checkedInAt && !yesterday.closedAt && !day.planItems.some((x) => x.task.plannedFor === today)
  const canClose = !needs && !!mine?.checkedInAt && !mine.closedAt && now.getHours() >= 15
  const weekly = needs ? null : weeklyAsk(meId, now, checkins)
  const taskOf = (id?: string) => (id ? tasks.find((t) => t.id === id) : undefined)

  const capturedDay = captures && (captures.day === format(new Date(+now - 864e5), "yyyy-MM-dd") ? "ontem" : format(parseISO(captures.day), "EEEE", { locale: ptBR }))

  const SCREENS: Screen[] = ["ola", "direcao", "lista", "fecho"]
  const idx = SCREENS.indexOf(screen)
  const planned = day.planItems.filter((x) => x.task.plannedFor === today)
  const daily = dailyState(
    team.map((u) => u.id),
    plans,
    events,
    now,
  )
  const names = (ids: string[]) => ids.map((id) => getUser(id).name).join(", ")
  const step = (k: number) => ({ "--i": k }) as React.CSSProperties

  return (
    <>
      {view === "open" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onKeyDown={(e) => e.key === "Escape" && minimize()}>
          {/* Fundo desfocado (como o guia do Workspace): o dia aparece por trás, sem distrair. */}
          <div className="guide-scrim absolute inset-0" onClick={minimize} aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Guia do dia"
            onClick={() => stage !== "body" && setStage("body")}
            className="relative flex max-h-[min(44rem,92dvh)] w-full flex-col overflow-hidden rounded-t-3xl border bg-card shadow-lift sm:m-4 sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-3xl"
          >
            <header className="flex items-center gap-2 px-5 pt-4 pb-2">
              <span ref={orbRef} className="size-8 shrink-0">
                <GuideOrb mood={mood} className="size-8" />
              </span>
              <p className="flex-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Guia do dia</p>
              {idx > 0 && (
                <button type="button" onClick={() => go(SCREENS[idx - 1], -1)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent">
                  <ChevronLeftIcon className="size-3.5" /> Voltar
                </button>
              )}
              {idx >= 0 && (
                <span className="tabular text-xs text-muted-foreground">
                  {idx + 1} / {SCREENS.length}
                </span>
              )}
              <button type="button" onClick={minimize} aria-label="Minimizar o guia" className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
                <MinusIcon className="size-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              <div key={screen} className={cn("grid gap-4", stage === "body" && "guide-pane")} style={{ "--dir": dir } as React.CSSProperties}>
                {screen === "ola" && (
                  <div className="grid justify-items-center gap-3 py-4 text-center">
                    <GuideOrb mood={mood} className="size-20" />
                    <p className="animate-enter text-2xl leading-tight font-semibold">{g.title}</p>
                    {/* Leitor de tela recebe a frase inteira; a digitação é só visual. Um toque pula a abertura. */}
                    <p className="t-desc min-h-10 max-w-sm text-sm">
                      <span className="sr-only">{line}</span>
                      {stage !== "title" && (
                        <span aria-hidden>
                          {stage === "line" ? line.slice(0, typed) : line}
                          {stage === "line" && <span className="ml-px inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-highlight" />}
                        </span>
                      )}
                    </p>
                    {stage === "body" && (
                      <div className="grid w-full max-w-xs gap-2" onPointerEnter={() => setAutoPaused(true)} onPointerLeave={() => setAutoPaused(false)}>
                        <Button size="lg" onClick={() => go("direcao")}>
                          Vamos lá <ArrowRightIcon />
                        </Button>
                        {/* Avança sozinho, como no Workspace; passar o mouse pausa. */}
                        <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span className={cn("guide-timer block h-full bg-highlight", autoPaused && "[animation-play-state:paused]")} onAnimationEnd={() => go("direcao")} />
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {screen === "direcao" && (
                  <>
                    <h2 className="text-xl font-semibold">Direção do dia</h2>
                    {needs ? (
                      <form onSubmit={checkIn} className="grid gap-2 rounded-2xl bg-highlight-soft p-3">
                        <label htmlFor="guide-focus" className="text-sm font-medium">
                          Foco de hoje <span className="font-normal text-muted-foreground">{mine?.focus ? "(você deixou planejado ontem)" : "(opcional)"}</span>
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
                        <p className="text-sm">
                          <span className="font-medium">Check-in às {mine?.checkedInAt ? format(new Date(mine.checkedInAt), "HH:mm") : "—"}</span>
                          {mine?.focus && <span className="text-muted-foreground"> · Foco: {mine.focus}</span>}
                        </p>
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

                    {mine?.noteFromYesterday && (
                      <div className="flex gap-3 rounded-2xl border border-highlight/30 bg-highlight-soft px-3 py-2.5">
                        <StickyNoteIcon className="mt-0.5 size-4 shrink-0 text-highlight" />
                        <div>
                          <p className="text-sm font-semibold">Sua nota de ontem</p>
                          <p className="text-sm whitespace-pre-line">{mine.noteFromYesterday}</p>
                        </div>
                      </div>
                    )}

                    {(planned.length > 0 || captures) && (
                      <section className="grid gap-2">
                        <p className="text-sm font-semibold">O que você organizou {capturedDay ?? "ontem"}</p>
                        {planned.length > 0 && (
                          <ul className="grid grid-cols-1 gap-1">
                            {planned.map(({ task }) => (
                              <li key={task.id} className="flex items-center gap-2 text-sm">
                                <CheckIcon className="size-3.5 shrink-0 text-highlight" /> <span className="truncate">{task.title}</span>
                                <span className="ml-auto shrink-0 text-xs text-muted-foreground">para hoje</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {captures?.list.map(({ item, became }) => (
                          <p key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <LightbulbIcon className="size-3.5 shrink-0 text-highlight" /> <span className="truncate">{item.title}</span>
                            </span>
                            <span className={cn("shrink-0 text-xs", became === "caixa" ? "text-highlight" : "text-muted-foreground")}>{BECAME_LABEL[became]}</span>
                          </p>
                        ))}
                      </section>
                    )}

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

                    <div className="flex flex-wrap justify-end gap-2">
                      {canPlanToday && (
                        <Button variant="outline" onClick={() => go("planejar")}>
                          <SunriseIcon /> Planejar hoje
                        </Button>
                      )}
                      {!needs && (
                        <Button onClick={() => go("lista")}>
                          Por onde começar <ArrowRightIcon />
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {screen === "lista" && (
                  <>
                    <h2 className="text-xl font-semibold">Por onde vamos começar?</h2>
                    {steps.length ? (
                      <ol className="grid grid-cols-1 gap-1.5">
                        {steps.map((s, i) => {
                          const Icon = STEP_ICON[s.kind]
                          const task = taskOf(s.taskId)
                          const isOpen = openId === s.id
                          return (
                            <li key={s.id} className={cn("overflow-hidden rounded-xl border bg-background", i === 0 && "border-highlight/70", isOpen && "shadow-card")}>
                              <button type="button" onClick={() => setOpenId(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex w-full items-center gap-2 p-2 text-left">
                                <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", s.kind === "atrasada" ? "bg-highlight-soft text-highlight" : "bg-muted")}>{i + 1}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{s.title}</span>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Icon className="size-3" /> {s.hint}
                                  </span>
                                </span>
                                <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                              </button>
                              {/* O item se expande no detalhe, a partir dele mesmo (Movimento 2 do Workspace). */}
                              <div className="expand-rows" data-open={isOpen ? "" : undefined}>
                                <div>
                                  {isOpen && (
                                    <div className="flex flex-wrap gap-2 border-t px-3 pt-2 pb-3">
                                      {task && (
                                        <>
                                          <DoingButton task={task} className="success-in" />
                                          <Button size="sm" variant="outline" className="success-in" style={step(1)} onClick={() => complete(s)}>
                                            <CheckIcon /> Concluir
                                          </Button>
                                        </>
                                      )}
                                      <Button asChild size="sm" variant="ghost" className="success-in" style={step(2)}>
                                        <Link href={s.href} onClick={minimize}>
                                          Abrir <ArrowRightIcon />
                                        </Link>
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ol>
                    ) : (
                      <p className="t-desc text-sm">Nada pendente agora. Bom momento para adiantar algo ou anotar uma ideia.</p>
                    )}
                    <div className="flex justify-end">
                      <Button onClick={() => go("fecho")}>
                        Próximo <ArrowRightIcon />
                      </Button>
                    </div>
                  </>
                )}

                {screen === "fecho" && (
                  <>
                    <h2 className="text-xl font-semibold">{allDone ? "Tudo entregue. Mandou bem!" : "Pronto para o dia"}</h2>
                    {weekly && <WeeklyCheckinCard kind={weekly} />}
                    <p className="flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm">
                      <VideoIcon className="size-4 shrink-0 text-highlight" />
                      {daily.phase === "checkin"
                        ? `Reunião diária: falta o check-in de ${names(daily.missingCheckIn)}.`
                        : daily.phase === "todos"
                          ? "Reunião diária: todos prontos."
                          : "Reunião diária liberada: marque que está pronto na Início."}
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      {canClose && (
                        <Button variant="outline" onClick={() => go("fechar")}>
                          <MoonIcon /> Fechar o dia
                        </Button>
                      )}
                      <Button onClick={minimize}>
                        Bom trabalho! <ArrowRightIcon />
                      </Button>
                    </div>
                  </>
                )}

                {(screen === "fechar" || screen === "planejar") && (
                  <CloseDay day={day} target={screen === "fechar" ? "amanha" : "hoje"} onDone={() => (screen === "fechar" ? minimize() : go("lista"))} />
                )}
              </div>
            </div>
          </div>
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
