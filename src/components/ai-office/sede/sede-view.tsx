"use client"

import { useEffect, useRef, useState } from "react"
import { Building2Icon, PlayIcon, RotateCwIcon } from "lucide-react"
import { freshForScene, sceneActionFor, type SceneAction } from "@/lib/domain/office-scene"
import type { BusinessEvent } from "@/lib/domain/ai-office"
import { useEventFeed } from "@/lib/event-service"
import { useAgents } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import type { SedeHandle, SedeStats } from "./sede-scene"

interface LogLine {
  id: string
  at: string
  text: string
  tone: "lead" | "entrega" | "neutro"
  demo?: boolean
}

const toneOf = (a: SceneAction): LogLine["tone"] => (a.kind === "send" ? "entrega" : a.kind === "arrive" || a.kind === "transfer" ? "lead" : "neutro")
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

/** Uma jornada completa de lead, só na cena (não grava nada): para mostrar o prédio quando o dia está parado. */
const DEMO: BusinessEvent["event_type"][] = ["lead.created", "lead.analyzed", "lead.approved", "lead.contacted", "lead.replied", "lead.proposal", "lead.converted"]

/**
 * Sede 3D ligada aos eventos reais (ADR 0021): cada evento novo da tabela `events` (meu ou do sócio,
 * pelo tempo real) vira uma ação da cena. O histórico já carregado não é reencenado.
 */
export function SedeView() {
  const stage = useRef<HTMLDivElement>(null)
  const handle = useRef<SedeHandle | null>(null)
  const seen = useRef(new Set<string>())
  const openedAt = useRef(new Date().toISOString())
  const events = useEventFeed((s) => s.events)
  const agents = useAgents((s) => s.items)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [spin, setSpin] = useState(true)
  const [stats, setStats] = useState<SedeStats | null>(null)
  const [backlog, setBacklog] = useState({ pending: 0, skipped: 0 })
  const [log, setLog] = useState<LogLine[]>([])

  // monta a cena (o three.js só é baixado quando esta aba abre)
  useEffect(() => {
    let alive = true
    let h: SedeHandle | null = null
    import("./sede-scene")
      .then(({ createSede }) => {
        if (!alive || !stage.current) return
        h = createSede(stage.current, {
          assets: { symbol: "/escritorio/hzk-simbolo.png", wordmark: "/escritorio/hzk-horizontal.png" },
          onStats: setStats,
          onQueue: (pending, skipped) => setBacklog({ pending, skipped }),
          // a linha entra no registro quando a cena começa a encenar o passo, não quando o evento chega
          onAction: (a) => {
            const demo = "entity" in a && a.entity.startsWith("demo-")
            const line: LogLine = { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), text: a.text, tone: toneOf(a), demo }
            setLog((l) => [line, ...l].slice(0, 8))
          },
        })
        handle.current = h
        setReady(true)
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

  // eventos novos → cena + linha no registro
  useEffect(() => {
    if (!ready || !handle.current) return
    for (const e of freshForScene(events, seen.current, openedAt.current)) {
      seen.current.add(e.id)
      const name = e.event_type.startsWith("agent.") ? agents.find((a) => a.id === e.entity_id)?.name : undefined
      const action = sceneActionFor(e, name)
      if (action) handle.current.play(action)
    }
  }, [events, ready, agents])

  function demo() {
    const h = handle.current
    if (!h) return
    const entity = `demo-${Date.now()}`
    for (const type of DEMO) {
      const action = sceneActionFor({ event_type: type, entity_id: entity, metadata: { name: "de demonstração" } })
      if (action) h.play(action)
    }
  }

  function toggleSpin() {
    const next = !spin
    setSpin(next)
    handle.current?.setAutoRotate(next)
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="relative overflow-hidden rounded-2xl border shadow-card" style={{ background: "radial-gradient(120% 90% at 50% 38%, #1C2740 0%, #111827 55%, #0B1120 100%)" }}>
        <div ref={stage} className="h-[min(72vh,720px)] min-h-[420px] w-full" role="img" aria-label="Sede da HZK em 3D: prédio em corte com os robôs trabalhando e os dados passando entre os andares" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={toggleSpin} aria-pressed={spin}>
            <RotateCwIcon /> {spin ? "Girando" : "Parado"}
          </Button>
          <Button size="sm" variant="secondary" onClick={demo} disabled={!ready} title="Encena uma jornada completa de lead. Não grava nada.">
            <PlayIcon /> Demonstração
          </Button>
        </div>
        {!ready && !failed && <p className="absolute inset-0 grid place-items-center text-sm text-slate-300">Montando o prédio…</p>}
        {failed && <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-300">Não deu para abrir o 3D neste navegador. O resto do AI Office continua funcionando.</p>}
      </div>

      <aside className="grid content-start gap-4">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Building2Icon className="size-4 text-muted-foreground" /> Ao vivo no prédio
          </h2>
          <ol className="grid gap-2 text-sm" aria-live="polite">
            {log.length === 0 && <li className="text-muted-foreground">Esperando o próximo evento. Cada lead cadastrado, analisado ou contatado aparece aqui e viaja pelo prédio.</li>}
            {log.map((l) => (
              <li key={l.id} className="flex items-baseline gap-2">
                <span className="tabular shrink-0 text-xs text-muted-foreground">{hhmm(l.at)}</span>
                <span className={l.tone === "entrega" ? "text-highlight" : undefined}>
                  {l.text}
                  {l.demo && <span className="text-muted-foreground"> (demonstração)</span>}
                </span>
              </li>
            ))}
          </ol>
          {(backlog.pending > 1 || backlog.skipped > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {backlog.pending > 1 && `${backlog.pending - 1} na fila para encenar. `}
              {backlog.skipped > 0 && `${backlog.skipped} eventos de uma rajada foram resumidos.`}
            </p>
          )}
        </div>
        {stats && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl border bg-card p-4 text-sm shadow-card">
            {(
              [
                ["Trabalhando", stats.trabalhando],
                ["Andando", stats.andando],
                ["Em pausa", stats.pausa],
                ["Conversando", stats.conversando],
                ["No elevador", stats.elevador],
                ["Esperando decisão", stats.esperando],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-xs text-muted-foreground">Os robôs são a equipe de IA representada; o andar mostra o tipo de trabalho, não pessoas. Os eventos vêm da tabela de atividade, a mesma do histórico.</p>
      </aside>
    </section>
  )
}
