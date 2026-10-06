// Roda no contexto da página do WhatsApp Web (world: MAIN).
// Quando a pessoa pede "Gravar como áudio de voz" no painel, a PRÓXIMA gravação pelo
// microfone recebe o áudio do funil no lugar da voz. Fora disso, o microfone é o de sempre.
// Nada é enviado sozinho: a pessoa clica no microfone e depois em enviar.
;(() => {
  "use strict"
  if (window.__oosMic || !navigator.mediaDevices) return
  window.__oosMic = true

  /** Áudio "armado" para a próxima gravação (vale por 2 minutos). */
  let armed = null
  const say = (status, extra) => window.postMessage({ __oosMic: status, ...extra }, location.origin)

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return
    const d = e.data
    // O arquivo vem do "mundo" da extensão: instanceof ArrayBuffer falha entre mundos, então checa pelo tipo.
    if (d?.__oos === "arm" && Object.prototype.toString.call(d.buffer) === "[object ArrayBuffer]") {
      armed = { buffer: d.buffer, at: Date.now() }
      say("armed", { bytes: d.buffer.byteLength })
    } else if (d?.__oos === "ping") {
      say("pong", { armed: !!armed })
    } else if (d?.__oos === "disarm") {
      armed = null
      say("disarmed")
    }
  })

  const proto = Object.getPrototypeOf(navigator.mediaDevices)
  const original = proto.getUserMedia
  const originalEnum = proto.enumerateDevices

  async function fakeStream(buffer) {
    const ctx = new AudioContext()
    await ctx.resume().catch(() => {})
    const audio = await ctx.decodeAudioData(buffer.slice(0))
    const dest = ctx.createMediaStreamDestination()
    const src = ctx.createBufferSource()
    src.buffer = audio
    src.connect(dest)
    // Começa logo depois de o WhatsApp iniciar a gravação.
    setTimeout(() => {
      src.start()
      say("playing", { seconds: Math.round(audio.duration) })
    }, 350)
    src.onended = () => say("ended")
    const track = dest.stream.getAudioTracks()[0]
    track.addEventListener("ended", () => ctx.close().catch(() => {}))
    return dest.stream
  }

  proto.getUserMedia = async function (constraints) {
    const wantsAudioOnly = constraints && constraints.audio && !constraints.video
    say("gum", { armed: !!armed, audioOnly: !!wantsAudioOnly })
    if (armed && wantsAudioOnly && Date.now() - armed.at < 120_000) {
      const { buffer } = armed
      armed = null
      try {
        return await fakeStream(buffer)
      } catch (err) {
        say("error", { reason: String(err && err.message || err).slice(0, 120) })
      }
    }
    return original.call(this, constraints)
  }

  // Computador sem microfone: o WhatsApp esconderia a gravação. Com áudio armado, informa um "microfone".
  proto.enumerateDevices = async function () {
    const list = await originalEnum.call(this)
    if (armed && !list.some((d) => d.kind === "audioinput")) {
      return [...list, { deviceId: "oos-funil", groupId: "oos-funil", kind: "audioinput", label: "Áudio do funil", toJSON() { return this } }]
    }
    return list
  }
})()
