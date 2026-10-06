import { describe, expect, it } from "vitest"
import { DEFAULT_FUNNEL, findLeadByPhone, followupsDue, mergeFunnel, nextStep, renderTemplate, repliedPatch, sentPatch, type FunnelStep } from "./funnel"
import type { Lead } from "./types"

const lead = (p: Partial<Lead>): Lead => ({
  id: Math.random().toString(36).slice(2),
  name: "Costa Lion",
  stage: "contato",
  ownerId: "u2",
  valueCents: 0,
  nextAction: { text: "", dueDate: "2026-10-01" },
  lastActivityAt: "2026-10-01T10:00:00Z",
  createdAt: "2026-10-01T10:00:00Z",
  ...p,
})

const BY_DAYS: FunnelStep[] = [
  { id: "a", label: "1", kind: "texto", trigger: "dias", delayDays: 0, template: "{saudacao}" },
  { id: "b", label: "2", kind: "texto", trigger: "dias", delayDays: 2, template: "x" },
  { id: "c", label: "3", kind: "texto", trigger: "dias", delayDays: 3, template: "y" },
  { id: "d", label: "4", kind: "texto", trigger: "dias", delayDays: 5, template: "z" },
]

describe("funil de WhatsApp", () => {
  const morning = new Date(2026, 9, 6, 9)
  it("personaliza a mensagem e não deixa variável sobrando", () => {
    const l = lead({ company: "Costa Lion Materiais", segment: "materiais de construção", analysis: { problems: ["Sem versão para celular"] }, website: "https://www.costalion.com.br/" })
    expect(renderTemplate("{saudacao} Vi o site {site} da {empresa}: {problema}. {inexistente}", l, morning)).toBe("Bom dia, tudo bem? Vi o site costalion.com.br da Costa Lion Materiais: sem versão para celular.")
    expect(renderTemplate("{saudacao}", l, new Date(2026, 9, 6, 15))).toBe("Boa tarde, tudo bem?")
  })

  it("próximo passo: 1ª mensagem já; follow-up só depois dos dias; para ao fechar/responder", () => {
    expect(nextStep(lead({ stage: "novo" }), BY_DAYS, morning)).toMatchObject({ index: 0, due: true })
    const sent = lead({ funnel: { step: 1, lastSentAt: new Date(2026, 9, 5, 9).toISOString(), history: [] } })
    expect(nextStep(sent, BY_DAYS, morning)).toMatchObject({ index: 1, due: false }) // 1 dia de 2
    expect(nextStep(sent, BY_DAYS, new Date(2026, 9, 7, 10))).toMatchObject({ index: 1, due: true })
    expect(nextStep({ ...sent, stage: "proposta" }, BY_DAYS, morning)).toBeNull()
    expect(nextStep({ ...sent, funnel: { ...sent.funnel!, stopped: true } }, BY_DAYS, morning)).toBeNull()
    expect(nextStep({ ...sent, funnel: { step: 4, history: [] } }, BY_DAYS, morning)).toBeNull() // acabou
  })

  it("lead contatado antes do funil existir conta como 1ª mensagem enviada", () => {
    const old = lead({ firstContactAt: new Date(2026, 9, 1, 9).toISOString(), contactStatus: "contacted" })
    expect(nextStep(old, BY_DAYS, morning)).toMatchObject({ index: 1, due: true })
  })

  it("registrar envio avança o passo e guarda o histórico", () => {
    const f = sentPatch(lead({ stage: "novo" }), 0, "t1", "u2")
    expect(f).toEqual({ step: 1, lastSentAt: "t1", history: [{ step: 0, at: "t1", by: "u2" }] })
    expect(sentPatch({ funnel: f }, 1, "t2").step).toBe(2)
  })

  it("follow-ups de hoje: só contatados, do responsável, vencidos até o fim do dia", () => {
    const d = (day: number) => new Date(2026, 9, day, 9).toISOString()
    const leads = [
      lead({ id: "vence", contactStatus: "contacted", funnel: { step: 1, lastSentAt: d(4), history: [] } }),
      lead({ id: "cedo", contactStatus: "contacted", funnel: { step: 1, lastSentAt: d(5), history: [] } }),
      lead({ id: "outro", ownerId: "u1", contactStatus: "contacted", funnel: { step: 1, lastSentAt: d(1), history: [] } }),
      lead({ id: "nunca", stage: "novo" }),
    ]
    expect(followupsDue(leads, BY_DAYS, new Date(2026, 9, 6, 9), "u2").map((x) => x.lead.id)).toEqual(["vence"])
  })

  it("acha o lead pelo número do WhatsApp em qualquer formato", () => {
    const leads = [lead({ id: "a", contact: "(11) 97739-0519" }), lead({ id: "b", contact: "(21) 3333-4444" })]
    expect(findLeadByPhone(leads, "5511977390519")?.id).toBe("a")
    expect(findLeadByPhone(leads, "+55 21 3333-4444")?.id).toBe("b")
    expect(findLeadByPhone(leads, "5511900000000")).toBeUndefined()
  })

  it("funil salvo é validado (textos vazios saem, 1º passo sem espera)", () => {
    const f = mergeFunnel([{ label: "Oi", delayDays: 9, template: "{saudacao}" }, { template: "" }, { label: "FU", delayDays: -3, template: "x" }])
    expect(f).toEqual([
      { id: "s1", label: "Oi", trigger: "dias", kind: "texto", delayDays: 0, template: "{saudacao}" },
      { id: "s3", label: "FU", trigger: "dias", kind: "texto", delayDays: 2, template: "x" },
    ])
    expect(mergeFunnel(null)).toBe(DEFAULT_FUNNEL)
  })
})

