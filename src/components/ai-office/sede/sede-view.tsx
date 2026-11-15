"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { ArrowLeftIcon, Building2Icon, MoonIcon, PlayIcon, RotateCwIcon, SunIcon, SunMoonIcon, TruckIcon } from "lucide-react"
import { freshForScene, SEDE_ANDARES, sedeEventsFor, sedeOcupados, type SedeEvento } from "@/lib/domain/office-scene"
import type { BusinessEvent } from "@/lib/domain/ai-office"
import { useEventFeed } from "@/lib/event-service"
import { useAgents } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAreaList } from "@/lib/use-hzk"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { SedeFloorInfo, SedeHover, SedeLuz, SedeV2Handle } from "./sede-v2-scene"

interface LogLine {
  id: string
  at: string
  text: string
  alerta?: boolean
  demo?: boolean
}

/** um evento do negócio vira 1 ou 2 passos na cena; a fila mostra um evento por vez */
interface QueueItem {
  steps: SedeEvento[]
  demo?: boolean
}

const QUEUE_MAX = 16
const STEP_MS = 1400
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
const pad = (i: number) => String(i).padStart(2, "0")

/** Uma jornada pelo prédio, só na cena (não grava nada): para mostrar a Sede quando o dia está parado. */
const DEMO: { type: string; name?: string }[] = [
  { type: "lead.created", name: "de demonstração" },
  { type: "lead.analyzed", name: "de demonstração" },
  { type: "lead.approved", name: "de demonstração" },
  { type: "lead.contacted", name: "de demonstração" },
  { type: "tarefa.concluida" },
  { type: "lead.replied", name: "de demonstração" },
  { type: "conteudo.etapa" },
  { type: "lead.proposal", name: "de demonstração" },
  { type: "member.invited", name: "Pessoa nova" },
  { type: "entrada.lancada" },
  { type: "lead.converted", name: "de demonstração" },
]

const LUZ: { value: SedeLuz; label: string; icon: typeof SunIcon }[] = [
  { value: "auto", label: "Auto", icon: SunMoonIcon },
  { value: "dia", label: "Dia", icon: SunIcon },
  { value: "noite", label: "Noite", icon: MoonIcon },
]

/**
 * Sede 3D v2 (plano 38, protótipo aprovado em docs/prototipos/sede-blender/web): torre de 14 andares
 * ligada aos eventos reais. Cada evento novo da tabela `events` (meu ou do sócio, pelo tempo real) vira
 * um pulso que sobe pela fachada até o andar da área; o histórico já carregado não é reencenado.
 * Os andares ocupados vêm das áreas da empresa (Configurações › Áreas).
 */
