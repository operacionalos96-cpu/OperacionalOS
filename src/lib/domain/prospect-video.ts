/**
 * Vídeo de análise personalizado (prospecção) — regras puras, testadas em prospect-video.test.ts.
 *
 * O vídeo NÃO é gerado para todo lead: só para quem chegou à parte do funil escolhida no editor
 * (VideoPlan): "quando o lead RECEBER o passo X" ou "quando RESPONDER depois do passo X".
 * Sem escolha: responder ao passo 2 antes do 1º vídeo personalizado (no roteiro padrão, aceitar o
 * áudio). Cada passo de vídeo diz de onde vem o vídeo (FunnelStep.source). A mesma regra existe no
 * banco (SQL 0015, private.maybe_enqueue_video), que é quem dispara o job — manter as duas iguais.
 *
 * O vídeo gerado só vai para a conversa depois de APROVADO por uma pessoa.
 */
import { funnelOf, type FunnelMedia, type FunnelStep, type VideoPlan, type VideoSource } from "./funnel"
import { isDiscarded } from "./prospecting"
import type { Lead } from "./types"

export const VIDEO_JOB_TYPE = "render_prospect_video"
export const VIDEO_AGENT_ID = "video-studio"
export const VIDEO_CAPABILITY = "video_render"

/** gerando → pronto (esperando revisão) → aprovado | descartado. erro = job falhou de vez. */
export type LeadVideoStatus = "gerando" | "pronto" | "aprovado" | "descartado" | "erro"

/** Um ponto observado no site real (o worker só devolve o que conseguiu medir na página). */
export interface VideoFinding {
  /** Tipo do detector: copyright_antigo, contato_no_fim, sem_whatsapp, servicos_sem_explicacao, topo_sem_proposta, nao_responsivo, sem_prova_social… */
  kind: string
  /** Frase que completa "Um exemplo: …". */
  text: string
  /** 2–4 palavras para o quadro comparativo. */
  short: string
}

export interface LeadVideo {
  status: LeadVideoStatus
  jobId?: string
  /** Versão do pedido (sobe a cada "gerar de novo"). */
  version?: number
  requestedAt?: string
  /** Arquivo no bucket privado "conteudos" (funil/leads/<lead>/<job>/video.mp4). 1º vídeo: diagnóstico. */
  path?: string
  /** 2º vídeo do funil (visão/transformação), mesmo job: …/video-2.mp4. */
  path2?: string
  durationSec?: number
  findings?: VideoFinding[]
  generatedAt?: string
  approvedAt?: string
  approvedBy?: string
  error?: string
}

const CLOSED = ["ganho", "perdido"]

type StepLike = Pick<FunnelStep, "kind"> & Partial<Pick<FunnelStep, "id" | "source">>

/** Posição do 1º passo de vídeo no funil (-1 = o funil não tem vídeo). */
export const videoStepIndex = (steps: Pick<FunnelStep, "kind">[]) => steps.findIndex((s) => s.kind === "video")

/** De onde vem o vídeo do passo i. Funis antigos (sem `source`): 1º vídeo = diagnóstico, 2º = visão, demais = arquivo. */
export function videoSourceAt(steps: StepLike[], i: number): VideoSource | null {
  const s = steps[i]
  if (!s || s.kind !== "video") return null
  if (s.source) return s.source
  const n = steps.slice(0, i).filter((x) => x.kind === "video").length
  return n === 0 ? "diagnostico" : n === 1 ? "visao" : "arquivo"
}

/** Passos que usam vídeo personalizado (índices). */
export const personalizedIndexes = (steps: StepLike[]) => steps.flatMap((_, i) => (["diagnostico", "visao"].includes(videoSourceAt(steps, i) ?? "") ? [i] : []))

/** Passo de referência para começar a gerar (índice) e o momento. -1 = o funil não usa vídeo personalizado. */
export function videoStart(steps: StepLike[], plan?: Partial<VideoPlan>): { index: number; when: VideoPlan["when"] } {
  const first = personalizedIndexes(steps)[0]
  if (first === undefined) return { index: -1, when: "respondeu" }
  const chosen = plan?.startStepId ? steps.findIndex((s) => s.id === plan.startStepId) : -1
  if (chosen >= 0) return { index: chosen, when: plan?.when === "enviado" ? "enviado" : "respondeu" }
  return { index: Math.max(0, first - 2), when: "respondeu" }
}

export type VideoEligibility = { eligible: true } | { eligible: false; reason: string }

/** Chegou à parte do funil escolhida para gerar os vídeos personalizados? */
export function videoEligibility(
  lead: Pick<Lead, "website" | "stage" | "review" | "funnel" | "firstContactAt" | "video"> & Partial<Pick<Lead, "lastActivityAt">>,
  steps: StepLike[],
  plan?: Partial<VideoPlan>,
): VideoEligibility {
  const idx = personalizedIndexes(steps)
  if (!idx.length) return { eligible: false, reason: "o funil não tem vídeo personalizado" }
  if (!/^https?:\/\//i.test(lead.website ?? "")) return { eligible: false, reason: "lead sem site" }
  if (isDiscarded(lead)) return { eligible: false, reason: "lead descartado" }
  if (CLOSED.includes(lead.stage)) return { eligible: false, reason: "negócio encerrado" }
  const f = funnelOf(lead)
  if (f.stopped) return { eligible: false, reason: "saiu do funil" }
  if (f.step > idx[idx.length - 1]) return { eligible: false, reason: "os vídeos personalizados já foram enviados" }
  if (lead.video && lead.video.status !== "erro") return { eligible: false, reason: "vídeo já pedido" }
  const { index: s, when } = videoStart(steps, plan)
  if (when === "enviado") return f.step > s ? { eligible: true } : { eligible: false, reason: "ainda não chegou nessa parte do funil" }
  // "respondeu": ele respondeu depois do passo s (ou o funil já passou do seguinte)
  const replied = !!f.repliedAt && (!f.lastSentAt || f.repliedAt >= f.lastSentAt)
  if (f.step > s + 1 || (f.step === s + 1 && replied)) return { eligible: true }
  return { eligible: false, reason: "ainda não chegou nessa parte do funil" }
}

/**
 * Mídia do passo i para ESTE lead. Passo personalizado: o vídeo do lead (só depois de aprovado);
 * enquanto não houver, avisa (gerando/aguardando) ou cai no arquivo reserva do passo.
 */
export function stepMediaFor(lead: Pick<Lead, "video" | "name">, steps: StepLike[] & Pick<FunnelStep, "media">[], i: number): { media: FunnelMedia | null; note?: string } {
  const step = steps[i] as FunnelStep
  const src = videoSourceAt(steps, i)
  if (!src || src === "arquivo") return { media: step?.media ?? null }
  const v = lead.video
  const path = src === "diagnostico" ? v?.path : v?.path2
  if (v?.status === "aprovado" && path) return { media: { path, name: `${src === "visao" ? "visao" : "analise"}-${slug(lead.name)}.mp4`, mime: "video/mp4", size: 0 } }
  if (v?.status === "gerando") return { media: null, note: "O vídeo personalizado deste lead está sendo gerado. Volte em alguns minutos." }
  if (v?.status === "pronto") return { media: null, note: "Vídeo personalizado pronto — aprove na página do lead (Pipeline) para liberar aqui." }
  return { media: step.media ?? null }
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "empresa"

export const VIDEO_STATUS_LABEL: Record<LeadVideoStatus, string> = {
  gerando: "Gerando",
  pronto: "Pronto para revisar",
  aprovado: "Aprovado",
  descartado: "Descartado",
  erro: "Falhou",
}
