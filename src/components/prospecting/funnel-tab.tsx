"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, MessageCircleIcon, MicIcon, PlugIcon, PlusIcon, ReplyIcon, SettingsIcon, Trash2Icon, TypeIcon, VideoIcon, XIcon } from "lucide-react"
import type { WhatsappTarget } from "@/lib/domain/contact"
import { followupsDue, nextStep, renderTemplate, type FunnelStep } from "@/lib/domain/funnel"
import type { Lead } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { useFunnel } from "@/lib/funnel-store"
import { markReplied, stopFunnel } from "@/lib/services/ai-office"
import { openWhatsapp } from "@/lib/whatsapp-open"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { opsAction } from "@/components/ai-office/ops-store"
import { RevealOnce } from "@/components/ai-office/webhooks-panel"

export const KIND_ICON = { texto: TypeIcon, audio: MicIcon, video: VideoIcon } as const
const KIND_LABEL = { texto: "Texto", audio: "Áudio", video: "Vídeo" } as const

export type FunnelPending = { leadId: string; name: string; message: string; step: number }

/**
 * Aba "Funil": quem precisa do próximo passo hoje (por dias ou porque respondeu) e quem
 * está esperando resposta. Áudio e vídeo mostram o roteiro; você grava e envia no WhatsApp.
 */
export function FunnelTab({ leads, ownerId, whatsTarget, onPending }: { leads: Lead[]; ownerId?: string; whatsTarget: WhatsappTarget; onPending: (p: FunnelPending) => void }) {
  const steps = useFunnel((s) => s.steps)
  const now = new Date()
  const due = followupsDue(leads, steps, now, ownerId)
  const waiting = leads
    .filter((l) => l.contactStatus === "contacted" && (!ownerId || l.ownerId === ownerId))
    .flatMap((l) => {
      const n = nextStep(l, steps, now)
      return n && n.waitingReply ? [{ lead: l, ...n }] : []
    })
    .sort((a, b) => (b.lead.funnel?.lastSentAt ?? "").localeCompare(a.lead.funnel?.lastSentAt ?? ""))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {steps.map((s, i) => `${i + 1}. ${s.label}`).join(" → ")}
        </p>
        <ConnectExtension />
        <FunnelEditorButton />
      </div>

      <section className="grid gap-2">
        <h3 className="t-label">Fazer agora ({due.length})</h3>
        {due.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {due.map((x) => (
              <StepRow key={x.lead.id} lead={x.lead} index={x.index} step={x.step} total={steps.length} detail={x.step.trigger === "resposta" ? `respondeu ${x.dueAt ? relative(x.dueAt.toISOString()) : ""}` : `vence ${relative(x.dueAt.toISOString())}`} whatsTarget={whatsTarget} onPending={onPending} />
            ))}
          </ul>
        ) : (
          <p className="t-desc py-6 text-center text-sm">Nenhum passo do funil para hoje.</p>
        )}
      </section>

      <section className="grid gap-2">
        <h3 className="t-label">Esperando resposta ({waiting.length})</h3>
        {waiting.length ? (
          <ul className="divide-y rounded-xl border bg-card">
            {waiting.map((x) => (
              <li key={x.lead.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Link href={`/pipeline/${x.lead.id}`} className="truncate text-sm font-medium hover:underline">
                    {x.lead.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    mandou o passo {x.index} {x.lead.funnel?.lastSentAt ? relative(x.lead.funnel.lastSentAt) : ""} · próximo: {x.step.label}
                  </p>
                </div>
                <Button size="xs" variant="outline" onClick={() => markReplied(x.lead.id)} title="Libera o próximo passo">
                  <ReplyIcon /> Ele respondeu
                </Button>
                <Button size="xs" variant="ghost" onClick={() => stopFunnel(x.lead.id)} title="Tirar do funil">
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-desc py-6 text-center text-sm">Ninguém esperando resposta.</p>
        )}
      </section>
    </div>
  )
}

function StepRow({ lead, index, step, total, detail, whatsTarget, onPending }: { lead: Lead; index: number; step: FunnelStep; total: number; detail: string; whatsTarget: WhatsappTarget; onPending: (p: FunnelPending) => void }) {
  const Icon = KIND_ICON[step.kind]
  const text = step.template ? renderTemplate(step.template, lead, new Date()) : ""
  const script = step.script ? renderTemplate(step.script, lead, new Date()) : ""
  const [open, setOpen] = useState(false)
  return (
    <li className="grid gap-2 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <Icon className="size-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <Link href={`/pipeline/${lead.id}`} className="truncate text-sm font-medium hover:underline">
            {lead.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            Passo {index + 1}/{total}: {step.label} · {detail}
          </p>
        </div>
        {script && (
          <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)}>
            Roteiro
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            if (!openWhatsapp(lead.contact, text, whatsTarget)) return toast.warning("Lead sem WhatsApp válido")
            if (step.kind !== "texto") toast(`Grave e envie o ${step.kind === "audio" ? "áudio" : "vídeo"} na conversa`, { description: text ? "O texto de acompanhamento já está na caixa." : undefined })
            onPending({ leadId: lead.id, name: lead.name, message: text, step: index })
          }}
        >
          <MessageCircleIcon /> {step.kind === "texto" ? "Abrir com a mensagem" : "Abrir conversa"}
        </Button>
      </div>
      {open && script && <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 font-sans text-xs">{script}</pre>}
    </li>
  )
}

/** Gera o token da extensão (só o escopo do funil). Aparece UMA vez. */
function ConnectExtension() {
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            setToken((await opsAction<{ token: string }>("ext.connect", {})).token)
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Não foi possível gerar")
          } finally {
            setBusy(false)
          }
        }}
      >
        <PlugIcon /> Conectar extensão
      </Button>
      {token && (
        <RevealOnce
          title="Token da extensão do WhatsApp"
          value={token}
          hint="Cole no ícone da extensão “Funil Operacional OS” (Chrome). Ele só acha leads e registra envio/resposta — não lê o Cofre nem mexe em outras coisas. Para desligar: AI Office › Workers."
          onClose={() => setToken(null)}
        />
      )}
    </>
  )
}

function FunnelEditorButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <SettingsIcon /> Editar funil
      </Button>
      {open && <FunnelEditor onClose={() => setOpen(false)} />}
    </>
  )
}

function FunnelEditor({ onClose }: { onClose: () => void }) {
  const saved = useFunnel((s) => s.steps)
  const save = useFunnel((s) => s.save)
  const [steps, setSteps] = useState<FunnelStep[]>(saved)
  const [busy, setBusy] = useState(false)
  useEffect(() => setSteps(saved), [saved])
  const patch = (i: number, p: Partial<FunnelStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, d: number) =>
    setSteps((s) => {
      const j = i + d
      if (j < 0 || j >= s.length) return s
      const c = [...s]
      ;[c[i], c[j]] = [c[j], c[i]]
      return c
    })

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Funil de WhatsApp</DialogTitle>
          <DialogDescription>
            Variáveis: [segmento] [cidade/região] [empresa] [nome] ou {"{saudacao} {empresa} {problema} {site}"}. Nada é enviado sozinho — você sempre aperta Enter.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3">
          {steps.map((s, i) => (
            <li key={s.id + i} className="grid gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="t-label">{i + 1}</span>
                <Input value={s.label} onChange={(e) => patch(i, { label: e.target.value })} className="h-8 min-w-40 flex-1" aria-label="Nome do passo" />
                <div className="flex rounded-lg border p-0.5 text-xs">
                  {(["texto", "audio", "video"] as const).map((k) => {
                    const I = KIND_ICON[k]
                    return (
                      <button key={k} type="button" onClick={() => patch(i, { kind: k })} className={cn("flex items-center gap-1 rounded-md px-2 py-1", s.kind === k ? "bg-accent font-medium" : "text-muted-foreground")}>
                        <I className="size-3" /> {KIND_LABEL[k]}
                      </button>
                    )
                  })}
                </div>
                <Button size="icon-xs" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">
                  <ArrowUpIcon />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => move(i, 1)} disabled={i === steps.length - 1} aria-label="Descer">
                  <ArrowDownIcon />
                </Button>
                <Button size="icon-xs" variant="ghost" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} disabled={steps.length === 1} aria-label="Remover">
                  <Trash2Icon />
                </Button>
              </div>
              {i > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Quando:</span>
                  <button type="button" onClick={() => patch(i, { trigger: "resposta" })} className={cn("rounded-md border px-2 py-1", s.trigger === "resposta" && "border-brand bg-accent font-medium")}>
                    depois que ele responder
                  </button>
                  <button type="button" onClick={() => patch(i, { trigger: "dias", delayDays: s.delayDays || 2 })} className={cn("rounded-md border px-2 py-1", s.trigger === "dias" && "border-brand bg-accent font-medium")}>
                    sem resposta, depois de
                  </button>
                  {s.trigger === "dias" && (
                    <>
                      <Input type="number" min={0} max={60} value={s.delayDays} onChange={(e) => patch(i, { delayDays: Number(e.target.value) })} className="h-7 w-16" />
                      dias
                    </>
                  )}
                </div>
              )}
              <Textarea
                value={s.template}
                onChange={(e) => patch(i, { template: e.target.value })}
                rows={s.kind === "texto" ? 4 : 2}
                placeholder={s.kind === "texto" ? "Mensagem" : "Texto que vai junto (opcional, ex.: link do vídeo)"}
              />
              {s.kind !== "texto" && <Textarea value={s.script ?? ""} onChange={(e) => patch(i, { script: e.target.value })} rows={4} placeholder={`Roteiro para gravar o ${s.kind === "audio" ? "áudio" : "vídeo"}`} />}
            </li>
          ))}
        </ol>
        <Button variant="outline" onClick={() => setSteps((s) => [...s, { id: `s${Date.now().toString(36)}`, label: `Passo ${s.length + 1}`, kind: "texto", trigger: "resposta", delayDays: 0, template: "" }])}>
          <PlusIcon /> Adicionar passo
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await save(steps)
                toast.success("Funil salvo")
                onClose()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Não salvou")
              } finally {
                setBusy(false)
              }
            }}
          >
            <CheckIcon /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