export function SedeView() {
  const stage = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const handle = useRef<SedeV2Handle | null>(null)
  const seen = useRef(new Set<string>())
  const openedAt = useRef(new Date().toISOString())
  const queue = useRef<QueueItem[]>([])
  const events = useEventFeed((s) => s.events)
  const agents = useAgents((s) => s.items)
  const leads = useStore((s) => s.leads)
  const areas = useAreaList()
  const { resolvedTheme } = useTheme()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [spin, setSpin] = useState(true)
  const [luz, setLuz] = useState<SedeLuz>("auto")
  const [status, setStatus] = useState<{ ativas: number; livres: number } | null>(null)
  const [hover, setHover] = useState<SedeHover | null>(null)
  const [floor, setFloor] = useState<SedeFloorInfo | null>(null)
  const [backlog, setBacklog] = useState({ pending: 0, skipped: 0 })
  const [log, setLog] = useState<LogLine[]>([])

  const ocupados = useMemo(() => sedeOcupados(areas), [areas])

  const push = (text: string, alerta?: boolean, demo?: boolean) => {
    const line: LogLine = { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), text, alerta, demo }
    setLog((l) => [line, ...l].slice(0, 10))
  }

  // monta a cena (o three.js só é baixado quando esta aba abre)
  useEffect(() => {
    let alive = true
    let h: SedeV2Handle | null = null
    import("./sede-v2-scene")
      .then(({ createSedeV2 }) => {
        if (!alive || !stage.current) return
        h = createSedeV2(stage.current, {
          onReady: () => alive && setReady(true),
          onError: () => alive && setFailed(true),
          onHover: (x) => alive && setHover(x),
          onFloor: (f) => alive && setFloor(f),
          onStatus: (s) => alive && setStatus(s),
          onLog: (text, alerta) => alive && push(text, alerta, true),
        })
        handle.current = h
        // só em desenvolvimento: deixa a cena inspecionável no console (stats, applyEvent)
        if (process.env.NODE_ENV !== "production") (window as unknown as { __sedeHZK?: SedeV2Handle }).__sedeHZK = h
      })
      .catch((err) => {
        console.error("[sede 3D]", err)
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
      h?.dispose()
      handle.current = null
    }
  }, [])

  // áreas da empresa → andares ocupados
  useEffect(() => {
    if (ready) handle.current?.setOcupados(ocupados)
  }, [ready, ocupados])

  // tema claro ou escuro do app: o horizonte da cena mistura com o fundo da página
  useEffect(() => {
    if (!ready) return
    const id = requestAnimationFrame(() => {
      const probe = document.createElement("div")
      probe.style.background = "var(--background)"
      probe.style.display = "none"
      document.body.appendChild(probe)
      const cor = getComputedStyle(probe).backgroundColor
      probe.remove()
      handle.current?.setFundo(cor, document.documentElement.classList.contains("dark"))
    })
    return () => cancelAnimationFrame(id)
  }, [ready, resolvedTheme])

  // fila: um evento por vez, para a rajada (importar 200 leads) não virar ruído
  useEffect(() => {
    if (!ready) return
    const id = setInterval(() => {
      const item = queue.current.shift()
      if (!item) return
      for (const s of item.steps) {
        handle.current?.applyEvent(s)
        push(s.label, s.alerta, item.demo)
      }
      setBacklog((b) => ({ ...b, pending: queue.current.length }))
    }, STEP_MS)
    return () => clearInterval(id)
  }, [ready])

  const enqueue = (item: QueueItem) => {
    queue.current.push(item)
    const over = Math.max(0, queue.current.length - QUEUE_MAX)
    if (over) queue.current.splice(0, over)
    setBacklog((b) => ({ pending: queue.current.length, skipped: b.skipped + over }))
  }

  // eventos novos → fila da cena
  useEffect(() => {
    if (!ready) return
    for (const e of freshForScene(events, seen.current, openedAt.current)) {
      seen.current.add(e.id)
      const name = e.event_type.startsWith("agent.") ? agents.find((a) => a.id === e.entity_id)?.name : e.event_type.startsWith("lead.") ? leads.find((l) => l.id === e.entity_id)?.name : undefined
      const steps = sedeEventsFor(e, name)
      if (steps.length) enqueue({ steps })
    }
  }, [events, ready, agents, leads])

  function demo() {
    const entity = `demo-${Date.now()}`
    for (const d of DEMO) {
      const steps = sedeEventsFor({ event_type: d.type as BusinessEvent["event_type"], entity_id: entity, metadata: d.name ? { name: d.name } : {} })
      if (steps.length) enqueue({ steps, demo: true })
    }
  }

  function toggleSpin() {
    const next = !spin
    setSpin(next)
    handle.current?.setAutoRotate(next)
  }

  function chooseLuz(mode: SedeLuz) {
    setLuz(mode)
    handle.current?.setLuz(mode)
  }

  // etiqueta do andar: vira para a esquerda perto da borda direita
  const tipLeft = hover && wrap.current ? hover.x > wrap.current.clientWidth - 220 : false
  const floorNames = useMemo(() => {
    const m = new Map(ocupados.map((o) => [o.andar, o.nome]))
    return Array.from({ length: SEDE_ANDARES }, (_, k) => ({ andar: k + 1, nome: m.get(k + 1) ?? "Disponível" }))
  }, [ocupados])

  return (
    <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div ref={wrap} className="relative min-w-0 overflow-hidden rounded-2xl border bg-muted shadow-card">
        <div ref={stage} className="h-[min(72vh,720px)] min-h-[420px] w-full" role="img" aria-label="Sede da HZK em 3D: torre de 14 andares; cada andar ocupado é uma área da empresa e os eventos sobem pela fachada até ele" />

        {/* cabeçalho */}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded-xl border bg-card/90 px-3 py-1.5 shadow-card backdrop-blur">
            <span className="grid size-7 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">Z</span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Sede HZK</p>
              <p className="tabular text-xs text-muted-foreground">{status ? `${status.ativas} áreas ativas · ${status.livres} andares livres` : "carregando…"}</p>
            </div>
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-0.5 rounded-lg border bg-card/90 p-0.5 shadow-card backdrop-blur" role="group" aria-label="Luz do prédio">
              {LUZ.map(({ value, label, icon: Icon }) => (
                <Button key={value} size="xs" variant={luz === value ? "secondary" : "ghost"} aria-pressed={luz === value} onClick={() => chooseLuz(value)} disabled={!ready} title={value === "auto" ? "Hora real: noite das 18 h às 6 h" : undefined}>
                  <Icon /> {label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={toggleSpin} aria-pressed={spin} disabled={!ready} title="Gira devagar quando ninguém mexe">
              <RotateCwIcon /> {spin ? "Girando" : "Parado"}
            </Button>
            <Button size="sm" variant="default" onClick={demo} disabled={!ready} title="Encena uma jornada pelo prédio. Não grava nada.">
              <PlayIcon /> Demonstração
            </Button>
          </div>
        </div>

        {/* etiqueta do andar sob o ponteiro */}
        {hover && !floor && (
          <div
            className="pointer-events-none absolute z-10 max-w-52 rounded-lg border bg-card/95 px-2.5 py-1.5 text-xs shadow-card backdrop-blur"
            style={{ left: hover.x, top: hover.y, transform: tipLeft ? "translate(calc(-100% - 14px), 14px)" : "translate(14px, 14px)" }}
          >
            <p className="font-semibold">
              <span className="tabular text-highlight">{pad(hover.andar)}</span> · {hover.nome}
            </p>
            <p className="text-muted-foreground">{hover.estado} · clique para entrar</p>
          </div>
        )}

        {/* cartão do andar aberto */}
        {floor && (
          <div className="absolute inset-x-3 bottom-3 z-10 grid gap-3 rounded-xl border bg-card/95 p-4 shadow-card backdrop-blur sm:right-auto sm:w-80" role="region" aria-label={`Andar ${pad(floor.andar)}`}>
            <div className="flex items-center gap-3">
              <span className="tabular grid size-10 shrink-0 place-items-center rounded-lg border border-highlight/30 bg-highlight-soft text-base font-bold text-highlight">{pad(floor.andar)}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{floor.nome}</p>
                <p className="text-xs text-muted-foreground">{floor.estado}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{floor.desc}</p>
            <div className="flex flex-wrap gap-2">
              {floor.livre && (
                <Button size="sm" variant="default" onClick={() => handle.current?.simularAreaNova()} title="Só na cena: não cria área nenhuma">
                  <TruckIcon /> Simular área nova
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => handle.current?.leaveFloor()}>
                <ArrowLeftIcon /> Voltar ao prédio
              </Button>
            </div>
          </div>
        )}

        {!ready && !failed && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Montando a Sede…</p>}
        {failed && <p className="absolute inset-0 grid place-items-center bg-muted px-6 text-center text-sm text-muted-foreground">Não deu para abrir o 3D neste navegador. O resto do AI Office continua funcionando.</p>}
      </div>

      <aside className="grid min-w-0 content-start gap-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Building2Icon className="size-4 text-muted-foreground" /> Ao vivo no prédio
          </h2>
          <ol className="grid gap-2 text-sm" aria-live="polite">
            {log.length === 0 && <li className="text-muted-foreground">Esperando o próximo evento. Cada lead cadastrado, analisado ou contatado aparece aqui e sobe pela fachada até o andar da área.</li>}
            {log.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2">
                <span className="tabular shrink-0 text-xs text-muted-foreground">{hhmm(l.at)}</span>
                <span className={cn("min-w-0 break-words", l.alerta && "text-highlight")}>
                  {l.text}
                  {l.demo && <span className="text-muted-foreground"> (demonstração)</span>}
                </span>
              </li>
            ))}
          </ol>
          {(backlog.pending > 0 || backlog.skipped > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {backlog.pending > 0 && `${backlog.pending} na fila para encenar. `}
              {backlog.skipped > 0 && `${backlog.skipped} eventos de uma rajada foram resumidos.`}
            </p>
          )}
        </div>

        <label className="grid gap-1.5 rounded-2xl border bg-card p-4 text-sm shadow-card">
          <span className="font-semibold">Entrar num andar</span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={floor?.andar ?? ""}
            disabled={!ready}
            onChange={(e) => {
              const i = Number(e.target.value)
              if (!i) return handle.current?.leaveFloor()
              if (floor) handle.current?.leaveFloor()
              setTimeout(() => handle.current?.enterFloor(i), floor ? 1600 : 0)
            }}
          >
            <option value="">Vista do prédio</option>
            {floorNames.map((f) => (
              <option key={f.andar} value={f.andar}>
                {pad(f.andar)} · {f.nome}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-muted-foreground">Cada andar ocupado é uma área da empresa; os livres esperam a próxima. Os robôs são a equipe de IA representada. Os eventos vêm da tabela de atividade, a mesma do histórico, e o valor de uma entrada nunca aparece aqui.</p>
      </aside>
    </section>
  )
}
