"use client"

import { useEffect, useState } from "react"
import { CheckIcon, ChevronDownIcon, CircleDotIcon, CloudIcon, LockIcon, MonitorIcon, OctagonXIcon, PlayIcon, ShieldCheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, Hint, Tag } from "@/components/dock/ui"
import { DockAvatar } from "@/components/dock/dock-avatar"
import { LEVELS, LOCKED_LEVEL_REASON, levelReleased } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { desktopFloat } from "@/lib/desktop-bridge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/**
 * Proteções sempre ligadas (nota 26; motor em desktop/src/engine). Cada frase diz do que a pessoa está
 * protegida e o que acontece, e vale nos níveis liberados hoje (0 e 1). Não prometer o que o motor não faz.
 */
const ALWAYS: { title: string; text: string }[] = [
  { title: "Nada some de vez", text: "Se um bot apagar um arquivo, ele vai para a Lixeira do Windows e você recupera quando quiser. Uma pasta que você liberou nunca é apagada inteira." },
  { title: "O bot só entra onde você deixou", text: "Ele só abre e grava arquivos nas pastas que você liberou para ele. O resto do seu PC fica fechado, e o app confere cada arquivo antes." },
  { title: "Suas senhas ficam com você", text: "Nenhum bot tem acesso às senhas salvas no seu PC ou no navegador, e nenhum bot digita senha. Se alguma coisa pedir senha, quem digita é você." },
  { title: "Suas chaves ficam trancadas", text: "As chaves das IAs e o seu login ficam guardados no cofre do Windows. Só o app usa, e o bot nunca chega a ver." },
  { title: "Seus programas ficam intactos", text: "Um bot não instala, não remove e não abre programas no seu PC. Ele conversa e, se você liberar, trabalha só nas pastas escolhidas." },
  { title: "Nada sai em seu nome sem você", text: "Pagar ou mandar mensagem, e-mail ou post sempre espera você aprovar antes. Se envolver dinheiro, um founder também precisa aprovar." },
  { title: "Texto de fora não dá ordem", text: "O que o bot lê num site, arquivo ou e-mail vale só como informação. Se isso levar a um pedido, ele chega para você com o aviso \"veio de fora\"." },
  { title: "Tudo fica anotado", text: "O app anota cada arquivo que um bot abriu, criou ou mandou para a lixeira, num registro que só você vê." },
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
                <DockAvatar name="" level={l.n} size={40} />
                <span className="font-medium">{l.title}</span>
                {locked && <LockIcon className="absolute top-1 right-2 size-3 text-muted-foreground" />}
              </div>
            </Hint>
          )
        })}
      </Card>

      <CloudEngineCard />

      <Card className="lg:col-span-2">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
            <ShieldCheckIcon className="size-5 text-success" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Proteções sempre ligadas</span>
              <span className="block text-xs text-muted-foreground">Como você está protegido, com qualquer bot. Toque para ver.</span>
            </span>
            <Tag>{ALWAYS.length}</Tag>
            <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-3 grid gap-x-6 gap-y-3 border-t border-border pt-3 text-sm sm:grid-cols-2">
            {ALWAYS.map((t) => (
              <li key={t.title} className="flex items-start gap-2.5">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                <span><b className="font-semibold">{t.title}.</b> <span className="text-muted-foreground">{t.text}</span></span>
              </li>
            ))}
          </ul>
        </details>
      </Card>

      <DesktopFloatCard />
    </div>
  )
}

/**
 * Motor na nuvem (ADR 0026): os bots desta pessoa respondem pelo servidor, sem o app no PC, com o
 * OpenRouter da empresa. O texto diz o que muda (a conversa passa pelo servidor) e o que falta fazer.
 */
