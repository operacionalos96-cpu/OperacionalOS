import { describe, expect, it } from "vitest"
import { DEFAULT_FUNNEL } from "./funnel"
import { stepMediaFor, videoEligibility, videoOrdinal, videoStepIndex } from "./prospect-video"
import type { Lead } from "./types"

const lead = (p: Partial<Lead>): Lead => ({
  id: "l1",
  name: "Odonto Vitta",
  stage: "contato",
  ownerId: "u1",
  valueCents: 0,
  nextAction: { text: "Follow-up", dueDate: "2026-10-01" },
  lastActivityAt: "2026-10-01T10:00:00Z",
  createdAt: "2026-10-01T10:00:00Z",
  website: "https://odontovitta.com.br",
  contactStatus: "contacted",
  ...p,
})
const f = (step: number, lastSentAt: string, repliedAt?: string, extra: Partial<NonNullable<Lead["funnel"]>> = {}) => ({ step, lastSentAt, repliedAt, history: [], ...extra })

describe("vídeo de análise personalizado", () => {
  it("acha o passo de vídeo no funil padrão (m4)", () => {
    expect(videoStepIndex(DEFAULT_FUNNEL)).toBe(3)
    expect(videoStepIndex(DEFAULT_FUNNEL.filter((s) => s.kind !== "video"))).toBe(-1)
  })

  it("NÃO gera para quem só recebeu a abertura ou o gancho", () => {
    expect(videoEligibility(lead({ funnel: f(1, "2026-10-02T10:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    // respondeu a abertura (está no passo 1): ainda não chegou
    expect(videoEligibility(lead({ funnel: f(1, "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    // recebeu o gancho e ainda não respondeu
    expect(videoEligibility(lead({ funnel: f(2, "2026-10-03T10:00:00Z", "2026-10-02T11:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
  })

  it("gera quando aceitou o áudio (respondeu ao gancho) ou quando o áudio já foi", () => {
    expect(videoEligibility(lead({ funnel: f(2, "2026-10-03T10:00:00Z", "2026-10-03T10:30:00Z") }), DEFAULT_FUNNEL)).toEqual({ eligible: true })
    expect(videoEligibility(lead({ funnel: f(3, "2026-10-03T11:00:00Z") }), DEFAULT_FUNNEL)).toEqual({ eligible: true })
  })

  it("nunca gera sem site, descartado, encerrado, fora do funil, já enviado ou já pedido", () => {
    const ok = { funnel: f(3, "2026-10-03T11:00:00Z") }
    expect(videoEligibility(lead({ ...ok, website: undefined }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, review: { status: "rejected" } }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, stage: "ganho" }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(3, "2026-10-03T11:00:00Z", undefined, { stopped: true }) }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(4, "2026-10-04T11:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(5, "2026-10-04T11:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, video: { status: "pronto" } }), DEFAULT_FUNNEL).eligible).toBe(false)
    // falhou: pode pedir de novo
    expect(videoEligibility(lead({ ...ok, video: { status: "erro" } }), DEFAULT_FUNNEL).eligible).toBe(true)
  })

  it("o 2º passo de vídeo recebe o vídeo 2 (visão) do mesmo lead", () => {
    const v = { status: "aprovado" as const, path: "funil/leads/l1/j/video.mp4", path2: "funil/leads/l1/j/video-2.mp4" }
    expect(videoOrdinal(DEFAULT_FUNNEL, 3)).toBe(0)
    expect(videoOrdinal(DEFAULT_FUNNEL, 4)).toBe(1)
    expect(stepMediaFor(lead({ video: v }), DEFAULT_FUNNEL[4], 1).media?.path).toBe(v.path2)
    expect(stepMediaFor(lead({ video: { ...v, path2: undefined } }), DEFAULT_FUNNEL[4], 1).media).toBeNull()
  })

  it("a extensão só recebe o vídeo personalizado depois de aprovado", () => {
    const step = DEFAULT_FUNNEL[3]
    const padrao = { ...step, media: { path: "funil/padrao.mp4", name: "padrao.mp4", mime: "video/mp4", size: 10 } }
    expect(stepMediaFor(lead({ video: { status: "pronto", path: "funil/leads/l1/job/video.mp4" } }), padrao).media).toBeNull()
    expect(stepMediaFor(lead({ video: { status: "gerando" } }), padrao).note).toMatch(/gerado/)
    expect(stepMediaFor(lead({ video: { status: "aprovado", path: "funil/leads/l1/job/video.mp4" } }), padrao).media?.path).toBe("funil/leads/l1/job/video.mp4")
    // sem vídeo personalizado (ou descartado): usa o arquivo padrão do funil
    expect(stepMediaFor(lead({}), padrao).media?.path).toBe("funil/padrao.mp4")
    expect(stepMediaFor(lead({ video: { status: "descartado" } }), padrao).media?.path).toBe("funil/padrao.mp4")
    // passos que não são vídeo não mudam
    expect(stepMediaFor(lead({ video: { status: "aprovado", path: "x" } }), DEFAULT_FUNNEL[2]).media).toBeNull()
  })
})
