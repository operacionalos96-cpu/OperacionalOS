// Funil Operacional OS dentro do WhatsApp Web.
// Modo manual: a extensão escreve na caixa de texto e a pessoa confere e aperta Enter.
// Modo agente (ADR 0018, ligado neste computador E no sistema): envia sozinha o que o servidor mandar,
// no ritmo e nos limites decididos por ele. Nos dois modos, só registra o que foi enviado de fato.
;(() => {
  "use strict"
  if (window.__oosFunil) return
  window.__oosFunil = true

  // ---------- número que veio do link do sistema (web.whatsapp.com/send?phone=…) ----------
  // O WhatsApp troca a URL logo depois de abrir; guardamos antes.
  const urlPhone = new URLSearchParams(location.search).get("phone")
  if (urlPhone && /^\d{10,15}$/.test(urlPhone)) sessionStorage.setItem("oos-url-phone", urlPhone)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const RELOAD = "A extensão foi atualizada: recarregue o WhatsApp (F5)."
  const withTimeout = (p, ms, fallback) => Promise.race([p, sleep(ms).then(() => fallback)])
  async function api(action, body) {
    try {
      const r = await withTimeout(chrome.runtime.sendMessage({ type: "api", action, body }), 20000, { ok: false, data: { erro: "O Operacional OS não respondeu. Tente de novo." } })
      return r || { ok: false, data: { erro: RELOAD } }
    } catch {
      return { ok: false, data: { erro: RELOAD } }
    }
  }
  const digits = (s) => (s || "").replace(/\D/g, "")

  // ---------- leitura do WhatsApp Web (tolerante a mudanças de layout) ----------
  const main = () => document.querySelector("#main")
  const chatTitle = () => {
    const h = main()?.querySelector("header")
    const span = h?.querySelector('span[dir="auto"]') || h?.querySelector("span[title]")
    return (span?.getAttribute("title") || span?.textContent || "").trim()
  }
  const messages = () => Array.from(main()?.querySelectorAll("[data-id]") || []).filter((el) => /^(true|false)_/.test(el.getAttribute("data-id") || ""))
  const lastMessage = () => {
    const all = messages()
    const el = all[all.length - 1]
    if (!el) return null
    const id = el.getAttribute("data-id")
    return { id, incoming: id.startsWith("false_") || !!el.closest(".message-in") || !!el.querySelector(".message-in") }
  }
  /** Tipo da mensagem pelo que aparece nela (player de áudio, vídeo, texto). */
  const kindOf = (el) => {
    if (el.querySelector('[role="slider"], audio, [data-icon*="audio"], [data-icon*="ptt"]')) return "audio"
    if (el.querySelector('video, [data-icon*="video"], [data-icon="media-play"]')) return "video"
    if (el.querySelector("span.selectable-text, .copyable-text")) return "texto"
    return "outro"
  }
  /** Mensagens visíveis da conversa, em ordem: quem mandou, tipo, texto e hora. */
  function extractMessages() {
    return messages().map((el) => {
      const id = el.getAttribute("data-id") || ""
      const pre = el.querySelector("[data-pre-plain-text]")?.getAttribute("data-pre-plain-text") || ""
      return { out: id.startsWith("true_"), kind: kindOf(el), text: (el.querySelector("span.selectable-text")?.innerText || "").trim(), time: OOSAnalyze.timeFromPrePlain(pre) }
    })
  }

  /** Telefone da conversa: pelos ids das mensagens, pelo título, pelo link do sistema ou pelo que a pessoa informou. */
  async function chatPhone(title) {
    for (const el of messages()) {
      const m = /_(\d{10,15})@c\.us/.exec(el.getAttribute("data-id") || "")
      if (m) return m[1]
    }
    const t = digits(title)
    if (t.length >= 10 && t.length <= 15 && /^[+\d\s()-]+$/.test(title)) return t
    const known = (await chrome.storage.local.get("phones")).phones || {}
    if (known[title]) return known[title]
    const fromUrl = sessionStorage.getItem("oos-url-phone")
    if (fromUrl) {
      // 1ª conversa aberta pelo link do sistema: lembra "título → número" para as próximas vezes.
      sessionStorage.removeItem("oos-url-phone")
      known[title] = fromUrl
      await chrome.storage.local.set({ phones: known })
      return fromUrl
    }
    return null
  }
  async function rememberPhone(title, phone) {
    const known = (await chrome.storage.local.get("phones")).phones || {}
    known[title] = phone
    await chrome.storage.local.set({ phones: known })
  }

  /** Escreve na caixa de mensagem (como colar). NÃO aperta Enter. */
  const composer = () => main()?.querySelector('footer div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"][data-tab="10"]')
  const flat = (s) => (s || "").replace(/\s+/g, " ").trim()
  /** A mensagem já está na caixa (ex.: o sistema abriu a conversa com ela)? */
  const composerHas = (text) => !!text && flat(composer()?.innerText).includes(flat(text))

  /** Troca o que estiver na caixa pela mensagem (como colar). NÃO aperta Enter. */
  async function writeInComposer(text) {
    const box = composer()
    if (!box) return false
    box.focus()
    // Limpa rascunho/mensagem antiga para não duplicar.
    document.execCommand("selectAll", false)
    document.execCommand("delete", false)
    await sleep(80)
    try {
      const dt = new DataTransfer()
      dt.setData("text/plain", text)
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    } catch {}
    // O WhatsApp atualiza a caixa um instante depois: só usa o plano B se a colagem não entrou.
    await sleep(250)
    if (!composerHas(text)) {
      document.execCommand("selectAll", false)
      document.execCommand("delete", false)
      document.execCommand("insertText", false, text)
    }
    return true
  }

  /** Baixa o áudio/vídeo do funil (link temporário assinado). */
  async function fetchMedia(media) {
    let blob = null
    try {
      const r = await fetch(media.url)
      if (r.ok) blob = await r.blob()
    } catch {}
    if (!blob) {
      // Plano B: baixa pelo service worker da extensão.
      const r = await chrome.runtime.sendMessage({ type: "media", url: media.url }).catch(() => null)
      if (!r?.ok) throw new Error(r?.erro || "Não consegui baixar o arquivo.")
      blob = await (await fetch(r.dataUrl)).blob()
    }
    return new File([blob], media.name, { type: media.mime })
  }

  const previewOpen = () =>
    !!document.querySelector("[data-animate-media-viewer], [data-animate-modal-body]") ||
    [...document.querySelectorAll('[data-icon="send"], [data-icon="wds-ic-send-filled"]')].some((el) => !el.closest("footer"))
  const waitPreview = async () => {
    for (let i = 0; i < 10 && !previewOpen(); i++) await sleep(200)
    return previewOpen()
  }

  /** Coloca o arquivo na conversa (abre a prévia do WhatsApp). NÃO clica em enviar. */
  async function attachFile(file) {
    const target = main()
    if (!target) return false
    const dt = () => {
      const d = new DataTransfer()
      d.items.add(file)
      return d
    }
    // 1) Arrastar e soltar na conversa (como você faria com o mouse).
    const drop = target.querySelector('[role="application"]') || target
    for (const type of ["dragenter", "dragover", "drop"]) drop.dispatchEvent(new DragEvent(type, { dataTransfer: dt(), bubbles: true, cancelable: true }))
    if (await waitPreview()) return true
    // 2) Colar na caixa de mensagem.
    const box = target.querySelector('footer div[contenteditable="true"]')
    if (box) {
      box.focus()
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt(), bubbles: true, cancelable: true }))
      if (await waitPreview()) return true
    }
    // 3) Campo de arquivo do menu "Anexar".
    const inputs = [...document.querySelectorAll('input[type="file"]')]
    const input = inputs.find((x) => (x.accept || "").includes(file.type.split("/")[0])) || inputs.find((x) => !x.accept || x.accept === "*") || inputs[0]
    if (input) {
      input.files = dt().files
      input.dispatchEvent(new Event("change", { bubbles: true }))
      if (await waitPreview()) return true
    }
    return false
  }

  /** Escreve a legenda na prévia do arquivo que o WhatsApp abriu (a caixa de mensagem fica atrás dela). NÃO envia. */
  async function writeCaption(text) {
    const want = flat(text).slice(0, 40)
    const has = (el) => !!el && el.isConnected && flat(el.innerText).includes(want)
    // A caixa da legenda fica dentro da prévia (perto do botão de enviar dela), nunca na barra da conversa.
    const findBox = () => {
      const eds = [...document.querySelectorAll('div[contenteditable="true"]')].filter((el) => visible(el) && !el.closest("#main footer") && !el.closest("#side"))
      const label = (el) => `${el.getAttribute("aria-label") || ""} ${el.getAttribute("aria-placeholder") || ""} ${el.getAttribute("title") || ""}`
      const inPreview = (el) => !!el.closest("[data-animate-media-viewer], [data-animate-modal-body]")
      return eds.find((el) => /legenda|caption/i.test(label(el))) || eds.find(inPreview) || null
    }
    const write = (box) => {
      box.focus()
      try {
        const dt = new DataTransfer()
        dt.setData("text/plain", text)
        box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
      } catch {}
    }
    // Vídeo grande demora para montar a prévia, e o WhatsApp às vezes troca a caixa quando termina:
    // espera a caixa (até ~8 s), escreve e confere de novo depois de um tempo, reescrevendo se sumiu.
    for (let tries = 0; tries < 3; tries++) {
      let box = null
      for (let i = 0; i < 40 && !box; i++) {
        box = findBox()
        if (!box) await sleep(200)
      }
      if (!box) return false
      if (!has(box)) {
        write(box)
        await sleep(300)
        if (!has(box)) document.execCommand("insertText", false, text)
      }
      await sleep(1500)
      const now = findBox()
      if (has(now)) return true
    }
    return false
  }

  const clickable = (el) => el?.closest('button, [role="button"]') || el
  /** Aperta como um mouse de verdade (alguns botões do WhatsApp só reagem ao "apertar"). */
  function press(el) {
    const t = clickable(el)
    const r = t.getBoundingClientRect()
    const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }
    t.dispatchEvent(new PointerEvent("pointerdown", o))
    t.dispatchEvent(new MouseEvent("mousedown", o))
    t.dispatchEvent(new PointerEvent("pointerup", o))
    t.dispatchEvent(new MouseEvent("mouseup", o))
    t.dispatchEvent(new MouseEvent("click", o))
  }
  const visible = (el) => !!el && el.getClientRects().length > 0
  /** Botões da barra de mensagem (para achar microfone/pausa e para o diagnóstico). */
  const footerButtons = () => {
    const f = main()?.querySelector("footer") || main()
    if (!f) return []
    const els = [...f.querySelectorAll('button, [role="button"], [data-icon]')].filter(visible)
    return els.map((el) => ({ el, label: `${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""} ${el.getAttribute("data-icon") || ""} ${el.querySelector("[data-icon]")?.getAttribute("data-icon") || ""}`.toLowerCase() }))
  }
  const findButton = (re, not) => footerButtons().find((b) => re.test(b.label) && !(not && not.test(b.label)))?.el
  /** Botão do microfone do WhatsApp (só aparece com a caixa de mensagem vazia). */
  function clickMic() {
    const el = findButton(/mensagem de voz|voice message|gravar|record|microfone|ptt|mic/, /pause|pausar|send|enviar|delete|excluir/)
    if (!el) return false
    press(el)
    return true
  }
  /** Para (pausa) a gravação quando o áudio do funil acaba — NÃO envia; o enviar é seu. */
  function pauseRecording() {
    const el = findButton(/pausar|pause|parar|stop/, /send|enviar|delete|excluir|lixeira/)
    if (!el) return false
    press(el)
    return true
  }
  /** O que a extensão vê (sem conteúdo de conversa): para eu saber o nome dos botões no seu WhatsApp. */
  const micLog = []
  function diagnostics() {
    return JSON.stringify({ v: chrome.runtime.getManifest?.().version, ua: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0], botoes: footerButtons().slice(0, 25).map((b) => b.label.trim()), eventos: micLog.slice(-12) }, null, 1)
  }
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`

  // ---------- painel (shadow DOM: o CSS do WhatsApp não interfere) ----------
  // Identidade HZK (grafite azulado #1B2432, laranja #EA5B25, cinza #535353), no desenho limpo das telas da Apple:
  // fonte do sistema, cartões agrupados, controle segmentado, um botão de ação por vez.
  const W = 320
  const SIMBOLO = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="#1B2432"/><polygon points="18.57,9.05 82.02,9.05 82.02,26.19 42.74,73.21 82.02,73.21 82.02,89.88 15.0,89.88 15.0,75.36 57.26,26.19 18.57,26.19" fill="#fff"/><line x1="21.79" y1="83.45" x2="75.6" y2="15.48" stroke="#EA5B25" stroke-width="2.62"/><circle cx="21.79" cy="83.45" r="6.55" fill="#EA5B25"/><circle cx="48.21" cy="51.07" r="6.55" fill="#EA5B25"/><circle cx="75.6" cy="15.48" r="6.55" fill="#EA5B25"/></svg>`
  const ICON = {
    texto: `<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z"/></svg>`,
    audio: `<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    video: `<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M16.5 10.2 21 7.5v9l-4.5-2.7z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chevron: `<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    chat: `<svg viewBox="0 0 24 24"><path d="M12 3.5c4.97 0 9 3.36 9 7.5s-4.03 7.5-9 7.5c-1 0-1.97-.13-2.87-.39L4.5 20l1.1-3.9C4.04 14.75 3 12.97 3 11c0-4.14 4.03-7.5 9-7.5z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  }
  const host = document.createElement("div")
  host.id = "oos-funil"
  const root = host.attachShadow({ mode: "closed" })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        --navy: #1b2432; --orange: #ea5b25; --orange-press: #d24e1c; --gray: #535353;
        --bg: #f5f5f7; --card: #ffffff; --text: #1d1d1f; --text-2: #6e6e73; --text-3: #8e8e93;
        --sep: rgba(27, 36, 50, .09); --fill: rgba(27, 36, 50, .06); --fill-2: rgba(27, 36, 50, .1);
        --accent: var(--orange); --accent-soft: rgba(234, 91, 37, .11); --ink: var(--navy);
        --ok: #1f7a3a; --ok-soft: rgba(36, 138, 61, .1); --warn: #a35200; --warn-soft: rgba(255, 149, 0, .13); --danger: #d70015;
        --shadow: 0 1px 2px rgba(27, 36, 50, .05), 0 6px 20px -8px rgba(27, 36, 50, .14);
        position: fixed; top: 0; right: 0; bottom: 0; width: ${W}px; z-index: 2147483000; display: flex; flex-direction: column;
        background: var(--bg); color: var(--text); border-left: 1px solid var(--sep);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif;
        -webkit-font-smoothing: antialiased; letter-spacing: -.003em;
        transform: translateX(0); transition: transform .32s cubic-bezier(.32, .72, 0, 1);
      }
      .wrap.dark {
        --bg: #12171f; --card: #1c232e; --text: #f5f5f7; --text-2: #a1a1a6; --text-3: #7c7c82;
        --sep: rgba(255, 255, 255, .08); --fill: rgba(255, 255, 255, .07); --fill-2: rgba(255, 255, 255, .12);
        --accent: #f06a36; --orange-press: #ff7a45; --accent-soft: rgba(240, 106, 54, .16); --ink: #f5f5f7;
        --ok: #4cd964; --ok-soft: rgba(76, 217, 100, .12); --warn: #ffb340; --warn-soft: rgba(255, 179, 64, .13); --danger: #ff453a;
        --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px -10px rgba(0, 0, 0, .5);
      }
      .wrap.closed { transform: translateX(100%); }
      .wrap.dark .logo, .wrap.dark + .toggle svg { border-radius: 50%; box-shadow: 0 0 0 1px rgba(255, 255, 255, .16); }
      svg { display: block; }
      button { font: inherit; color: inherit; }
      button:focus-visible, input:focus-visible { outline: 3px solid var(--accent-soft); outline-offset: 1px; }

      .toggle { position: fixed; top: 50%; right: ${W}px; z-index: 2147483001; width: 26px; height: 54px; transform: translateY(-50%);
        display: grid; place-items: center; padding: 0; border: 1px solid var(--sep); border-right: 0; border-radius: 12px 0 0 12px;
        background: var(--card); box-shadow: var(--shadow); cursor: pointer; transition: right .32s cubic-bezier(.32, .72, 0, 1), width .15s; }
      .toggle svg { width: 18px; height: 18px; }
      .toggle:hover { width: 30px; }
      .wrap.closed + .toggle { right: 0; }

      header { display: flex; align-items: center; gap: 9px; padding: 14px 14px 12px; background: var(--card); border-bottom: 1px solid var(--sep); }
      header .logo { width: 24px; height: 24px; flex: none; }
      header .title { flex: 1; font-size: 15px; font-weight: 650; letter-spacing: -.015em; color: var(--ink); }
      .seg { display: flex; padding: 2px; border-radius: 9px; background: var(--fill); }
      .seg button { border: 0; background: none; padding: 4px 11px; border-radius: 7px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--text-2); transition: background .2s, color .2s; }
      .seg button.on { background: var(--card); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }

      .agent { display: flex; align-items: center; gap: 10px; padding: 9px 14px; background: var(--card); border-bottom: 1px solid var(--sep); }
      .agent .grow { flex: 1; min-width: 0; }
      .agent .at { font-size: 12.5px; font-weight: 600; }
      .agent .as { font-size: 11.5px; line-height: 1.35; color: var(--text-2); overflow-wrap: anywhere; }
      .agent .as.warn { color: var(--warn); }
      .agent .as.live { color: var(--accent); }
      .sw { flex: none; position: relative; width: 36px; height: 22px; border-radius: 99px; background: var(--fill-2); cursor: pointer; transition: background .2s; }
      .sw span { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .25); transition: transform .2s cubic-bezier(.32, .72, 0, 1); }
      .sw.on { background: var(--accent); }
      .sw.on span { transform: translateX(14px); }

      .body { flex: 1; overflow-y: auto; padding: 14px 12px 18px; scrollbar-width: thin; }
      .enter { animation: enter .26s cubic-bezier(.32, .72, 0, 1); }
      @keyframes enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

      .card { background: var(--card); border-radius: 14px; box-shadow: var(--shadow); padding: 14px; margin-bottom: 12px; }
      .label { font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--text-3); margin: 18px 4px 7px; }
      .label:first-child { margin-top: 2px; }
      .name { font-size: 17px; font-weight: 650; letter-spacing: -.02em; line-height: 1.25; }
      .meta { color: var(--text-2); font-size: 12.5px; margin-top: 2px; }
      .small { color: var(--text-3); font-size: 12px; }
      .pill { display: inline-flex; flex: none; white-space: nowrap; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: var(--fill); color: var(--text-2); }
      .pill.accent { background: var(--accent-soft); color: var(--accent); }
      .pill.warn { background: var(--warn-soft); color: var(--warn); }
      .pill.ok { background: var(--ok-soft); color: var(--ok); }

      .steps { list-style: none; margin: 0; padding: 0; }
      .steps li { position: relative; display: flex; align-items: center; gap: 10px; padding: 6px 0; }
      .steps li + li::before { content: ""; position: absolute; left: 9px; top: -6px; height: 12px; width: 2px; border-radius: 1px; background: var(--sep); }
      .steps li.done + li::before { background: var(--ink); opacity: .35; }
      .dot { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; box-sizing: border-box; border: 2px solid var(--fill-2); color: #fff; }
      .dot svg { width: 13px; height: 13px; }
      li.done .dot { background: var(--ink); border-color: var(--ink); color: var(--card); }
      li.now .dot { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
      li.now .dot::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
      .steps .st { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      li.now .st { font-weight: 600; }
      li:not(.done):not(.now) .st { color: var(--text-2); }
      .steps .when { color: var(--text-3); font-size: 11.5px; font-variant-numeric: tabular-nums; }

      .next-head { display: flex; align-items: center; gap: 11px; }
      .tile { flex: none; width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
      .tile svg { width: 19px; height: 19px; fill: currentColor; }
      .next-head .t { font-size: 15px; font-weight: 650; letter-spacing: -.015em; line-height: 1.25; }
      .bubble { white-space: pre-wrap; margin: 12px 0 2px; padding: 10px 12px; border-radius: 4px 14px 14px 14px; background: var(--fill); max-height: 240px; overflow: auto; font-size: 13px; line-height: 1.5; }
      .file { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 9px 11px; border-radius: 10px; background: var(--fill); font-size: 12.5px; color: var(--text-2); }
      .file svg { width: 16px; height: 16px; fill: currentColor; flex: none; }
      .file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; min-height: 36px; margin-top: 8px; padding: 8px 14px; border: 0; border-radius: 10px;
        cursor: pointer; font-size: 13.5px; font-weight: 600; letter-spacing: -.01em; background: var(--fill); color: var(--ink); transition: background .15s, transform .1s, opacity .15s; }
      .btn:hover { background: var(--fill-2); }
      .btn:active { transform: scale(.98); }
      .btn:disabled { opacity: .55; cursor: default; transform: none; }
      .btn.primary { background: var(--accent); color: #fff; }
      .btn.primary:hover { background: var(--orange-press); }
      .btn.text { min-height: 30px; background: none; color: var(--accent); font-weight: 500; }
      .btn.text:hover { background: var(--accent-soft); }
      .btn.danger { color: var(--danger); }
      .btn.danger:hover { background: rgba(215, 0, 21, .08); }
      .row { display: flex; gap: 8px; }
      .row .btn { flex: 1; }

      .banner { display: flex; gap: 9px; align-items: flex-start; margin-top: 12px; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; line-height: 1.45; background: var(--fill); }
      .banner.ok { background: var(--ok-soft); }
      .banner.warn { background: var(--warn-soft); }
      .banner.live { background: var(--accent-soft); }
      .banner b { font-weight: 650; }
      .rec { flex: none; width: 9px; height: 9px; margin-top: 4px; border-radius: 50%; background: var(--danger); animation: pulse 1.2s infinite; }
      @keyframes pulse { 50% { opacity: .3; } }
      .spin { flex: none; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--fill-2); border-top-color: var(--accent); animation: spin .7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .empty { text-align: center; padding: 36px 18px; color: var(--text-2); }
      .empty .ic { width: 44px; height: 44px; margin: 0 auto 12px; border-radius: 50%; display: grid; place-items: center; background: var(--fill); color: var(--text-3); }
      .empty .ic svg { width: 22px; height: 22px; }
      .empty .h { font-size: 15px; font-weight: 650; color: var(--text); margin-bottom: 4px; letter-spacing: -.015em; }
      .sk { height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--fill) 25%, var(--fill-2) 50%, var(--fill) 75%); background-size: 200% 100%; animation: sk 1.2s infinite; margin: 8px 0; }
      @keyframes sk { to { background-position: -200% 0; } }

      input { width: 100%; box-sizing: border-box; margin-top: 10px; padding: 9px 11px; border: 1px solid var(--sep); border-radius: 10px; background: var(--card); color: var(--text); font: inherit; }

      .list { list-style: none; margin: 0; padding: 0; background: var(--card); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
      .list li { display: flex; align-items: center; gap: 10px; padding: 11px 12px 11px 14px; cursor: pointer; transition: background .15s; }
      .list li + li { border-top: 1px solid var(--sep); }
      .list li:hover { background: var(--fill); }
      .list .tile { width: 30px; height: 30px; border-radius: 8px; }
      .list .tile svg { width: 16px; height: 16px; }
      .list .grow { flex: 1; min-width: 0; }
      .list .nm { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .list .chev { width: 14px; height: 14px; color: var(--text-3); flex: none; }

      .toast { position: absolute; left: 12px; right: 12px; bottom: 12px; padding: 10px 13px; border-radius: 12px; font-size: 12.5px; line-height: 1.4;
        background: var(--navy); color: #fff; box-shadow: 0 10px 30px -8px rgba(0, 0, 0, .35); opacity: 0; transform: translateY(8px); pointer-events: none;
        transition: opacity .22s, transform .22s cubic-bezier(.32, .72, 0, 1); }
      .wrap.dark .toast { background: #2c3644; }
      .toast.show { opacity: 1; transform: none; pointer-events: auto; }
      .toast.err { background: #b3261e; }
    </style>
    <div class="wrap">
      <header>
        <span class="logo">${SIMBOLO}</span><span class="title">Funil</span>
        <span class="seg" role="tablist"><button data-tab="chat" class="on" role="tab">Conversa</button><button data-tab="hoje" role="tab">Hoje</button></span>
      </header>
      <div class="agent"></div>
      <div class="body"></div>
      <div class="toast" role="status"></div>
    </div>
    <button class="toggle" title="Mostrar ou esconder o funil (Alt+F)" aria-label="Mostrar ou esconder o funil">${SIMBOLO}</button>`
  const wrap = root.querySelector(".wrap")
  const body = root.querySelector(".body")
  const toastEl = root.querySelector(".toast")
  let tab = "chat"

  // Avisos rápidos (registrado, erro) aparecem e somem sozinhos, sem empurrar o painel.
  let toastTimer = 0
  function toast(text, err = false) {
    if (!text) return
    toastEl.textContent = text
    toastEl.classList.toggle("err", err)
    toastEl.classList.add("show")
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), err ? 7000 : 3200)
  }
  toastEl.addEventListener("click", () => toastEl.classList.remove("show"))

  // Acompanha o tema do WhatsApp (claro/escuro).
  const syncTheme = () => wrap.classList.toggle("dark", !!document.body?.classList.contains("dark"))

  // O WhatsApp ocupa a tela toda: com o painel aberto, ele encolhe para o lado (não fica nada por baixo).
  const shrinkStyle = document.createElement("style")
  shrinkStyle.textContent = `#app { transition: width .32s cubic-bezier(.32, .72, 0, 1); } html.oos-funil-open #app { width: calc(100% - ${W}px) !important; }`
  ;(document.head || document.documentElement).appendChild(shrinkStyle)
  const appShrink = (open) => {
    document.documentElement.classList.toggle("oos-funil-open", open)
    setTimeout(() => window.dispatchEvent(new Event("resize")), 340)
  }
  chrome.storage.local.get("panelClosed").then(({ panelClosed }) => {
    wrap.classList.toggle("closed", !!panelClosed)
    appShrink(!panelClosed)
  })
  const togglePanel = () => {
    const closed = !wrap.classList.contains("closed")
    wrap.classList.toggle("closed", closed)
    appShrink(!closed)
    chrome.storage.local.set({ panelClosed: closed })
  }
  root.querySelector(".toggle").addEventListener("click", togglePanel)
  window.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === "KeyF") {
      e.preventDefault()
      togglePanel()
    }
  })
  const setTab = (t) => {
    tab = t
    root.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x.dataset.tab === t))
  }
  root.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      if (tab === b.dataset.tab) return
      setTab(b.dataset.tab)
      render()
    }),
  )

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  const KIND = { texto: "Texto", audio: "Áudio", video: "Vídeo" }
  const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "")
  /** Troca o conteúdo; anima só quando muda de tela (outro lead, outro passo), para não piscar a cada atualização. */
  let viewKey = ""
  function paint(html, key) {
    body.innerHTML = html
    if (key !== viewKey) {
      body.classList.remove("enter")
      void body.offsetWidth
      body.classList.add("enter")
      viewKey = key
    }
  }
  const empty = (icon, title, text) => `<div class="empty"><div class="ic">${ICON[icon]}</div><div class="h">${esc(title)}</div><div>${text}</div></div>`
  const banner = (kind, html) => `<div class="banner ${kind}">${kind === "live" ? `<span class="rec"></span>` : ""}<div>${html}</div></div>`

  // ---------- estado ----------
  let state = { title: "", phone: null, data: null, error: null, loading: false }
  /** Mensagem escrita pela extensão esperando o Enter da pessoa (aí registra sozinho). */
  let pendingSend = null
  let baselineLast = null
  /** Áudio de voz: estado vindo do mic.js (página). */
  let voice = null
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || !e.data?.__oosMic) return
    const st = e.data.__oosMic
    micLog.push(`${new Date().toLocaleTimeString("pt-BR")} ${st}${e.data.armed !== undefined ? ` armado=${e.data.armed}` : ""}${e.data.reason ? ` ${e.data.reason}` : ""}`)
    if (st === "gum" && voice) voice.gum = true
    if (st === "armed" && voice) voice.armedOk = true
    if (st === "pong" && voice) voice.pong = true
    if (!voice) return
    if (st === "playing") voice = { ...voice, phase: "playing", seconds: e.data.seconds, startedAt: Date.now() }
    else if (st === "ended") {
      // Acabou o áudio: para a gravação na hora (sem silêncio no fim). Você só clica em enviar.
      voice = { ...voice, phase: "ended", paused: false }
      setTimeout(() => {
        if (voice?.phase === "ended") {
          voice.paused = pauseRecording()
          voice.pauseTried = true
          render()
        }
      }, 250)
    }
    else if (st === "error") voice = { ...voice, phase: "error", reason: e.data.reason }
    else return
    render()
  })
  setInterval(() => {
    if (voice?.phase !== "playing" || !voice.startedAt) return
    const el = root.querySelector(".vt")
    if (el) el.textContent = mmss(Math.min(voice.seconds, (Date.now() - voice.startedAt) / 1000))
  }, 500)
  const disarmVoice = () => {
    if (voice) window.postMessage({ __oos: "disarm" }, location.origin)
    voice = null
  }

  async function load(title) {
    state = { title, phone: null, data: null, error: null, loading: true }
    pendingSend = null
    disarmVoice()
    render()
    try {
      const phone = await withTimeout(chatPhone(title), 5000, null)
      if (title !== state.title) return
      state.phone = phone
      // Sem número visível (conta comercial, contato salvo): procura também pelo nome da conversa.
      const r = await api("lookup", { phone: phone || "", name: title })
      if (title !== state.title) return
      if (r.ok) state.data = r.data
      else state.error = r.data?.erro || "Falhou"
    } catch (e) {
      if (title !== state.title) return
      state.error = /context invalidated/i.test(String(e?.message)) ? RELOAD : `Erro: ${e?.message || e}`
    }
    state.loading = false
    chatView = null
    baselineLast = lastMessage()?.id ?? null
    render()
    await reconcile()
  }

  /** O link do arquivo vale 15 min: se o painel ficou aberto mais que isso, busca um novo e tenta de novo. */
  async function mediaFile() {
    try {
      return await fetchMedia(state.data.next.media)
    } catch {
      const r = await api("lookup", { phone: state.phone || "", name: state.title })
      if (!r.ok || !r.data?.next?.media) throw new Error("Não consegui baixar o arquivo. Reabra a conversa e tente de novo.")
      state.data = r.data
      return fetchMedia(r.data.next.media)
    }
  }

  /** O que a leitura da conversa encontrou (passos enviados, horas, resposta). */
  let chatView = null
  let syncing = false
  async function reconcile() {
    const d = state.data
    if (!d?.found || !d.lead || syncing || typeof OOSAnalyze === "undefined") return
    const msgs = extractMessages()
    if (!msgs.length) return
    const a = OOSAnalyze.analyzeConversation(msgs, d.steps, d.funnel.step)
    const before = JSON.stringify(chatView)
    chatView = { ...a, times: Object.fromEntries(a.sent.map((i) => [i, msgs[a.positions[i]]?.time || ""])) }
    if (d.funnel.stopped || !d.next) {
      if (before !== JSON.stringify(chatView)) render()
      return
    }
    const fresh = a.sent.filter((i) => i >= d.funnel.step)
    const needReply = a.replied && !!d.next.waitingReply
    if (!fresh.length && !needReply) {
      if (before !== JSON.stringify(chatView)) render()
      return
    }
    syncing = true
    try {
      const parts = [fresh.length ? `enviado: ${fresh.map((i) => d.steps[i].label).join(", ")}` : "", needReply ? "ele respondeu" : ""].filter(Boolean)
      if (pendingSend && fresh.includes(pendingSend.step)) pendingSend = null
      await act("sync", { sent: fresh, replied: needReply }, `Atualizado pela conversa: ${parts.join("; ")}.`)
    } finally {
      syncing = false
    }
  }

  /** Hora do último envio registrado: logo depois, a última mensagem visível ainda é a antiga dele. */
  let justSentAt = 0
  async function act(action, extra, note) {
    const lead = state.data?.lead
    if (!lead) return
    if (action === "sent" || (action === "sync" && extra?.sent?.length)) justSentAt = Date.now()
    const r = await api(action, { leadId: lead.id, ...extra })
    if (r.ok) {
      state.data = { found: true, ...r.data }
      toast(note)
    } else toast(r.data?.erro || "Não registrou no sistema.", true)
    render()
  }

  /** Botão que mostra o andamento enquanto trabalha (baixando, anexando…). */
  const busyBtn = (btn, text) => {
    btn.disabled = true
    btn.innerHTML = `<span class="spin"></span>${esc(text)}`
  }

  function render() {
    syncTheme()
    if (tab === "hoje") return renderToday()
    const s = state
    if (!s.title) return paint(empty("chat", "Abra uma conversa", "O lead e o próximo passo do funil aparecem aqui."), "vazio")
    if (s.loading)
      return paint(`<div class="card"><div class="sk" style="width:60%;height:16px"></div><div class="sk" style="width:40%"></div><div class="sk" style="width:85%;margin-top:18px"></div><div class="sk" style="width:70%"></div></div>`, `carregando`)
    if (s.error) return paint(`<div class="card">${banner("warn", esc(s.error))}<button class="btn" data-a="retry">Tentar de novo</button></div>`, `erro:${s.title}`), wireRetry()
    if (!s.phone && !s.data?.found) {
      paint(`<div class="card"><div class="name">${esc(s.title)}</div><div class="meta">Não achei pelo nome e não consegui ler o número desta conversa.</div>
        <input inputmode="tel" placeholder="Número com DDD, ex.: 11 97739-0519" /><button class="btn primary" data-a="find">Procurar lead</button></div>`, `numero:${s.title}`)
      const input = body.querySelector("input")
      const find = async () => {
        const d = digits(input.value)
        if (d.length < 10) return toast("Digite o número com DDD.", true)
        const full = d.length <= 11 ? `55${d}` : d
        await rememberPhone(s.title, full)
        load(s.title)
      }
      body.querySelector('[data-a="find"]').onclick = find
      input.onkeydown = (e) => e.key === "Enter" && find()
      return
    }
    if (!s.data?.found) return paint(empty("search", s.title, `O número ${esc(s.phone)} não é de nenhum lead do Operacional OS.`), `fora:${s.title}`)

    const { lead, funnel, steps, next } = s.data
    const seenAt = (i) => chatView?.times?.[i] || (steps[i].sentAt ? when(steps[i].sentAt) : "")
    const stepList = steps
      .map((x) => {
        const cls = x.done ? "done" : next && x.index === next.index ? "now" : ""
        const t = x.done ? seenAt(x.index) : ""
        return `<li class="${cls}"><span class="dot">${x.done ? ICON.check : ""}</span><span class="st">${esc(x.label)}</span>${t ? `<span class="when">${esc(t)}</span>` : ""}</li>`
      })
      .join("")
    const meta = [lead.company && lead.company !== lead.name ? lead.company : "", lead.segment, lead.city].filter(Boolean).join(" · ")
    const status = funnel.stopped ? `<span class="pill">Fora do funil</span>` : !next ? `<span class="pill ok">Funil concluído</span>` : next.waitingReply ? `<span class="pill">Esperando resposta</span>` : `<span class="pill accent">Passo ${next.index + 1} de ${steps.length}</span>`
    let html = `<div class="card">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="name">${esc(lead.name)}</div>${status}</div>
        ${meta ? `<div class="meta">${esc(meta)}</div>` : ""}
        ${s.data.byName ? banner("warn", `Achei pelo nome da conversa. Confira se é <b>${esc(lead.name)}</b>.`) : ""}
      </div>`
    html += `<div class="label">Andamento</div><div class="card"><ul class="steps">${stepList}</ul>
      ${funnel.lastSentAt ? `<div class="small" style="margin-top:8px">Última nossa ${when(funnel.lastSentAt)}${funnel.repliedAt ? ` · respondeu ${when(funnel.repliedAt)}` : ""}</div>` : ""}</div>`

    if (next) {
      html += `<div class="label">Próximo passo</div><div class="card">${nextHtml(s, lead, next)}</div>`
      html += `<button class="btn text danger" data-a="stop">Tirar do funil</button>`
    }
    paint(html, `lead:${lead.id}:${next ? `${next.index}:${next.waitingReply}` : "fim"}`)
    wire(s, lead, next)
  }

  function nextHtml(s, lead, next) {
    const head = `<div class="next-head"><span class="tile">${ICON[next.kind]}</span><div><div class="small">Passo ${next.index + 1} · ${KIND[next.kind]}${!next.waitingReply && !next.due ? ` · vence ${when(next.dueAt)}` : ""}</div><div class="t">${esc(next.label)}</div></div></div>`
    if (next.waitingReply) {
      // A última mensagem da conversa é dele? (respondeu antes de a extensão estar aberta)
      const msgs = extractMessages()
      // Só sugere "ele respondeu" se a resposta é DEPOIS do nosso último passo na conversa
      // (logo após enviar, a mensagem antiga dele ainda aparece como a última).
      const recent = Date.now() - justSentAt < 45_000
      const lastIn = !recent && (chatView?.sent.length ? chatView.replied : !!msgs.length && !msgs[msgs.length - 1].out)
      const lastText = lastIn ? (msgs[msgs.length - 1].text || "").slice(0, 120) : ""
      return head + (lastIn
        ? banner("ok", `<b>Ele respondeu</b>${lastText ? `: “${esc(lastText)}”` : ""}. Confira e libere o próximo passo.`) + `<button class="btn primary" data-a="replied">Liberar passo ${next.index + 1}</button>`
        : banner("", "Esperando ele responder. Quando a resposta chegar, eu libero sozinho.") + `<button class="btn" data-a="replied">Ele já respondeu</button>`)
    }
    let html = head
    const noun = next.kind === "audio" ? "áudio" : "vídeo"
    if (next.text) html += `<div class="bubble">${esc(next.text)}</div>`
    if (next.kind !== "texto") {
      if (!next.media) return html + banner("warn", next.mediaNote ? esc(next.mediaNote) : `Falta o arquivo do ${noun}. Suba em Prospecção › Funil › Editar funil.`) + sentBtn(next)
      html += `<div class="file">${ICON[next.kind]}<span>${esc(next.media.name)}</span></div>`
    }
    if (next.text && next.kind === "texto" && !pendingSend && composerHas(next.text)) {
      // O sistema já abriu a conversa com a mensagem: só falta o Enter.
      pendingSend = { leadId: lead.id, step: next.index, text: next.text, title: s.title }
      baselineLast = lastMessage()?.id ?? null
    }
    if (next.kind === "audio") html += voiceHtml()
    else if (pendingSend)
      html += banner("ok", pendingSend.media
        ? `${next.text && pendingSend.text ? "Vídeo e legenda prontos" : "Arquivo anexado"}. Confira a prévia e clique em <b>enviar</b>. Eu registro sozinho.`
        : "Escrito na caixa. Confira e aperte <b>Enter</b>. Eu registro sozinho.") +
        `<button class="btn" data-a="${pendingSend.media ? "attach" : "write"}">${pendingSend.media ? "Anexar de novo" : "Escrever de novo"}</button>`
    else if (next.kind === "texto") html += `<button class="btn primary" data-a="write">Escrever no WhatsApp</button>`
    else html += `<button class="btn primary" data-a="attach">${next.text ? `Anexar ${noun} com a legenda` : `Anexar ${noun}`}</button>`
    return html + sentBtn(next)
  }
  const sentBtn = (next) => `<button class="btn text" data-a="sent">${next.kind === "texto" ? "Já enviei" : `Já enviei o ${next.kind === "audio" ? "áudio" : "vídeo"}`}</button>`

  function voiceHtml() {
    if (!voice) return `<button class="btn primary" data-a="voice">Enviar como áudio gravado</button><button class="btn" data-a="attach">Anexar como arquivo</button>`
    const cancel = `<button class="btn" data-a="voice-cancel">Cancelar</button>`
    switch (voice.phase) {
      case "loading":
        return banner("live", "Preparando o áudio…")
      case "armed":
        return (voice.micClicked ? banner("live", "Começando a gravação…") : banner("ok", "<b>Clique no microfone do WhatsApp</b> (apague o texto da caixa se houver). O áudio do funil entra no lugar da sua voz.")) + cancel
      case "playing":
        return banner("live", `Gravando o áudio do funil: <b class="vt">0:00</b> de ${mmss(voice.seconds)}. Não clique em nada, eu paro sozinho no fim.`)
      case "ended":
        if (!voice.pauseTried) return banner("live", "Parando a gravação…")
        return voice.paused
          ? banner("ok", `<b>Áudio pronto (${mmss(voice.seconds || 0)}).</b> Ouça se quiser e clique em <b>enviar</b> no WhatsApp. Eu registro sozinho.`)
          : banner("warn", `<b>Terminou (${mmss(voice.seconds || 0)}), mas não achei o botão de parar.</b> Clique em enviar agora, ou em pausar para ouvir antes.`) + `<button class="btn text" data-a="diag">Copiar diagnóstico</button>`
      case "problem":
        return banner("warn", esc(voice.problem)) + `<button class="btn primary" data-a="voice">Tentar de novo</button><button class="btn" data-a="attach">Anexar como arquivo</button><button class="btn text" data-a="diag">Copiar diagnóstico</button>`
      default:
        return banner("warn", `Não consegui usar este arquivo como áudio de voz${voice.reason ? ` (${esc(voice.reason)})` : ""}.`) + `<button class="btn primary" data-a="attach">Anexar como arquivo</button><button class="btn text" data-a="diag">Copiar diagnóstico</button>`
    }
  }

  function wireRetry() {
    body.querySelector('[data-a="retry"]')?.addEventListener("click", () => load(state.title))
  }

  function wire(s, lead, next) {
    const on = (a, fn) => body.querySelectorAll(`[data-a="${a}"]`).forEach((el) => el.addEventListener("click", () => fn(el)))
    on("write", async () => {
      if (!(await writeInComposer(next.text))) return toast("Não achei a caixa de mensagem.", true)
      pendingSend = { leadId: lead.id, step: next.index, text: next.text, title: s.title }
      baselineLast = lastMessage()?.id ?? null
      render()
    })
    on("voice", async () => {
      voice = { phase: "loading" }
      render()
      try {
        const buffer = await (await mediaFile()).arrayBuffer()
        voice = { phase: "armed", micClicked: false }
        window.postMessage({ __oos: "ping" }, location.origin)
        window.postMessage({ __oos: "arm", buffer }, location.origin, [buffer])
        await sleep(300)
        if (!voice.armedOk) {
          voice = { phase: "problem", problem: voice.pong ? "O WhatsApp não aceitou o arquivo de áudio." : "A parte da extensão que troca o microfone não carregou. Recarregue o WhatsApp (F5) e tente de novo." }
          return render()
        }
        // Começa a gravação por você (gravar não é enviar).
        voice.micClicked = clickMic()
        render()
        if (voice.micClicked) {
          // O WhatsApp tem que pedir o microfone logo depois do clique.
          for (let i = 0; i < 15 && voice && !voice.gum; i++) await sleep(200)
          if (voice && !voice.gum)
            voice = { phase: "problem", problem: "Cliquei no microfone, mas o WhatsApp não começou a gravar. Clique você no microfone agora (o áudio do funil continua preparado por 2 min) ou copie o diagnóstico.", keepArmed: true }
        }
        pendingSend = { leadId: lead.id, step: next.index, text: "", title: s.title, media: true }
        baselineLast = lastMessage()?.id ?? null
      } catch (e) {
        voice = null
        toast(e.message, true)
      }
      render()
    })
    on("diag", async () => {
      const text = diagnostics()
      try {
        await navigator.clipboard.writeText(text)
        toast("Diagnóstico copiado. Cole na conversa com o suporte.")
      } catch {
        toast("Não consegui copiar. Diagnóstico: " + text, true)
      }
    })
    on("voice-cancel", () => {
      disarmVoice()
      pendingSend = null
      render()
    })
    on("attach", async (btn) => {
      busyBtn(btn, "Baixando…")
      try {
        const file = await mediaFile()
        busyBtn(btn, "Anexando…")
        if (!(await attachFile(file))) {
          // Último recurso: baixa o arquivo para você arrastar.
          const a = document.createElement("a")
          a.href = URL.createObjectURL(file)
          a.download = file.name
          a.click()
          toast("O WhatsApp não aceitou o anexo automático. Baixei o arquivo: arraste-o para a conversa.", true)
          return render()
        }
        // A legenda vai na caixa da prévia do arquivo (a caixa de mensagem fica escondida atrás dela).
        let caption = ""
        if (next.text) {
          if (await writeCaption(next.text)) caption = next.text
          else {
            await navigator.clipboard.writeText(next.text).catch(() => {})
            toast("Não achei a caixa da legenda. Copiei o texto: cole com Ctrl+V na legenda.", true)
          }
        }
        pendingSend = { leadId: lead.id, step: next.index, text: caption, title: s.title, media: true }
        baselineLast = lastMessage()?.id ?? null
        render()
      } catch (e) {
        toast(e.message, true)
        render()
      }
    })
    on("sent", () => {
      pendingSend = null
      act("sent", { step: next.index, text: next.text || "" }, "Registrado no Operacional OS.")
    })
    on("replied", () => act("replied", {}, "Resposta registrada. Próximo passo liberado."))
    on("stop", () => confirm(`Tirar ${lead.name} do funil?`) && act("stop", {}, "Lead fora do funil."))
  }

  async function renderToday() {
    paint(`<div class="label">Para hoje</div><div class="card"><div class="sk" style="width:70%"></div><div class="sk" style="width:50%"></div><div class="sk" style="width:65%"></div></div>`, "hoje:carregando")
    const r = await api("today", {})
    if (tab !== "hoje") return
    if (!r.ok) return paint(`<div class="card">${banner("warn", esc(r.data?.erro || "Falhou"))}</div>`, "hoje:erro")
    const items = r.data.items || []
    if (!items.length) return paint(empty("check", "Tudo em dia", "Nenhum passo do funil para hoje."), "hoje:vazio")
    paint(`<div class="label">Para hoje · ${items.length}</div><ul class="list">${items
      .map((x, i) => `<li data-i="${i}"><span class="tile">${ICON[x.kind] || ICON.texto}</span><div class="grow"><div class="nm">${esc(x.name)}</div><div class="small">${x.step + 1}. ${esc(x.label)}</div></div>${x.overdue ? `<span class="pill warn">Atrasado</span>` : ""}<span class="chev">${ICON.chevron}</span></li>`)
      .join("")}</ul><div class="small" style="margin:10px 4px">Clique para abrir a conversa.</div>`, "hoje:lista")
    body.querySelectorAll(".list li").forEach((li) =>
      li.addEventListener("click", () => {
        const x = items[Number(li.dataset.i)]
        const d = digits(x.contact)
        if (d.length < 10) return toast("Este lead não tem número de WhatsApp.", true)
        li.querySelector(".chev").outerHTML = `<span class="spin"></span>`
        location.href = `https://web.whatsapp.com/send?phone=${d.length <= 11 ? `55${d}` : d}`
      }),
    )
  }

  // ---------- agente (ADR 0018): envia sozinho o que o servidor mandar ----------
  // Quem decide quem recebe, o quê e quando (limites, horário, intervalo) é o servidor; aqui só se executa.
  // Precisa estar ligado neste computador (chave do painel) e no sistema. A tarefa em andamento fica
  // guardada (agentJob) porque abrir outra conversa recarrega o WhatsApp Web.
  const agentEl = root.querySelector(".agent")
  const agent = { on: false, running: false, sending: false, nextAt: 0, job: null, status: "", kind: "" }
  /** Tempo máximo para abrir a conversa de uma tarefa (inclui recarregar a página). */
  const OPEN_TIMEOUT = 90_000
  /** Sem a conversa aberta depois disso, pede para abrir de novo (uma vez). */
  const OPEN_RETRY = 30_000
  const norm = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
  const hhmm = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })

  function setAgentStatus(text, kind = "") {
    agent.status = text
    agent.kind = kind
    agentEl.innerHTML = `<span class="sw ${agent.on ? "on" : ""}" role="switch" aria-checked="${agent.on}" aria-label="Ligar o agente neste computador" tabindex="0"><span></span></span>
      <div class="grow"><div class="at">Agente ${agent.on ? "ligado" : "desligado"}</div><div class="as ${kind}" title="${esc(text)}">${esc(text)}</div></div>`
  }
  const saveJob = (job) => {
    agent.job = job
    return chrome.storage.local.set({ agentJob: job })
  }
  async function toggleAgent() {
    agent.on = !agent.on
    agent.nextAt = 0
    await chrome.storage.local.set({ agentOn: agent.on })
    if (!agent.on) await saveJob(null)
    setAgentStatus(agent.on ? "Começando…" : "Desligado neste computador. Nada é enviado sozinho.")
  }
  agentEl.addEventListener("click", (e) => e.target.closest(".sw") && toggleAgent())
  agentEl.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && e.target.closest(".sw")) {
      e.preventDefault()
      toggleAgent()
    }
  })
  setAgentStatus("Carregando…")
  chrome.storage.local.get(["agentOn", "agentJob"]).then(({ agentOn, agentJob }) => {
    agent.on = !!agentOn
    // Tarefa velha (o navegador fechou no meio): descarta; se ainda valer, o servidor manda de novo.
    agent.job = agentJob && Date.now() - agentJob.at < OPEN_TIMEOUT ? agentJob : null
    // Voltou de uma recarga pedida pelo agente: conta (diz no status se a página recarregou mesmo).
    if (agent.job?.phase === "abrindo") void saveJob({ ...agent.job, reloads: (agent.job.reloads || 0) + 1 })
    setAgentStatus(agent.on ? "Começando…" : "Desligado neste computador. Nada é enviado sozinho.")
  })

  const agentApi = async (action, extra) => {
    const r = await api(action, extra)
    if (!r.ok) throw new Error(r.data?.erro || "O Operacional OS não respondeu.")
    return r.data
  }
  /** Passa o lead para um humano (o agente não mexe mais nele até alguém devolver). */
  async function handOff(leadId, reason) {
    await api("agent_human", { leadId, reason })
    toast(`Passei para um humano: ${reason}`, true)
  }

  /** Botão de enviar: o da barra da conversa ou o da prévia do anexo. */
  const sendButton = (inPreview) =>
    [...document.querySelectorAll('[data-icon="send"], [data-icon="wds-ic-send-filled"], [aria-label="Enviar"], [aria-label="Send"]')].filter(visible).find((el) => (inPreview ? !el.closest("footer") : !!el.closest("footer")))
  /** Espera aparecer uma mensagem NOSSA nova na conversa (o envio foi de verdade). */
  async function confirmOut(before, ms) {
    for (let t = 0; t < ms; t += 500) {
      const last = lastMessage()
      if (last && last.id !== before && !last.incoming) return true
      await sleep(500)
    }
    return false
  }
  async function sendText(text) {
    if (!(await writeInComposer(text))) return false
    await sleep(500)
    const btn = sendButton(false)
    if (btn) press(btn)
    else composer()?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }))
    return true
  }
  async function sendFile(caption) {
    const file = await mediaFile()
    if (!(await attachFile(file))) return false
    if (caption && !(await writeCaption(caption))) return false
    await sleep(700)
    const btn = sendButton(true)
    if (!btn) return false
    press(btn)
    return true
  }
  /** Descarta uma gravação que não deu certo (nada é enviado). */
  function cancelRecording() {
    const el = findButton(/excluir|delete|lixeira|descartar|cancel/)
    if (el) press(el)
  }
  /** Áudio como mensagem de voz (mesmo caminho do botão "Enviar como áudio gravado"). Falhou → false, e vai como arquivo. */
  async function sendVoice() {
    const giveUp = () => {
      cancelRecording()
      disarmVoice()
      return false
    }
    try {
      const buffer = await (await mediaFile()).arrayBuffer()
      voice = { phase: "armed", micClicked: false }
      window.postMessage({ __oos: "ping" }, location.origin)
      window.postMessage({ __oos: "arm", buffer }, location.origin, [buffer])
      await sleep(300)
      if (!voice?.armedOk) return giveUp()
      voice.micClicked = clickMic()
      if (!voice.micClicked) return giveUp()
      // Sem tocar em poucos segundos (ex.: o Chrome segura o som numa página recém-aberta): desiste e manda como arquivo.
      for (let i = 0; i < 32 && voice && voice.phase !== "playing"; i++) await sleep(250)
      if (voice?.phase !== "playing") return giveUp()
      const limit = Date.now() + ((voice.seconds || 120) + 20) * 1000
      while (voice && !voice.pauseTried && Date.now() < limit) await sleep(500)
      const btn = voice?.pauseTried ? sendButton(false) || findButton(/send|enviar/, /cancel|delete|excluir|lixeira/) : null
      if (!btn) return giveUp()
      press(btn)
      voice = null
      return true
    } catch {
      return giveUp()
    }
  }

  /** Envia o passo do funil que está na tela e registra. `afterReply`: a IA mandou seguir porque ele respondeu (não espera os dias). */
  async function sendStep(job, next, afterReply = false) {
    const lead = state.data.lead
    if (!next || next.index !== job.step || (!next.due && !afterReply)) return setAgentStatus("O passo mudou. Pedindo a próxima tarefa…")
    if (next.kind !== "texto" && !next.media) return handOff(lead.id, next.mediaNote || `falta o arquivo do passo "${next.label}"`)
    setAgentStatus(`Enviando “${next.label}” para ${lead.name}…`, "live")
    const before = lastMessage()?.id ?? null
    const ok = next.kind === "texto" ? await sendText(next.text) : next.kind === "video" ? await sendFile(next.text) : (await sendVoice()) || (await sendFile(""))
    if (!ok || !(await confirmOut(before, next.kind === "texto" ? 15_000 : 120_000))) return handOff(lead.id, `não consegui enviar "${next.label}" pelo WhatsApp Web`)
    await act("agent_sent", { step: next.index, text: next.text || "" }, `Agente enviou “${next.label}” para ${lead.name}.`)
  }

  /** Ele respondeu: a IA lê a conversa e decide (seguir o roteiro, responder, parar ou chamar um humano). */
  async function replyTo(job) {
    const lead = state.data.lead
    setAgentStatus(`Lendo a resposta de ${lead.name}…`, "live")
    const r = await agentApi("agent_reply", { leadId: lead.id, messages: extractMessages().slice(-30) })
    state.data = { found: true, ...r.view }
    render()
    if (r.action === "esperar") return setAgentStatus(lead.name + ": a última mensagem já é nossa, esperando ele responder.")
    if (r.action === "parar") return toast(`${lead.name} saiu do funil: ${r.intent}.`)
    if (r.action === "humano") return toast(`Passei ${lead.name} para um humano: ${r.reason}`, true)
    if (r.action === "proximo_passo") return sendStep({ ...job, step: state.data.next?.index }, state.data.next, true)
    setAgentStatus(`Respondendo ${lead.name}…`, "live")
    const before = lastMessage()?.id ?? null
    if (!(await sendText(r.message)) || !(await confirmOut(before, 15_000))) return handOff(lead.id, "não consegui enviar a resposta pelo WhatsApp Web")
    state.data = { found: true, ...(await agentApi("agent_free_sent", { leadId: lead.id, text: r.message })) }
    toast(`Agente respondeu ${lead.name} (${r.intent}).`)
    render()
  }

  /** Pede ao Chrome para abrir a conversa do número nesta aba (recarrega o WhatsApp Web). */
  async function openNumber(phone) {
    const r = await withTimeout(chrome.runtime.sendMessage({ type: "open", phone }).catch((e) => ({ ok: false, erro: String(e?.message || e) })), 5000, { ok: false, erro: "sem resposta da extensão" })
    agent.openError = r?.ok ? "" : r?.erro || "falhou"
    if (!r?.ok) location.href = `https://web.whatsapp.com/send?phone=${phone}` // plano B
  }

  /** Abre a conversa da tarefa (recarrega o WhatsApp Web no número) ou continua esperando ela abrir. */
  async function runJob(job) {
    const ready = state.data?.lead?.id === job.leadId && !state.loading && !!state.title
    if (!ready) {
      const waited = Date.now() - job.at
      if (waited > OPEN_TIMEOUT) {
        await saveJob(null)
        if (job.kind !== "ler") await handOff(job.leadId, "a conversa não abriu (o número tem WhatsApp?)")
        return
      }
      const retry = job.phase === "abrindo" && !job.retried && job.phone && Date.now() - (job.openedAt || job.at) > OPEN_RETRY
      if ((job.phase !== "abrindo" || retry) && job.phone) {
        await saveJob({ ...job, phase: "abrindo", openedAt: Date.now(), retried: job.phase === "abrindo", navs: (job.navs || 0) + 1 })
        await openNumber(job.phone)
      }
      const j = agent.job || job
      const detail = [`${Math.round(waited / 1000)} s`, j.navs ? `pedi ${j.navs}x` : "", j.navs ? (j.reloads ? `recarregou ${j.reloads}x` : "a página não recarregou") : "", agent.openError ? `erro: ${agent.openError}` : ""].filter(Boolean).join(" · ")
      return setAgentStatus(`Abrindo a conversa de ${job.name} (${detail})`, "live")
    }
    // A partir daqui a tarefa não volta (recarregar no meio não envia duas vezes).
    await saveJob(null)
    agent.sending = true
    try {
      if (job.kind === "ler") {
        if (lastMessage()?.incoming) await act("replied", { auto: true }, `${job.name} respondeu.`)
      } else if (job.kind === "responder") await replyTo(job)
      else await sendStep(job, state.data.next)
    } catch (e) {
      toast(e.message || String(e), true)
    } finally {
      agent.sending = false
      baselineLast = lastMessage()?.id ?? null
      agent.nextAt = Date.now() + 10_000
    }
  }

  /** Conversas não lidas que são de leads: abre a primeira (clicando nela) para o agente responder. */
  const looked = new Map()
  async function openUnreadLead() {
    const side = document.querySelector("#pane-side")
    if (!side) return false
    for (const row of side.querySelectorAll('[role="listitem"], [role="row"]')) {
      if (![...row.querySelectorAll("[aria-label]")].some((el) => /n[ãa]o lida|unread/i.test(el.getAttribute("aria-label")))) continue
      const title = row.querySelector("span[title]")?.getAttribute("title")?.trim()
      if (!title || title === state.title || (looked.get(title) ?? 0) > Date.now()) continue
      looked.set(title, Date.now() + 10 * 60_000)
      // Só conversa de lead: número igual ao de um lead, ou nome IGUAL ao do lead. Conversas pessoais nunca são abertas.
      const d = digits(title)
      const phoneLike = /^[+\d\s()-]+$/.test(title) && d.length >= 10
      const r = await api("lookup", { phone: phoneLike ? d : "", name: phoneLike ? "" : title })
      const lead = r.ok && r.data?.found ? r.data.lead : null
      // Só conversa que o agente começou: as de antes dele continuam com você.
      if (!lead || !lead.agent || (r.data.byName && norm(lead.name) !== norm(title))) continue
      await saveJob({ kind: "ler", leadId: lead.id, name: lead.name, phone: null, at: Date.now(), phase: "abrindo" })
      setAgentStatus(`${lead.name} mandou mensagem. Abrindo…`, "live")
      press(row.querySelector('[role="gridcell"]') || row)
      return true
    }
    return false
  }

  const PLAN_TEXT = {
    desligado: "Desligado no sistema (Prospecção › Agente).",
    fora_do_horario: "Fora do horário de envio.",
    limite_do_dia: "Limite de envios do dia atingido.",
    sem_tarefas: "Nada para enviar agora.",
  }
  async function agentTick() {
    // Ciclo preso numa espera que não voltou (mais de 3 min): libera para não parar o agente.
    if (agent.running && Date.now() - agent.runningSince > 180_000) agent.running = false
    if (!agent.on || agent.running) return
    if (!document.querySelector("#pane-side")) return setAgentStatus("Esperando o WhatsApp Web carregar a lista de conversas…")
    agent.running = true
    agent.runningSince = Date.now()
    try {
      if (agent.job) return await runJob(agent.job)
      if (Date.now() < agent.nextAt || state.loading) return
      // Não atropela quem está mexendo nesta aba.
      if (pendingSend || voice) return setAgentStatus("Esperando você concluir o envio manual…")
      if (flat(composer()?.innerText)) return setAgentStatus("Esperando você terminar de digitar…")
      if (await openUnreadLead()) return
      const r = await api("agent_agenda", {})
      if (!r.ok) {
        agent.nextAt = Date.now() + 60_000
        return setAgentStatus(r.data?.erro || "O Operacional OS não respondeu.", "warn")
      }
      const p = r.data
      const c = p.counts || {}
      const tail = ` · ${c.sent ?? 0} hoje${c.forHuman ? ` · ${c.forHuman} com humano` : ""}`
      if (p.state !== "agir" || !p.action) {
        agent.nextAt = Date.now() + Math.max(15, p.retryAfterSec || 60) * 1000
        return setAgentStatus((p.state === "aguardar" ? `Próximo envio às ${hhmm(agent.nextAt)}.` : PLAN_TEXT[p.state] || p.state) + tail, p.state === "desligado" ? "warn" : "")
      }
      const d = digits(p.lead?.contact)
      await saveJob({ kind: p.action.kind, leadId: p.action.leadId, step: p.action.step, name: p.lead?.name || "lead", phone: d.length <= 11 ? `55${d}` : d, at: Date.now(), phase: "nova" })
      await runJob(agent.job)
    } catch (e) {
      agent.nextAt = Date.now() + 60_000
      // Extensão recarregada com o WhatsApp aberto: este painel antigo não fala mais com ela.
      setAgentStatus(/context invalidated/i.test(String(e?.message || e)) ? RELOAD : e.message || String(e), "warn")
    } finally {
      agent.running = false
    }
  }
  setInterval(agentTick, 3000)

  // ---------- acompanha a conversa aberta e as mensagens novas ----------
  let busy = false
  let ticks = 0
  async function watch() {
    if (busy) return
    busy = true
    try {
      if (!host.isConnected && document.body) document.body.appendChild(host)
      const title = main() ? chatTitle() : ""
      if (title !== state.title) {
        if (tab !== "chat") setTab("chat")
        await load(title)
        return
      }
      const lead = state.data?.lead
      const last = lastMessage()
      if (lead && ++ticks % 4 === 0) await reconcile()
      if (!lead || !last || last.id === baselineLast) return
      baselineLast = last.id
      // O agente está enviando: quem registra é ele (não registrar duas vezes).
      if (agent.sending) return
      if (!last.incoming && pendingSend && pendingSend.leadId === lead.id && pendingSend.title === title) {
        // A pessoa apertou Enter: registra o passo.
        const p = pendingSend
        pendingSend = null
        voice = null
        await act("sent", { step: p.step, text: p.text }, "Enviado e registrado no Operacional OS.")
      } else {
        // Enviou algo sem o botão (digitou, mandou áudio/vídeo) ou ele respondeu: a leitura da conversa acerta a etapa.
        await reconcile()
        // Com o agente ligado, toda resposta conta (ele decide o que fazer), não só a que libera um passo.
        if (last.incoming && (state.data?.next?.waitingReply || agent.on)) await act("replied", { auto: true }, "Ele respondeu — próximo passo liberado.")
      }
    } finally {
      busy = false
    }
  }
  setInterval(watch, 1200)
})()
