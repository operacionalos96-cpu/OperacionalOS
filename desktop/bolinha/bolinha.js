/*
 * Bolinha flutuante. Só avisa o processo principal ("apertou", "moveu", "soltou", "cancelou", "menu");
 * ele lê o mouse, decide se foi clique ou arraste e move a janela.
 * Prévia sem Electron: abrir index.html?visual=quieta|lenta|girando|alerta&tema=claro|escuro.
 */
;(() => {
  "use strict"
  const raiz = document.documentElement
  const bola = document.getElementById("bolinha")
  const ponte = window.oposBolinha
  const VISUAIS = ["quieta", "lenta", "girando", "alerta"]

  function aplicar(e) {
    if (!e || typeof e !== "object") return
    if (VISUAIS.includes(e.visual)) bola.dataset.visual = e.visual
    if (e.tema === "claro" || e.tema === "escuro") raiz.dataset.tema = e.tema
    if (typeof e.texto === "string") bola.title = e.texto.slice(0, 120)
  }

  const q = new URLSearchParams(location.search)
  aplicar({ visual: q.get("visual"), tema: q.get("tema") })
  if (!ponte) return
  ponte.aoMudar(aplicar)

  let apertado = false
  let ultimo = 0
  bola.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return
    apertado = true
    bola.setPointerCapture(ev.pointerId)
    bola.classList.add("apertada")
    ponte.avisar("apertou")
  })
  /** Termina o aperto. "soltou" deixa o principal decidir entre clique e arraste; "cancelou" nunca abre a janela. */
  const terminar = (ev, aviso) => {
    if (!apertado) return
    apertado = false
    if (ev && ev.pointerId !== undefined && bola.hasPointerCapture(ev.pointerId)) bola.releasePointerCapture(ev.pointerId)
    bola.classList.remove("apertada", "arrastando")
    ponte.avisar(aviso)
  }
  bola.addEventListener("pointermove", (ev) => {
    if (!apertado) return
    // o botão já não está apertado (o soltar se perdeu, por exemplo num menu): para de seguir o mouse
    if ((ev.buttons & 1) === 0) return terminar(ev, "cancelou")
    const agora = performance.now()
    if (agora - ultimo < 8) return // no máximo ~120 avisos por segundo
    ultimo = agora
    bola.classList.add("arrastando")
    ponte.avisar("moveu")
  })
  bola.addEventListener("pointerup", (ev) => terminar(ev, "soltou"))
  bola.addEventListener("pointercancel", (ev) => terminar(ev, "cancelou"))
  bola.addEventListener("lostpointercapture", (ev) => terminar(ev, "cancelou"))
  window.addEventListener("blur", () => terminar(null, "cancelou"))
  bola.addEventListener("contextmenu", (ev) => {
    ev.preventDefault()
    terminar(ev, "cancelou")
    ponte.avisar("menu")
  })
})()
