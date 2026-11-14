"use client"

import { CheckIcon, MonitorIcon, OctagonXIcon, PlayIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, Label, Tag } from "@/components/dock/ui"
import { LEVELS, LOCKED_LEVEL_REASON, levelReleased } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"

const ALWAYS = [
  "Apagar fora das pastas liberadas pede você",
  "Senhas, cofre do navegador e chaves: sempre pede você",
  "Instalar ou remover programas do sistema: sempre pede você",
  "Pagar, comprar, mandar mensagem, e-mail ou post: sempre pede você",
  "Apagar manda para a lixeira, nunca apaga de vez",
  "O bot nunca vê as chaves de IA nem o seu login",
]

/** Configurações do PC: a Ponte, o "Parar tudo", os níveis e as proteções sempre ligadas. */
export default function DockPcPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const allPaused = d.agents.length > 0 && d.agents.every((a) => a.paused)
  const stopAll = (paused: boolean) =>
    run(async (api) => {
      for (const a of d.agents) if (a.paused !== paused) await api.setPaused(a.id, paused)
    }, paused ? "Tudo parado: nenhum bot age no PC nem na empresa até você retomar." : "Retomado.")

  return (
    <div className="grid gap-4">
      <Card className={`flex flex-wrap items-center gap-4 ${allPaused ? "shadow-[0_0_0_1.5px_var(--danger)]" : ""}`}>
        <span className="grid size-11 place-items-center rounded-full bg-danger-soft text-danger"><OctagonXIcon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="t-title">{allPaused ? "Tudo parado" : "Parar tudo"}</h3>
          <p className="t-desc">{allPaused ? "Nenhum bot age. As conversas e a fila ficam salvas." : "Para na hora todos os seus bots, no PC e na empresa."}</p>
        </div>
        <Button variant={allPaused ? "outline" : "destructive"} onClick={() => stopAll(!allPaused)}>{allPaused ? <><PlayIcon />Retomar tudo</> : <><OctagonXIcon />Parar tudo</>}</Button>
      </Card>

      <Card className="grid gap-2">
        <div className="flex items-center gap-2"><MonitorIcon className="size-4" /><h3 className="t-title flex-1">Ponte HZK</h3>
          {d.bridge.online ? <Tag className="bg-success-soft text-success">ligada</Tag> : <Tag>desligada</Tag>}
        </div>
        <p className="t-desc">{d.bridge.online ? `Último sinal ${d.bridge.lastSeenAt ? new Date(d.bridge.lastSeenAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora"}.` : "Sem o app para PC ligado, as conversas ficam salvas e a fila espera."}</p>
        <p className="t-desc">As pastas liberadas, as chaves das IAs e o registro do que cada bot fez no PC ficam no app para PC, neste computador: não passam pelo servidor.</p>
      </Card>

      <Card className="grid gap-2">
        <h3 className="t-title">Níveis de acesso</h3>
        <p className="t-desc">Todo bot nasce no nível 0. Você sobe bot por bot, no Configurar.</p>
        {LEVELS.map((l) => (
          <div key={l.n} className={`flex items-center gap-3 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm ${levelReleased(l.n) ? "" : "opacity-55"}`}>
            <b className="w-6">{l.n}</b><span className="flex-1"><b>{l.title}</b> · {l.text}</span>
            {!levelReleased(l.n) && <Tag title={LOCKED_LEVEL_REASON}>depois</Tag>}
          </div>
        ))}
        <Label>Sempre ligado, em qualquer nível</Label>
        <ul className="grid gap-1.5 text-sm">{ALWAYS.map((t) => <li key={t} className="flex items-center gap-2"><CheckIcon className="size-4 text-success" />{t}</li>)}</ul>
      </Card>
    </div>
  )
}
