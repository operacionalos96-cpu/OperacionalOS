// Lê a conversa (lista de mensagens já extraída do WhatsApp) e descobre em que passo do funil o lead está.
// Funções puras: testadas em src/lib/domain/whatsapp-analyze.test.ts.
;(function (g) {
  "use strict"

  const words = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3)

  /** Semelhança entre dois textos (0 a 1), por palavras. Tolera saudação diferente e pequenas edições. */
  function similarity(a, b) {
    const A = new Set(words(a))
    const B = new Set(words(b))
    if (!A.size || !B.size) return 0
    let common = 0
    for (const w of A) if (B.has(w)) common++
    return (2 * common) / (A.size + B.size)
  }

  const TEXT_MATCH = 0.55

  /**
   * msgs: [{ out: boolean, kind: "texto"|"audio"|"video"|"outro", text, time? }] em ordem.
   * steps: [{ index, kind, text }] (texto já personalizado para o lead).
   * serverStep: próximo passo segundo o sistema (para aceitar áudio/vídeo como o passo esperado).
   */
  function analyzeConversation(msgs, steps, serverStep) {
    const matched = {} // índice do passo → posição da mensagem
    let cursor = 0 // próximo passo esperado pelo que já se viu
    let lastIncoming = -1
    let lastIncomingText = ""
    msgs.forEach((m, pos) => {
      if (!m.out) {
        lastIncoming = pos
        lastIncomingText = m.text || (m.kind === "audio" ? "(áudio)" : m.kind === "video" ? "(vídeo)" : "")
        return
      }
      if (m.kind === "texto") {
        let best = -1
        let bestScore = TEXT_MATCH
        for (const s of steps) {
          if (s.kind !== "texto" || !s.text || matched[s.index] !== undefined) continue
          const sc = similarity(m.text, s.text)
          if (sc >= bestScore) {
            best = s.index
            bestScore = sc
          }
        }
        if (best >= 0) {
          matched[best] = pos
          cursor = Math.max(cursor, best + 1)
        }
        return
      }
      if (m.kind === "audio" || m.kind === "video") {
        // Áudio/vídeo conta como o próximo passo desse tipo — só se o funil já começou nesta conversa
        // ou o sistema diz que ele é o próximo (não confunde com um áudio qualquer).
        const limit = Math.max(cursor, serverStep)
        const s = steps.find((x) => x.index >= cursor && x.index <= limit && x.kind === m.kind && matched[x.index] === undefined)
        if (s && (cursor > 0 || serverStep >= s.index)) {
          matched[s.index] = pos
          cursor = Math.max(cursor, s.index + 1)
        }
      }
    })
    const sent = Object.keys(matched).map(Number).sort((a, b) => a - b)
    const lastSentPos = sent.length ? Math.max(...sent.map((i) => matched[i])) : -1
    const lastSent = sent.length ? sent[sent.length - 1] : -1
    return {
      sent,
      /** Posição de cada passo na conversa (para mostrar a hora). */
      positions: matched,
      nextIndex: cursor,
      /** Ele respondeu depois do último passo nosso que aparece na conversa. */
      replied: lastSentPos >= 0 && lastIncoming > lastSentPos,
      lastSent,
      lastIncomingText: lastIncoming > lastSentPos ? lastIncomingText : "",
    }
  }

  /** "[10:01, 06/10/2026] Nome: " → "10:01 06/10". */
  function timeFromPrePlain(attr) {
    const m = /\[(\d{1,2}:\d{2}),\s*(\d{1,2})\/(\d{1,2})/.exec(attr || "")
    return m ? `${m[1]} ${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}` : ""
  }

  const api = { similarity, analyzeConversation, timeFromPrePlain }
  g.OOSAnalyze = api
  if (typeof module !== "undefined" && module.exports) module.exports = api
})(typeof window !== "undefined" ? window : globalThis)
