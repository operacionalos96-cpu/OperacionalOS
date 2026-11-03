"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { BotIcon, CheckIcon, LoaderIcon, TriangleAlertIcon, Undo2Icon, UserRoundIcon } from "lucide-react"
import { DEFAULT_AGENT, FREE_REPLY, agentPlan, blockersText, repliesForHuman, type AgentPlan, type AgentSettings } from "@/lib/domain/whatsapp-agent"
import type { Lead } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { agentSettings } from "@/lib/agent-store"
import { useFunnel } from "@/lib/funnel-store"
import { Field, Segmented } from "@/components/shared/fields"
import { Led } from "@/components/shared/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

const STATE_TEXT: Record<AgentPlan["state"], string> = {
  desligado: "Desligado: nada é enviado sozinho.",
  fora_do_horario: "Fora do horário de envio.",
  limite_do_dia: "Limite de envios do dia atingido.",
  aguardar: "Esperando o intervalo entre envios.",
  sem_tarefas: "Nada para enviar agora.",
  agir: "Pronto para enviar o próximo.",
}
const ACTION_TEXT = { responder: "responder", followup: "follow-up para", abertura: "abertura para" } as const

/**
 * Aba "Agente" (ADR 0018): liga/desliga o agente do WhatsApp, limites, horário e a base da oferta,
 * o que ele faria agora, quem ele passou para um humano e o que enviou por último.
 * As regras são as do servidor (src/lib/domain/whatsapp-agent.ts); a prévia daqui usa a mesma função.
 */
