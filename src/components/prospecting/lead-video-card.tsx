"use client"

import { useState } from "react"
import { CheckIcon, Loader2Icon, RefreshCwIcon, VideoIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { VIDEO_STATUS_LABEL } from "@/lib/domain/prospect-video"
import type { Lead } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

async function videoAction<T = Record<string, unknown>>(action: string, id: string, extra: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/ai-office/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...extra }), cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.erro ?? "falhou")
  return data as T
}

/**
 * Vídeo de análise personalizado do lead. Nasce sozinho quando o lead chega nessa parte do
 * funil (regra no banco); aqui a pessoa assiste, confere os pontos e APROVA — só então a
 * extensão do WhatsApp anexa o vídeo na conversa.
 */
export function LeadVideoCard({ lead }: { lead: Lead }) {
  const v = lead.video
  const [url, setUrl] = useState<{ n: number; src: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  if (!v && !lead.website) return null

  const run = async (action: string, ok: string) => {
    setBusy(action)
    try {
      await videoAction(action, lead.id)
      if (action === "video.generate") setUrl(null)
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "falhou")
    } finally {
      setBusy(null)
    }
  }
  const watch = async (n: number) => {
    setBusy("video.url")
    try {
      setUrl({ n, src: (await videoAction<{ url: string }>("video.url", lead.id, { n })).url })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "falhou")
    } finally {
      setBusy(null)
    }
  }

  const tone = !v ? "" : v.status === "aprovado" ? "text-success" : v.status === "erro" ? "text-danger" : v.status === "pronto" ? "text-warning" : "text-muted-foreground"

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <VideoIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Vídeo de análise</h2>
        {v && <span className={cn("ml-auto text-xs font-medium", tone)}>{VIDEO_STATUS_LABEL[v.status]}</span>}
      </div>

      {!v && <p className="text-xs text-muted-foreground">Gera sozinho quando o lead chegar na parte do vídeo do funil (aceitou o áudio). Se quiser antes, gere agora.</p>}

      {v?.status === "analisando" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" /> O Claude está analisando o site para escrever os 3 pontos{v.requestedAt ? ` · pedido ${relative(v.requestedAt)}` : ""}. Roda na tarefa agendada do PC.
        </p>
      )}
      {v?.status === "gerando" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" /> Abrindo o site, tirando os prints e renderizando{v.requestedAt ? ` · pedido ${relative(v.requestedAt)}` : ""}. Precisa do worker de vídeo ligado.
        </p>
      )}
      {v?.status === "erro" && <p className="text-xs text-danger">{v.error || "O worker não conseguiu gerar."}</p>}

      {v?.findings && v.findings.length > 0 && v.status !== "gerando" && (
        <ul className="mb-3 grid gap-1">
          {v.findings.map((f) => (
            <li key={f.kind} className="text-xs">
              <span className="font-medium">{f.short}</span> <span className="text-muted-foreground">— {f.text}</span>
            </li>
          ))}
        </ul>
      )}

      {url && (
        <>
          <p className="mb-1 text-xs font-medium text-muted-foreground">{url.n === 2 ? "Vídeo 2 — visão (2º passo de vídeo)" : "Vídeo 1 — diagnóstico (1º passo de vídeo)"}</p>
          <video key={url.src} src={url.src} controls playsInline className="mb-3 aspect-[9/16] max-h-[420px] w-full rounded-lg bg-black object-contain" />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {v?.path && url?.n !== 1 && (
          <Button size="xs" variant="outline" onClick={() => watch(1)} disabled={!!busy}>
            {busy === "video.url" ? <Loader2Icon className="animate-spin" /> : <VideoIcon />} Vídeo 1
          </Button>
        )}
        {v?.path2 && url?.n !== 2 && (
          <Button size="xs" variant="outline" onClick={() => watch(2)} disabled={!!busy}>
            <VideoIcon /> Vídeo 2
          </Button>
        )}
        {v?.status === "pronto" && (
          <Button size="xs" onClick={() => run("video.approve", "Aprovado — a extensão já anexa os vídeos deste lead nos passos do funil")} disabled={!!busy}>
            <CheckIcon /> Aprovar
          </Button>
        )}
        {v && v.status !== "gerando" && v.status !== "analisando" && (
          <Button size="xs" variant="ghost" onClick={() => run("video.generate", "Pedido de novo vídeo enviado")} disabled={!!busy}>
            <RefreshCwIcon /> Gerar de novo
          </Button>
        )}
        {v && (v.status === "pronto" || v.status === "aprovado") && (
          <Button size="xs" variant="ghost" onClick={() => run("video.discard", "Descartado — o funil volta a usar o vídeo padrão")} disabled={!!busy}>
            <XIcon /> Descartar
          </Button>
        )}
        {!v && lead.website && (
          <Button size="xs" variant="outline" onClick={() => run("video.generate", "Pedido enviado ao worker de vídeo")} disabled={!!busy}>
            <VideoIcon /> Gerar agora
          </Button>
        )}
      </div>
      {v?.status === "aprovado" && v.approvedAt && <p className="mt-2 text-xs text-muted-foreground">Aprovado {relative(v.approvedAt)}</p>}
    </section>
  )
}