function CloudEngineCard() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const [busy, setBusy] = useState(false)
  const hasOR = d.connections.some((c) => c.provider === "openrouter" && c.status !== "desligada")
  const botsOnOR = d.agents.filter((a) => d.connections.find((c) => c.id === a.connectionId)?.provider === "openrouter").length

  async function toggle() {
    if (busy) return
    setBusy(true)
    await run((api) => api.setCloudEngine(!d.cloud), d.cloud ? "Motor na nuvem desligado." : "Motor na nuvem ligado.")
    setBusy(false)
  }

  const next = !d.cloud
    ? null
    : !hasOR
      ? "Falta um passo: em Provedores, conecte o OpenRouter. Depois escolha o OpenRouter como IA de cada bot."
      : botsOnOR === 0
        ? "Falta um passo: abra cada bot e escolha o OpenRouter como IA."
        : `${botsOnOR} ${botsOnOR === 1 ? "bot usa" : "bots usam"} o OpenRouter e já ${botsOnOR === 1 ? "responde" : "respondem"} pela nuvem.`

  return (
    <Card className={cn("flex items-center gap-4 lg:col-span-2", d.cloud && "shadow-[0_0_0_1.5px_var(--success)]")}>
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", d.cloud ? "bg-success-soft text-success" : "bg-foreground/[0.06] text-muted-foreground")}><CloudIcon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <h3 id="cloud-title" className="t-title">Motor na nuvem</h3>
        <p id="cloud-text" className="text-sm text-muted-foreground">
          Seus bots respondem sem nada instalado no seu PC, usando o OpenRouter da empresa. As suas conversas com os bots passam pelo servidor da HZK. Nada de pastas do PC por aqui.
        </p>
        {next && <p className="mt-1 text-xs">{next}</p>}
        {d.cloud && <p className="mt-1 text-xs text-muted-foreground">A resposta pode levar até 1 minuto para começar. A cota do OpenRouter é dividida com o time.</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={d.cloud}
        aria-labelledby="cloud-title"
        aria-describedby="cloud-text"
        disabled={busy}
        onClick={toggle}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50", d.cloud ? "bg-success" : "bg-foreground/15")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", d.cloud ? "left-[18px]" : "left-0.5")} />
      </button>
    </Card>
  )
}

/**
 * Bolinha na área de trabalho (opcional, só no app para PC): com o app minimizado, uma bolinha mostra se
 * os bots estão trabalhando. Usa window.opos.float; no navegador ou em app antigo, fica desabilitada.
 */
function DesktopFloatCard() {
  const [state, setState] = useState<{ available: boolean; enabled: boolean; busy: boolean }>({ available: false, enabled: false, busy: false })
  useEffect(() => {
    const f = desktopFloat()
    if (!f) return
    let alive = true
    f.get()
      .then((r) => alive && setState({ available: true, enabled: !!r?.enabled, busy: false }))
      .catch(() => alive && setState({ available: false, enabled: false, busy: false }))
    return () => {
      alive = false
    }
  }, [])

  async function toggle() {
    const f = desktopFloat()
    if (!f || state.busy) return
    const want = !state.enabled
    setState((s) => ({ ...s, enabled: want, busy: true }))
    try {
      const r = await f.set(want)
      setState({ available: true, enabled: !!r?.enabled, busy: false })
    } catch {
      setState((s) => ({ ...s, enabled: !want, busy: false }))
      toast.error("Não deu para mudar a bolinha agora. Tente de novo.")
    }
  }

  const on = state.available && state.enabled
  return (
    <Card className="flex items-center gap-4 lg:col-span-2">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground"><CircleDotIcon className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <h3 id="float-title" className="t-title">Bolinha na área de trabalho</h3>
        <p id="float-text" className="text-sm text-muted-foreground">
          Quando você minimiza o app, uma bolinha fica na tela mostrando se seus bots estão trabalhando. Clique nela para voltar.
          {!state.available && <span className="block text-xs">Disponível no app para PC.</span>}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="float-title"
        aria-describedby="float-text"
        disabled={!state.available || state.busy}
        onClick={toggle}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50", on ? "bg-success" : "bg-foreground/15")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </Card>
  )
}