describe("roteiro de vocês (passo depois da resposta)", () => {
  const l = lead({ segment: "clínicas odontológicas", city: "Santo André", stage: "novo" })
  it("abertura preenche [segmento] e [cidade/região] e ajusta a saudação", () => {
    const msg = renderTemplate(DEFAULT_FUNNEL[0].template, l, new Date(2026, 9, 6, 15))
    expect(msg.startsWith("Boa tarde, tudo bem?\n\nEstava pesquisando algumas empresas de clínicas odontológicas aqui em Santo André")).toBe(true)
    expect(msg).not.toContain("[")
    expect(renderTemplate("aqui em [cidade/região]", lead({}), new Date())).toBe("aqui na sua região")
  })
  it("2ª mensagem só libera quando o lead responde depois da nossa", () => {
    const after1 = { ...l, stage: "contato" as const, contactStatus: "contacted" as const, funnel: sentPatch(l, 0, "2026-10-06T12:00:00Z") }
    expect(nextStep(after1, DEFAULT_FUNNEL, new Date("2026-10-08T12:00:00Z"))).toMatchObject({ index: 1, due: false, waitingReply: true })
    const replied = { ...after1, funnel: repliedPatch(after1, "2026-10-06T13:00:00Z") }
    expect(nextStep(replied, DEFAULT_FUNNEL, new Date("2026-10-06T13:01:00Z"))).toMatchObject({ index: 1, due: true })
    expect(followupsDue([replied], DEFAULT_FUNNEL, new Date("2026-10-06T14:00:00Z")).map((x) => x.lead.id)).toEqual([replied.id])
  })
})

describe("saudação no horário de Brasília (servidor em UTC)", () => {
  it("12:00 UTC = 9h em SP → bom dia; 18:00 UTC = 15h → boa tarde", () => {
    expect(renderTemplate("{saudacao}", lead({}), new Date("2026-10-06T12:00:00Z"))).toBe("Bom dia, tudo bem?")
    expect(renderTemplate("{saudacao}", lead({}), new Date("2026-10-06T18:00:00Z"))).toBe("Boa tarde, tudo bem?")
  })
})

describe("segmento e região de cada empresa", () => {
  it("lead antigo (segmento no campo empresa) + DDD viram a abertura certa", () => {
    const l = lead({ name: "Azul Serviços", company: "Desentupidora / serviços locais", contact: "(21) 98888-7777" })
    expect(renderTemplate(DEFAULT_FUNNEL[0].template, l, new Date())).toContain("empresas de desentupimento aqui no Rio de Janeiro e encontrei vocês")
    expect(renderTemplate("{empresa}", l, new Date())).toBe("Azul Serviços")
    expect(renderTemplate("aqui em [cidade/região]", lead({ contact: "" }), new Date())).toBe("aqui na sua região")
  })
})

describe("passos de áudio e vídeo (arquivo)", () => {
  it("roteiro de vocês tem 4 passos: 2 textos, áudio e vídeo, todos depois da resposta", () => {
    expect(DEFAULT_FUNNEL.map((s) => [s.kind, s.trigger])).toEqual([
      ["texto", "dias"],
      ["texto", "resposta"],
      ["audio", "resposta"],
      ["video", "resposta"],
    ])
  })
  it("passo de mídia guarda o arquivo (e pode ficar sem arquivo até você subir)", () => {
    const media = { path: "funil/m3/abc-audio.ogg", name: "audio.ogg", mime: "audio/ogg", size: 12345 }
    const f = mergeFunnel([{ label: "A", template: "{saudacao}" }, { label: "Áudio", kind: "audio", trigger: "resposta", template: "", media }, { label: "Vídeo", kind: "video", trigger: "resposta" }])
    expect(f[1]).toEqual({ id: "s2", label: "Áudio", trigger: "resposta", kind: "audio", media, delayDays: 0, template: "" })
    expect(f[2]).toMatchObject({ kind: "video", template: "" })
    expect(f[2].media).toBeUndefined()
  })
  it("arquivo fora da pasta do funil ou de outro tipo é ignorado", () => {
    const bad = [
      { path: "itens/x/a.mp3", name: "a", mime: "audio/mpeg", size: 1 },
      { path: "funil/../itens/a.mp3", name: "a", mime: "audio/mpeg", size: 1 },
      { path: "funil/a.exe", name: "a", mime: "application/x-msdownload", size: 1 },
    ]
    for (const media of bad) expect(mergeFunnel([{ template: "x" }, { kind: "audio", media }])[1].media).toBeUndefined()
  })
})

describe("leads movidos para Contato feito no Pipeline (antes do funil)", () => {
  it("contam como 1ª mensagem enviada, esperando resposta", () => {
    const l = lead({ stage: "contato", lastActivityAt: "2026-10-01T12:00:00Z" })
    expect(nextStep(l, DEFAULT_FUNNEL, new Date("2026-10-06T12:00:00Z"))).toMatchObject({ index: 1, waitingReply: true })
    const replied = { ...l, funnel: repliedPatch(l, "2026-10-06T13:00:00Z") }
    expect(followupsDue([replied], DEFAULT_FUNNEL, new Date("2026-10-06T14:00:00Z")).map((x) => x.index)).toEqual([1])
  })
})
