/**
 * Funil de WhatsApp (prospecção): sequência de mensagens por lead — 1ª mensagem e
 * follow-ups com intervalo em dias. Regras puras, testadas em funnel.test.ts.
 * O envio é SEMPRE humano (o sistema/extensão só escreve a mensagem e registra).
 */
import type { Lead } from "./types"

export interface FunnelStep {
  id: string
  label: string
  /** "dias": libera N dias depois do passo anterior. "resposta": libera quando o lead RESPONDER. */
  trigger: "dias" | "resposta"
  /** Dias depois do passo anterior (só para trigger "dias"; o 1º passo usa 0). */
  delayDays: number
  /** texto: mensagem pronta. audio/video: você grava/anexa; o sistema mostra o roteiro (e o texto de acompanhamento, se houver). */
  kind: "texto" | "audio" | "video"
  /** Variáveis: {saudacao} {nome} {empresa} {segmento} {cidade} {problema} {oportunidade} {site} ou [segmento] [cidade/região]… */
  template: string
  /** Roteiro para gravar o áudio/vídeo (mesmas variáveis). */
  script?: string
}

export interface LeadFunnel {
  /** Próximo passo a enviar (0 = ainda não mandou a 1ª). */
  step: number
  lastSentAt?: string
  history: { step: number; at: string; by?: string }[]
  /** Última resposta do lead (libera passos "depois da resposta"). */
  repliedAt?: string
  /** Parou (pediu para não receber, fechou, não tem interesse…). */
  stopped?: boolean
}

/** Roteiro padrão (o de vocês). [segmento], [cidade/região] e {saudacao} são preenchidos com os dados do lead. */
export const DEFAULT_FUNNEL: FunnelStep[] = [
  {
    id: "m1",
    label: "Abertura",
    kind: "texto",
    trigger: "dias",
    delayDays: 0,
    template:
      "{saudacao}\n\nEstava pesquisando algumas empresas de [segmento] aqui em [cidade/região] e encontrei vocês.\nVocê que cuida dessa parte da empresa ou seria outra pessoa?",
  },
  {
    id: "m2",
    label: "Gancho da busca com IA",
    kind: "texto",
    trigger: "resposta",
    delayDays: 0,
    template:
      "Perfeito! Te perguntei porque aconteceu uma coisa interessante na pesquisa.\n\nMeu time estava comparando algumas empresas de [segmento] da região e testei também pelas novas buscas com IA e a empresa de vocês apareceu como uma das recomendações.\n\nIsso é bem positivo, principalmente porque muita empresa da região ainda nem consegue aparecer nesse tipo de busca só que teve um detalhe na recomendação de vocês que me chamou bastante atenção.\n\nPosso te mandar um áudio de 1 minuto explicando?",
  },
  {
    id: "m3",
    label: "Áudio de 1 minuto",
    kind: "audio",
    trigger: "resposta",
    delayDays: 0,
    template: "",
    script:
      "Roteiro (até 1 min):\n1) Quem é você e por que está falando com a {empresa}.\n2) O detalhe da recomendação da IA: {problema}.\n3) O que isso faz perder (clientes que pesquisam pelo celular/IA e não fecham).\n4) Convite: “Posso te mandar um vídeo curtinho mostrando exatamente isso no site de vocês?”",
  },
  {
    id: "m4",
    label: "Vídeo mostrando o site",
    kind: "video",
    trigger: "resposta",
    delayDays: 0,
    template: "Gravei esse vídeo rápido mostrando o que vi no site da {empresa}: [link do vídeo]",
    script: "Roteiro (2–3 min): abra o site {site} no celular, mostre {problema}, compare com como ficaria e feche com o próximo passo (uma conversa de 15 min).",
  },
]

export function mergeFunnel(raw: unknown): FunnelStep[] {
  if (!Array.isArray(raw)) return DEFAULT_FUNNEL
  const steps = raw.flatMap((s, i) => {
    const o = (s && typeof s === "object" ? s : {}) as Record<string, unknown>
    const template = typeof o.template === "string" ? o.template.trim().slice(0, 2000) : ""
    const hasScript = typeof o.script === "string" && o.script.trim()
    if (!template && !hasScript) return []
    const trigger = i > 0 && o.trigger === "resposta" ? "resposta" : "dias"
    const kind = o.kind === "audio" || o.kind === "video" ? o.kind : "texto"
    const script = typeof o.script === "string" && o.script.trim() ? o.script.trim().slice(0, 3000) : undefined
    return [
      {
        id: typeof o.id === "string" && o.id ? o.id.slice(0, 20) : `s${i + 1}`,
        label: typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 60) : `Passo ${i + 1}`,
        trigger: trigger as FunnelStep["trigger"],
        kind: kind as FunnelStep["kind"],
        ...(script ? { script } : {}),
        delayDays: i === 0 || trigger === "resposta" ? 0 : typeof o.delayDays === "number" && o.delayDays >= 0 ? Math.min(60, Math.round(o.delayDays)) : 2,
        template,
      },
    ]
  })
  return steps.length ? steps.slice(0, 10) : DEFAULT_FUNNEL
}

