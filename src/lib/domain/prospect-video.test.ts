import { describe, expect, it } from "vitest"
import { DEFAULT_FUNNEL, type FunnelStep } from "./funnel"
import { personalizedIndexes, stepMediaFor, videoEligibility, videoSourceAt, videoStart, videoStepIndex } from "./prospect-video"
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
const st = (id: string, kind: FunnelStep["kind"], source?: FunnelStep["source"]): FunnelStep => ({ id, label: id, kind, trigger: "resposta", delayDays: 0, template: "", ...(source ? { source } : {}) })

// Funil de 7 passos do jeito que vocês quiserem: vídeo da proposta no fim é arquivo (igual para todos)
const SETE = [st("a", "texto"), st("b", "texto"), st("c", "audio"), st("d", "video", "diagnostico"), st("e", "texto"), st("f", "video", "visao"), st("g", "video", "arquivo")]

describe("vídeo personalizado — funil editável", () => {
  it("funil antigo (sem 'source'): 1º vídeo = diagnóstico, 2º = visão, demais = arquivo", () => {
    expect(videoStepIndex(DEFAULT_FUNNEL)).toBe(3)
    expect([3, 4].map((i) => videoSourceAt(DEFAULT_FUNNEL, i))).toEqual(["diagnostico", "visao"])
    expect(videoSourceAt([...DEFAULT_FUNNEL, st("x", "video")], 5)).toBe("arquivo")
    expect(videoSourceAt(DEFAULT_FUNNEL, 0)).toBeNull()
  })

  it("cada passo de vídeo diz de onde vem; o da proposta pode ser arquivo", () => {
    expect(personalizedIndexes(SETE)).toEqual([3, 5])
    expect(videoSourceAt(SETE, 6)).toBe("arquivo")
  })

  it("sem escolha: começa quando ele responde 2 passos antes do 1º personalizado (aceitou o áudio)", () => {
    expect(videoStart(DEFAULT_FUNNEL)).toEqual({ index: 1, when: "respondeu" })
    expect(videoEligibility(lead({ funnel: f(1, "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(2, "2026-10-03T10:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(2, "2026-10-03T10:00:00Z", "2026-10-03T10:30:00Z") }), DEFAULT_FUNNEL)).toEqual({ eligible: true })
    expect(videoEligibility(lead({ funnel: f(3, "2026-10-03T11:00:00Z") }), DEFAULT_FUNNEL)).toEqual({ eligible: true })
  })

  it("escolha no editor: 'quando receber o passo X' e 'quando responder ao passo X'", () => {
    // gerar quando o áudio (c) for ENVIADO
    expect(videoEligibility(lead({ funnel: f(2, "2026-10-03T10:00:00Z", "2026-10-03T10:30:00Z") }), SETE, { startStepId: "c", when: "enviado" }).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(3, "2026-10-03T11:00:00Z") }), SETE, { startStepId: "c", when: "enviado" }).eligible).toBe(true)
    // gerar já quando ele RESPONDER à abertura (a)
    expect(videoEligibility(lead({ funnel: f(1, "2026-10-02T10:00:00Z", "2026-10-02T11:00:00Z") }), SETE, { startStepId: "a", when: "respondeu" }).eligible).toBe(true)
    // id que não existe mais: volta ao padrão
    expect(videoStart(SETE, { startStepId: "zzz", when: "enviado" })).toEqual({ index: 1, when: "respondeu" })
  })

  it("nunca gera sem site, descartado, encerrado, fora do funil, depois dos vídeos ou já pedido", () => {
    const ok = { funnel: f(3, "2026-10-03T11:00:00Z") }
    expect(videoEligibility(lead({ ...ok, website: undefined }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, review: { status: "rejected" } }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, stage: "ganho" }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(3, "2026-10-03T11:00:00Z", undefined, { stopped: true }) }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ funnel: f(5, "2026-10-04T11:00:00Z") }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, video: { status: "pronto" } }), DEFAULT_FUNNEL).eligible).toBe(false)
    expect(videoEligibility(lead({ ...ok, video: { status: "erro" } }), DEFAULT_FUNNEL).eligible).toBe(true)
    // funil só com vídeos de arquivo: nunca gera
    expect(videoEligibility(lead(ok), [st("a", "texto"), st("v", "video", "arquivo")]).eligible).toBe(false)
  })

  it("cada passo recebe o vídeo certo do lead; só depois de aprovado", () => {
    const steps = SETE.map((s) => (s.id === "g" || s.id === "d" ? { ...s, media: { path: `funil/${s.id}.mp4`, name: `${s.id}.mp4`, mime: "video/mp4", size: 1 } } : s))
    const v = { status: "aprovado" as const, path: "funil/leads/l1/j/video.mp4", path2: "funil/leads/l1/j/video-2.mp4" }
    expect(stepMediaFor(lead({ video: v }), steps, 3).media?.path).toBe(v.path)
    expect(stepMediaFor(lead({ video: v }), steps, 5).media?.path).toBe(v.path2)
    expect(stepMediaFor(lead({ video: v }), steps, 6).media?.path).toBe("funil/g.mp4") // proposta: arquivo
    expect(stepMediaFor(lead({ video: { ...v, status: "pronto" } }), steps, 3).media).toBeNull()
    expect(stepMediaFor(lead({ video: { status: "gerando" } }), steps, 3).note).toMatch(/gerado/)
    expect(stepMediaFor(lead({}), steps, 3).media?.path).toBe("funil/d.mp4") // sem vídeo do lead: arquivo reserva
    expect(stepMediaFor(lead({ video: { status: "descartado" } }), steps, 3).media?.path).toBe("funil/d.mp4")
    expect(stepMediaFor(lead({ video: v }), steps, 2).media).toBeNull() // áudio sem arquivo
  })
})
