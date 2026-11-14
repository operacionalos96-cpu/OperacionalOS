"use client"

import { CheckIcon, ChevronDownIcon, LockIcon, MonitorIcon, OctagonXIcon, PlayIcon, ShieldCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, Hint, Tag } from "@/components/dock/ui"
import { DockAvatar } from "@/components/dock/dock-avatar"
import { LEVELS, LOCKED_LEVEL_REASON, levelReleased } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { cn } from "@/lib/utils"

const ALWAYS = [
  "Apagar vai para a lixeira",
  "Fora das pastas liberadas, pede você",
  "Senhas e chaves: pede você",
  "Instalar ou remover programas: pede você",
  "Pagar, comprar ou enviar mensagem: pede você",
  "O bot nunca vê suas chaves nem seu login",
]

/** PC: o "Parar tudo", o estado da Ponte, os níveis (em anéis) e as proteções recolhidas. */
export default function DockPcPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const allPaused = d.agents.length > 0 && d.agents.every((a) => a.paused)
  const stopAll = (paused: boolean) =>
    run(async (api) => {
      for (const a of d.agents) if (a.paused !== paused) await api.setPaused(a.id, paused)
    }, paused ? "Tudo parado." : "Retomado.")
  const seen = d.bridge.lastSeenAt ? new Date(d.bridge.lastSeenAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className={cn("flex items-center gap-4", allPaused && "shadow-[0_0_0_1.5px_var(--danger)]")}>
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", d.bridge.online ? "bg-success-soft text-success" : "bg-foreground/[0.06] text-muted-foreground")}><MonitorIcon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="t-title">Este PC</h3>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className={cn("size-2 rounded-full", allPaused ? "bg-danger" : d.bridge.online ? "bg-success" : "bg-muted-foreground/40")} />
            {allPaused ? "Parado" : d.bridge.online ? `Ligado${seen ? ` · ${seen}` : ""}` : "Desligado"}
          </p>
        </div>
        <Hint text={allPaused ? "Os bots voltam a trabalhar" : "Para na hora todos os seus bots"}>
          <Button variant={allPaused ? "outline" : "destructive"} onClick={() => stopAll(!allPaused)}>{allPaused ? <><PlayIcon />Retomar</> : <><OctagonXIcon />Parar tudo</>}</Button>
        </Hint>
      </Card>

      <Card className="grid grid-cols-4 gap-1.5">
        {LEVELS.map((l) => {
          const locked = !levelReleased(l.n)
          return (
            <Hint key={l.n} text={locked ? LOCKED_LEVEL_REASON : l.text}>
              <div className={cn("relative grid justify-items-center gap-1.5 rounded-[11px] py-2 text-center text-xs", locked && "opacity-40")}>
                <DockAvatar name="" glyph=" " level={l.n} size={40} />
                <span className="font-medium">{l.title}</span>
                {locked && <LockIcon className="absolute top-1 right-2 size-3 text-muted-foreground" />}
              </div>
            </Hint>
          )
        })}
      </Card>

      <Card className="lg:col-span-2">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <ShieldCheckIcon className="size-5 text-success" />
            <span className="flex-1 text-sm font-semibold">Proteções sempre ligadas</span>
            <Tag>{ALWAYS.length}</Tag>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-3 grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-2">{ALWAYS.map((t) => <li key={t} className="flex items-center gap-2"><CheckIcon className="size-4 shrink-0 text-success" />{t}</li>)}</ul>
        </details>
      </Card>
    </div>
  )
}
