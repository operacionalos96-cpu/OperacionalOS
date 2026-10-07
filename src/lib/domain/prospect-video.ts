/**
 * Vídeo de análise personalizado (prospecção) — regras puras, testadas em prospect-video.test.ts.
 *
 * O vídeo NÃO é gerado para todo lead: só para quem chegou à parte do funil em que ele é usado.
 * Regra: o lead aceitou o passo anterior ao vídeo (respondeu depois dele) ou esse passo já foi
 * enviado. No roteiro padrão: respondeu ao "Posso te mandar um áudio?" → gera; assim o vídeo fica
 * pronto enquanto ele ouve o áudio. A mesma regra existe no banco (SQL 0013,
 * private.maybe_enqueue_video), que é quem dispara o job — manter as duas iguais.
 *
 * O vídeo gerado só vai para a conversa depois de APROVADO por uma pessoa.
 */
import { funnelOf, type FunnelMedia, type FunnelStep } from "./funnel"
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
  /** Arquivo no bucket privado "conteudos" (funil/leads/<lead>/<job>/video.mp4). */
  path?: string
  durationSec?: number
  findings?: VideoFinding[]
  generatedAt?: string
  approvedAt?: string
  approvedBy?: string
  error?: string
}

const CLOSED = ["ganho", "perdido"]

/** Posição do passo de vídeo no funil (-1 = o funil não tem vídeo). */
export const videoStepIndex = (steps: Pick<FunnelStep, "kind">[]) => steps.findIndex((s) => s.kind === "video")

export type VideoEligibility = { eligible: true } | { eligible: false; reason: string }

/** Chegou à parte do funil em que o vídeo personalizado é usado? */
export function videoEligibility(
  lead: Pick<Lead, "website" | "stage" | "review" | "funnel" | "firstContactAt" | "video"> & Partial<Pick<Lead, "lastActivityAt">>,
  steps: Pick<FunnelStep, "kind">[],
): VideoEligibility {
  const v = videoStepIndex(steps)
  if (v < 0) return { eligible: false, reason: "o funil não tem passo de vídeo" }
  if (!/^https?:\/\//i.test(lead.website ?? "")) return { eligible: false, reason: "lead sem site" }
  if (isDiscarded(lead)) return { eligible: false, reason: "lead descartado" }
  if (CLOSED.includes(lead.stage)) return { eligible: false, reason: "negócio encerrado" }
  const f = funnelOf(lead)
  if (f.stopped) return { eligible: false, reason: "saiu do funil" }
  if (f.step > v) return { eligible: false, reason: "o vídeo já foi enviado" }
  if (lead.video && lead.video.status !== "erro") return { eligible: false, reason: "vídeo já pedido" }
  const before = v - 1
  // Passo anterior ao vídeo já enviado (ex.: o áudio) → chegou.
  if (f.step >= v) return { eligible: true }
  // Está no passo anterior e respondeu depois da nossa última mensagem (aceitou) → chegou.
  const replied = !!f.repliedAt && (!f.lastSentAt || f.repliedAt >= f.lastSentAt)
  if (f.step === before && replied && before > 0) return { eligible: true }
  return { eligible: false, reason: "ainda não chegou nessa parte do funil" }
}

/** Mídia do passo para ESTE lead: o vídeo personalizado aprovado tem prioridade sobre o arquivo padrão. */
export function stepMediaFor(lead: Pick<Lead, "video" | "name">, step: Pick<FunnelStep, "kind" | "media">): { media: FunnelMedia | null; note?: string } {
  if (step.kind !== "video") return { media: step.media ?? null }
  const v = lead.video
  if (v?.status === "aprovado" && v.path) return { media: { path: v.path, name: `analise-${slug(lead.name)}.mp4`, mime: "video/mp4", size: 0 } }
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
