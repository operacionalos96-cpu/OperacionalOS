import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

// O arquivo da extensão é JS puro (roda no WhatsApp Web); carregamos aqui para testar a lógica.
const src = fs.readFileSync(path.join(__dirname, "../../../extensions/whatsapp-funil/analyze.js"), "utf8")
const g: { OOSAnalyze?: typeof import("../../../extensions/whatsapp-funil/analyze.d").OOSAnalyze } = {}
new Function("window", src)(g)
const { analyzeConversation, similarity, timeFromPrePlain } = g.OOSAnalyze!

const steps = [
  { index: 0, kind: "texto", text: "Boa tarde, tudo bem?\n\nEstava pesquisando algumas empresas de desentupimento aqui em São Paulo e encontrei vocês.\nVocê que cuida dessa parte da empresa ou seria outra pessoa?" },
  { index: 1, kind: "texto", text: "Perfeito! Te perguntei porque aconteceu uma coisa interessante na pesquisa. Meu time estava comparando algumas empresas de desentupimento da região e testei também pelas novas buscas com IA. Posso te mandar um áudio de 1 minuto explicando?" },
  { index: 2, kind: "audio", text: "" },
  { index: 3, kind: "video", text: "" },
]
const out = (text: string, kind = "texto") => ({ out: true, kind, text })
const inc = (text: string, kind = "texto") => ({ out: false, kind, text })

describe("leitura da conversa", () => {
  it("reconhece a abertura mesmo com outra saudação e ele respondendo depois", () => {
    const r = analyzeConversation([out("Bom dia, tudo bem? Estava pesquisando algumas empresas de desentupimento aqui em São Paulo e encontrei vocês. Você que cuida dessa parte da empresa ou seria outra pessoa?"), inc("Sim sou eu")], steps, 1)
    expect(r).toMatchObject({ sent: [0], nextIndex: 1, replied: true, lastIncomingText: "Sim sou eu" })
  })
  it("passo 2 enviado, sem resposta ainda", () => {
    const r = analyzeConversation([out(steps[0].text), inc("sou eu"), out(steps[1].text)], steps, 1)
    expect(r).toMatchObject({ sent: [0, 1], nextIndex: 2, replied: false })
  })
  it("áudio enviado depois do passo 2 conta como passo 3; vídeo como passo 4", () => {
    const r = analyzeConversation([out(steps[0].text), inc("sim"), out(steps[1].text), inc("pode"), out("", "audio"), inc("legal"), out("", "video")], steps, 2)
    expect(r.sent).toEqual([0, 1, 2, 3])
    expect(r.nextIndex).toBe(4)
  })
  it("áudio qualquer antes do funil não conta", () => {
    expect(analyzeConversation([out("", "audio"), inc("oi")], steps, 0).sent).toEqual([])
  })
  it("áudio conta quando o sistema já diz que ele é o próximo (abertura enviada com outro texto)", () => {
    expect(analyzeConversation([out("Oi! mensagem antiga diferente"), inc("ok"), out("", "audio")], steps, 2).sent).toEqual([2])
  })
  it("mensagem diferente não é confundida com passo", () => {
    expect(analyzeConversation([out("Maravilha Angela! Angela, eu estava fazendo uma pesquisa aqui sobre clínicas")], steps, 0).sent).toEqual([])
    expect(similarity("a b c", "")).toBe(0)
  })
  it("hora da mensagem", () => {
    expect(timeFromPrePlain("[10:01, 6/10/2026] Kozake: ")).toBe("10:01 06/10")
  })
})