export const greetingFor = (now: Date) => (now.getHours() < 12 ? "Bom dia, tudo bem?" : "Boa tarde, tudo bem?")

/** Preenche as variáveis. O que não existir some sem deixar "{...}" na mensagem. */
export function renderTemplate(template: string, lead: Partial<Lead>, now: Date) {
  const vars: Record<string, string> = {
    saudacao: greetingFor(now),
    nome: lead.name ?? "",
    empresa: lead.company || lead.name || "sua empresa",
    segmento: lead.segment || "empresas como a sua",
    cidade: lead.city ?? "",
    problema: lead.analysis?.problems?.[0]?.toLowerCase() || "a versão para celular",
    oportunidade: lead.analysis?.opportunity ?? "",
    site: lead.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? "",
  }
  if (!vars.cidade) vars.cidade = "sua região"
  // Colchetes do roteiro: [segmento], [cidade/região], [empresa], [nome]… (sem acento/maiúscula importar)
  const bracket = (raw: string) => {
    const k = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[/\s]+/)[0]
    const alias: Record<string, string> = { regiao: "cidade", nome: "nome", empresa: "empresa", segmento: "segmento", nicho: "segmento", cidade: "cidade", site: "site", problema: "problema" }
    return alias[k] ? vars[alias[k]] : `[${raw}]`
  }
  return template
    .replace(/\[([^\]\n]{2,30})\]/g, (_, k: string) => bracket(k))
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export const funnelOf = (l: Pick<Lead, "funnel" | "firstContactAt">): LeadFunnel =>
  l.funnel ?? (l.firstContactAt ? { step: 1, lastSentAt: l.firstContactAt, history: [{ step: 0, at: l.firstContactAt }] } : { step: 0, history: [] })

/** Próximo passo do lead: qual, quando vence e se já pode mandar. null = funil terminado/parado. */
export function nextStep(lead: Pick<Lead, "funnel" | "firstContactAt" | "stage">, steps: FunnelStep[], now: Date) {
  const f = funnelOf(lead)
  if (f.stopped || f.step >= steps.length || ["ganho", "perdido", "negociacao", "proposta"].includes(lead.stage)) return null
  const step = steps[f.step]
  if (step.trigger === "resposta") {
    // Só libera se o lead respondeu DEPOIS da última mensagem nossa.
    const replied = !!f.repliedAt && (!f.lastSentAt || f.repliedAt >= f.lastSentAt)
    return { index: f.step, step, total: steps.length, dueAt: replied ? new Date(f.repliedAt!) : null, due: replied, waitingReply: !replied }
  }
  const dueAt = f.lastSentAt ? new Date(new Date(f.lastSentAt).getTime() + step.delayDays * 86_400_000) : now
  return { index: f.step, step, total: steps.length, dueAt, due: dueAt.getTime() <= now.getTime(), waitingReply: false }
}

/** Depois que o HUMANO enviou o passo `index`. */
export function sentPatch(lead: Pick<Lead, "funnel" | "firstContactAt">, index: number, at: string, by?: string): LeadFunnel {
  const f = funnelOf(lead)
  return { ...f, step: Math.max(f.step, index + 1), lastSentAt: at, history: [...f.history, { step: index, at, by }].slice(-30) }
}

/** Follow-ups que vencem hoje (ou atrasados), do responsável — já contatados e ainda no funil. */
export function followupsDue<L extends Lead>(leads: L[], steps: FunnelStep[], now: Date, ownerId?: string) {
  const endOfDay = new Date(now)
  endOfDay.setHours(23, 59, 59, 999)
  return leads
    .filter((l) => l.contactStatus === "contacted" && (!ownerId || l.ownerId === ownerId))
    .flatMap((l) => {
      const n = nextStep(l, steps, now)
      return n && n.index > 0 && n.dueAt && n.dueAt.getTime() <= endOfDay.getTime() ? [{ lead: l, ...n, dueAt: n.dueAt }] : []
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

/** Acha o lead pelo telefone (aceita com/sem 55, com/sem formatação; compara os últimos 10–11 dígitos). */
export function findLeadByPhone<L extends Pick<Lead, "contact">>(leads: L[], phone: string): L | undefined {
  const d = phone.replace(/\D/g, "")
  if (d.length < 10) return undefined
  const key = (x: string) => {
    const n = x.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")
    return n
  }
  const target = key(d)
  return leads.find((l) => l.contact && key(l.contact) === target) ?? leads.find((l) => l.contact && key(l.contact).slice(-8) === target.slice(-8) && key(l.contact).slice(0, 2) === target.slice(0, 2))
}

/** O lead respondeu (marcado à mão ou detectado pela extensão no WhatsApp Web). */
export function repliedPatch(lead: Pick<Lead, "funnel" | "firstContactAt">, at: string): LeadFunnel {
  return { ...funnelOf(lead), repliedAt: at }
}