export function AgentTab({ leads, ownerId }: { leads: Lead[]; ownerId?: string }) {
  const steps = useFunnel((s) => s.steps)
  const [saved, setSaved] = useState<AgentSettings | null>(null)
  const [form, setForm] = useState<AgentSettings>(DEFAULT_AGENT)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    agentSettings
      .load()
      .then((data) => {
        setSaved(data)
        setForm(data)
      })
      .catch((e) => {
        // Sem servidor (ex.: modo demonstração): mostra o padrão, avisando que não é o que está salvo.
        setLoadError(e instanceof Error ? e.message : "falhou")
        setSaved(DEFAULT_AGENT)
        setForm(DEFAULT_AGENT)
      })
  }, [])

  const mine = leads.filter((l) => !ownerId || l.ownerId === ownerId)
  const now = new Date()
  const plan = agentPlan(mine, steps, saved ?? DEFAULT_AGENT, now, ownerId)
  const next = plan.action ? mine.find((l) => l.id === plan.action!.leadId) : undefined
  const handedOff = mine.filter((l) => l.agent?.needsHuman).sort((a, b) => b.agent!.needsHuman!.at.localeCompare(a.agent!.needsHuman!.at))
  const afterFunnel = repliesForHuman(mine, steps, now)
  const recent = mine
    .flatMap((l) => (l.agent?.sends ?? []).map((s) => ({ lead: l, ...s })))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 15)
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(form)
  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (k: "maxNewPerDay" | "maxSendsPerDay" | "startHour" | "endHour" | "gapMin" | "gapMax" | "replyGapMin" | "replyGapMax") => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value))

  async function save(patch: Partial<AgentSettings> = {}) {
    setBusy(true)
    try {
      const data = await agentSettings.save({ ...form, ...patch })
      setSaved(data)
      setForm(data)
      toast.success(data.enabled ? "Agente salvo e ligado" : "Agente salvo (desligado)")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não salvou")
    } finally {
      setBusy(false)
    }
  }

  async function release(id: string) {
    try {
      await agentSettings.release(id)
      toast.success("Devolvido para o agente")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não devolveu")
    }
  }

  if (!saved)
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <LoaderIcon className="size-4 animate-spin" /> Carregando o agente…
      </p>
    )

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="relative grid gap-4 overflow-hidden rounded-2xl border bg-card p-5 shadow-card">
        <Led corner="top" />
        <header className="relative flex flex-wrap items-start gap-3">
          <BotIcon className="mt-0.5 size-5 shrink-0 text-highlight" />
          <div className="min-w-0 flex-1 basis-52">
            <h2 className="text-lg font-semibold">Agente do WhatsApp</h2>
            <p className="text-sm text-muted-foreground">Envia o funil e responde os leads sozinho, pela extensão no WhatsApp Web do seu computador.</p>
          </div>
          <Segmented
            value={saved.enabled ? "on" : "off"}
            onChange={(v) => void save({ enabled: v === "on" })}
            options={[
              { value: "off", label: "Desligado" },
              { value: "on", label: "Ligado" },
            ]}
          />
        </header>

        {loadError && <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-warning">Não consegui carregar a configuração salva ({loadError}). Mostrando os valores padrão.</p>}

        <div className="grid gap-1 rounded-xl border bg-background/40 p-3 text-sm">
          <p className="font-medium">{STATE_TEXT[plan.state]}</p>
          {next && plan.action && (
            <p className="text-muted-foreground">
              Próximo: {ACTION_TEXT[plan.action.kind]} <Link href={`/pipeline/${next.id}`} className="font-medium text-foreground hover:underline">{next.name}</Link>
            </p>
          )}
          {plan.blockers && !plan.counts.openings && <p className="text-xs text-warning">{blockersText(plan.blockers)} {plan.blockers.sem_celular ? "Cadastre o celular no lead para ele entrar." : ""}</p>}
          <p className="tabular text-xs text-muted-foreground">
            Hoje: {plan.counts.sent}/{saved.maxSendsPerDay} envios · {plan.counts.opened}/{saved.maxNewPerDay} conversas novas · na fila: {plan.counts.replies} respostas, {plan.counts.followups} follow-ups, {plan.counts.openings} aberturas
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Conversas novas por dia">
            <Input type="number" min={0} max={200} value={form.maxNewPerDay} onChange={num("maxNewPerDay")} />
          </Field>
          <Field label="Envios por dia" hint="tudo somado">
            <Input type="number" min={0} max={500} value={form.maxSendsPerDay} onChange={num("maxSendsPerDay")} />
          </Field>
          <Field label="Fim de semana">
            <Segmented
              value={form.weekends ? "sim" : "nao"}
              onChange={(v) => set("weekends", v === "sim")}
              options={[
                { value: "nao", label: "Não envia" },
                { value: "sim", label: "Envia" },
              ]}
            />
          </Field>
          <Field label="Horário" hint="Brasília">
            <span className="flex items-center gap-2 text-sm">
              das <Input type="number" min={0} max={23} value={form.startHour} onChange={num("startHour")} className="w-20" /> às <Input type="number" min={1} max={24} value={form.endHour} onChange={num("endHour")} className="w-20" /> h
            </span>
          </Field>
          <Field label="Intervalo entre envios" hint="aberturas e follow-ups, minutos">
            <span className="flex items-center gap-2 text-sm">
              de <Input type="number" min={1} max={120} value={form.gapMin} onChange={num("gapMin")} className="w-20" /> a <Input type="number" min={1} max={240} value={form.gapMax} onChange={num("gapMax")} className="w-20" />
            </span>
          </Field>
          <Field label="Tempo para responder" hint="quem respondeu vem primeiro, minutos">
            <span className="flex items-center gap-2 text-sm">
              de <Input type="number" min={0} max={60} value={form.replyGapMin} onChange={num("replyGapMin")} className="w-20" /> a <Input type="number" min={0} max={120} value={form.replyGapMax} onChange={num("replyGapMax")} className="w-20" />
            </span>
          </Field>
        </div>

        <Field label="Base da oferta" hint="a IA só afirma o que estiver aqui">
          <Textarea
            value={form.offer}
            onChange={(e) => set("offer", e.target.value)}
            rows={7}
            placeholder={"O que vocês fazem, para quem, preço ou faixa, prazo, como funciona e links que podem ser enviados.\nEx.: Site novo em 7 dias, a partir de R$ 1.500. Portfólio: hzk.com.br/portfolio"}
          />
        </Field>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => setForm(saved)} disabled={busy}>
              Desfazer
            </Button>
          )}
          <Button onClick={() => void save()} disabled={busy || !dirty}>
            <CheckIcon /> Salvar
          </Button>
        </div>

        <p className="flex gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
          <TriangleAlertIcon className="size-4 shrink-0 text-warning" />
          <span>
            Funciona pelo WhatsApp Web (sem a API oficial): o número pode ser banido. Comece com poucas conversas novas por dia. Para enviar, ligue também a chave <b>Agente</b> no painel da extensão, com o token gerado em Funil › Conectar extensão.
          </span>
        </p>
      </section>

      <div className="grid gap-4">
        <section className="grid gap-2">
          <h3 className="t-label">Precisa de humano ({handedOff.length + afterFunnel.length})</h3>
          {handedOff.length + afterFunnel.length ? (
            <ul className="divide-y rounded-xl border bg-card">
              {handedOff.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <UserRoundIcon className="size-4 shrink-0 text-warning" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/pipeline/${l.id}`} className="truncate text-sm font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.agent!.needsHuman!.reason} · {relative(l.agent!.needsHuman!.at)}
                    </p>
                  </div>
                  <Button size="xs" variant="outline" onClick={() => void release(l.id)} title="Você já resolveu: o agente volta a cuidar deste lead">
                    <Undo2Icon /> Devolver ao agente
                  </Button>
                </li>
              ))}
              {afterFunnel.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <UserRoundIcon className="size-4 shrink-0 text-success" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/pipeline/${l.id}`} className="truncate text-sm font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">respondeu depois do fim do funil {l.funnel?.repliedAt ? relative(l.funnel.repliedAt) : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-desc py-6 text-center text-sm">Nenhum lead esperando um humano.</p>
          )}
        </section>

        <section className="grid gap-2">
          <h3 className="t-label">Últimos envios do agente</h3>
          {recent.length ? (
            <ul className="divide-y rounded-xl border bg-card">
              {recent.map((x) => (
                <li key={`${x.lead.id}-${x.at}`} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/pipeline/${x.lead.id}`} className="truncate text-sm font-medium hover:underline">
                      {x.lead.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{x.step === FREE_REPLY ? "resposta escrita pela IA" : (steps[x.step]?.label ?? `passo ${x.step + 1}`)}</p>
                  </div>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">{relative(x.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-desc py-6 text-center text-sm">O agente ainda não enviou nada.</p>
          )}
        </section>
      </div>
    </div>
  )
}
