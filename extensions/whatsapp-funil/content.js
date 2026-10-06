// Funil Operacional OS dentro do WhatsApp Web.
// Regra de ouro: a extensão NUNCA envia mensagem. Ela escreve na caixa de texto e
// a pessoa confere e aperta Enter. Só registra no sistema o que a pessoa fez.
;(() => {
  "use strict"
  if (window.__oosFunil) return
  window.__oosFunil = true

  // ---------- número que veio do link do sistema (web.whatsapp.com/send?phone=…) ----------
  // O WhatsApp troca a URL logo depois de abrir; guardamos antes.
  const urlPhone = new URLSearchParams(location.search).get("phone")
  if (urlPhone && /^\d{10,15}$/.test(urlPhone)) sessionStorage.setItem("oos-url-phone", urlPhone)

  const api = (action, body) => chrome.runtime.sendMessage({ type: "api", action, body }).catch(() => ({ ok: false, data: { erro: "Extensão recarregada — recarregue a página." } }))
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
  function writeInComposer(text) {
    const box = main()?.querySelector('footer div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"][data-tab="10"]')
    if (!box) return false
    box.focus()
    const before = box.textContent
    try {
      const dt = new DataTransfer()
      dt.setData("text/plain", text)
      box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
    } catch {}
    if (box.textContent === before) document.execCommand("insertText", false, text)
    return true
  }

  // ---------- painel (shadow DOM: o CSS do WhatsApp não interfere) ----------
  const host = document.createElement("div")
  host.id = "oos-funil"
  const root = host.attachShadow({ mode: "closed" })
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { position: fixed; top: 0; right: 0; bottom: 0; width: 320px; z-index: 2147483000; background: #fff; color: #111b21; border-left: 1px solid #d1d7db;
        font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; display: flex; flex-direction: column; box-shadow: -4px 0 16px rgba(0,0,0,.06); }
      .wrap.closed { width: 0; border: 0; }
      .toggle { position: fixed; top: 74px; right: 0; z-index: 2147483001; background: #128c4a; color: #fff; border: 0; border-radius: 8px 0 0 8px; padding: 8px 6px; cursor: pointer; font: 600 12px system-ui; writing-mode: vertical-rl; }
      .wrap:not(.closed) + .toggle { right: 320px; }
      header { padding: 12px 14px; border-bottom: 1px solid #e9edef; display: flex; gap: 6px; align-items: center; }
      header b { flex: 1; }
      .tabs button { background: none; border: 0; padding: 4px 8px; border-radius: 6px; cursor: pointer; color: #54656f; font: inherit; }
      .tabs button.on { background: #e7f6ee; color: #0a6b38; font-weight: 600; }
      .body { overflow-y: auto; padding: 14px; flex: 1; }
      .muted { color: #667781; font-size: 12px; }
      .card { border: 1px solid #e9edef; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
      .name { font-weight: 600; font-size: 14px; }
      .steps { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; }
      .chip { font-size: 11px; border: 1px solid #d1d7db; border-radius: 999px; padding: 2px 8px; color: #54656f; }
      .chip.done { background: #e7f6ee; border-color: #b5e2c8; color: #0a6b38; }
      .chip.now { border-color: #128c4a; color: #0a6b38; font-weight: 600; }
      pre { white-space: pre-wrap; font: inherit; background: #f0f2f5; border-radius: 8px; padding: 8px 10px; margin: 6px 0; max-height: 260px; overflow: auto; }
      button.b { display: block; width: 100%; margin-top: 6px; padding: 8px; border-radius: 8px; border: 1px solid #d1d7db; background: #fff; cursor: pointer; font: 600 13px system-ui; color: #111b21; }
      button.b.main { background: #128c4a; border-color: #128c4a; color: #fff; }
      button.b.ghost { border: 0; color: #667781; font-weight: 500; }
      .warn { background: #fff7e6; border: 1px solid #ffd591; border-radius: 8px; padding: 8px 10px; margin: 6px 0; }
      .ok { background: #e7f6ee; border-radius: 8px; padding: 8px 10px; margin: 6px 0; color: #0a6b38; }
      input { width: 100%; box-sizing: border-box; padding: 7px 8px; border: 1px solid #d1d7db; border-radius: 6px; font: inherit; margin-top: 6px; }
      a { color: #027eb5; }
      li { margin-bottom: 8px; cursor: pointer; }
      ul { padding-left: 18px; margin: 0; }
    </style>
    <div class="wrap">
      <header><b>Funil</b><span class="tabs"><button data-tab="chat" class="on">Conversa</button><button data-tab="hoje">Hoje</button></span></header>
      <div class="body"></div>
    </div>
    <button class="toggle" title="Mostrar/esconder o funil">Funil</button>`
  const wrap = root.querySelector(".wrap")
  const body = root.querySelector(".body")
  let tab = "chat"

  const appShrink = (open) => {
    const app = document.querySelector("#app")
    if (app) app.style.width = open ? "calc(100% - 320px)" : ""
  }
  chrome.storage.local.get("panelClosed").then(({ panelClosed }) => {
    wrap.classList.toggle("closed", !!panelClosed)
    appShrink(!panelClosed)
  })
  root.querySelector(".toggle").addEventListener("click", () => {
    const closed = !wrap.classList.contains("closed")
    wrap.classList.toggle("closed", closed)
    appShrink(!closed)
    chrome.storage.local.set({ panelClosed: closed })
  })
  root.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab
      root.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b))
      render()
    }),
  )

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
  const KIND = { texto: "Texto", audio: "Áudio", video: "Vídeo" }
  const when = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "")

  // ---------- estado ----------
  let state = { title: "", phone: null, data: null, error: null, loading: false, note: "" }
  /** Mensagem escrita pela extensão esperando o Enter da pessoa (aí registra sozinho). */
  let pendingSend = null
  let baselineLast = null

  async function load(title) {
    state = { title, phone: null, data: null, error: null, loading: true, note: "" }
    pendingSend = null
    render()
    const phone = await chatPhone(title)
    if (title !== state.title) return
    state.phone = phone
    if (!phone) {
      state.loading = false
      return render()
    }
    const r = await api("lookup", { phone })
    if (title !== state.title) return
    state.loading = false
    if (r.ok) state.data = r.data
    else state.error = r.data?.erro || "Falhou"
    baselineLast = lastMessage()?.id ?? null
    render()
  }

  async function act(action, extra, note) {
    const lead = state.data?.lead
    if (!lead) return
    const r = await api(action, { leadId: lead.id, ...extra })
    if (r.ok) {
      state.data = { found: true, ...r.data }
      state.note = note || ""
    } else state.note = `⚠ ${r.data?.erro || "Não registrou"}`
    render()
  }

  function render() {
    if (tab === "hoje") return renderToday()
    const s = state
    if (!s.title) return (body.innerHTML = `<p class="muted">Abra uma conversa para ver o lead e o próximo passo do funil.</p>`)
    if (s.loading) return (body.innerHTML = `<p class="muted">Procurando ${esc(s.title)} no Operacional OS…</p>`)
    if (s.error) return (body.innerHTML = `<div class="warn">${esc(s.error)}</div>`)
    if (!s.phone) {
      body.innerHTML = `<p class="muted">Não consegui ler o número de <b>${esc(s.title)}</b>.</p><input placeholder="Número com DDD (ex.: 11 97739-0519)" /><button class="b main">Procurar</button>`
      const input = body.querySelector("input")
      body.querySelector("button").onclick = async () => {
        const d = digits(input.value)
        if (d.length < 10) return
        const full = d.length <= 11 ? `55${d}` : d
        await rememberPhone(s.title, full)
        load(s.title)
      }
      return
    }
    if (!s.data?.found) return (body.innerHTML = `<p><b>${esc(s.title)}</b></p><p class="muted">Este número (${esc(s.phone)}) não é de nenhum lead do Operacional OS.</p>`)

    const { lead, funnel, steps, next } = s.data
    const chips = steps.map((x) => `<span class="chip ${x.done ? "done" : next && x.index === next.index ? "now" : ""}">${x.done ? "✓ " : ""}${x.index + 1}. ${esc(x.label)}</span>`).join("")
    let html = `<div class="card"><div class="name">${esc(lead.name)}</div>
      <div class="muted">${esc([lead.company, lead.segment, lead.city].filter(Boolean).join(" · "))}</div>
      ${lead.problems.length ? `<div class="muted" style="margin-top:4px">Problema: ${esc(lead.problems[0])}</div>` : ""}
      <div class="steps">${chips}</div>
      ${funnel.lastSentAt ? `<div class="muted">Última nossa: ${when(funnel.lastSentAt)}${funnel.repliedAt ? ` · respondeu: ${when(funnel.repliedAt)}` : ""}</div>` : ""}
    </div>`
    if (s.note) html += `<div class="${s.note.startsWith("⚠") ? "warn" : "ok"}">${esc(s.note)}</div>`

    if (!next) html += `<p class="muted">${funnel.stopped ? "Fora do funil." : "Funil concluído para este lead."}</p>`
    else if (next.waitingReply) {
      html += `<p><b>Próximo: ${esc(next.label)}</b> (${KIND[next.kind]})</p><div class="warn">Esperando ele responder. Quando a resposta chegar aqui, eu marco sozinho.</div>
        <button class="b" data-a="replied">Ele respondeu</button>`
    } else {
      html += `<p><b>Passo ${next.index + 1}: ${esc(next.label)}</b> · ${KIND[next.kind]}${!next.due ? ` <span class="muted">(vence ${when(next.dueAt)})</span>` : ""}</p>`
      if (next.script) html += `<div class="muted">Roteiro para gravar:</div><pre>${esc(next.script)}</pre>`
      if (next.text) html += `<pre>${esc(next.text)}</pre><button class="b main" data-a="write">Escrever no WhatsApp</button>`
      if (next.kind !== "texto") html += `<div class="muted" style="margin-top:6px">Grave e envie o ${next.kind === "audio" ? "áudio" : "vídeo"} nesta conversa.</div>`
      if (pendingSend) html += `<div class="ok">Escrito na caixa. Confira e aperte <b>Enter</b> — eu registro sozinho quando sair.</div>`
      html += `<button class="b" data-a="sent">${next.kind === "texto" ? "Já enviei" : `Enviei o ${next.kind === "audio" ? "áudio" : "vídeo"}`}</button>`
    }
    if (next) html += `<button class="b ghost" data-a="stop">Tirar do funil</button>`
    body.innerHTML = html

    const on = (a, fn) => body.querySelector(`[data-a="${a}"]`)?.addEventListener("click", fn)
    on("write", () => {
      if (!writeInComposer(next.text)) return (state.note = "⚠ Não achei a caixa de mensagem."), render()
      pendingSend = { leadId: lead.id, step: next.index, text: next.text, title: s.title }
      baselineLast = lastMessage()?.id ?? null
      render()
    })
    on("sent", () => {
      pendingSend = null
      act("sent", { step: next.index, text: next.kind === "texto" ? next.text : "" }, "Registrado no Operacional OS.")
    })
    on("replied", () => act("replied", {}, "Resposta registrada: próximo passo liberado."))
    on("stop", () => confirm("Tirar este lead do funil?") && act("stop", {}, "Lead fora do funil."))
  }

  async function renderToday() {
    body.innerHTML = `<p class="muted">Carregando…</p>`
    const r = await api("today", {})
    if (tab !== "hoje") return
    if (!r.ok) return (body.innerHTML = `<div class="warn">${esc(r.data?.erro || "Falhou")}</div>`)
    const items = r.data.items || []
    if (!items.length) return (body.innerHTML = `<p class="muted">Nenhum passo do funil para hoje. 🎉</p>`)
    body.innerHTML = `<p class="muted">Clique para abrir a conversa.</p><ul>${items
      .map((x, i) => `<li data-i="${i}"><b>${esc(x.name)}</b><br><span class="muted">${x.step + 1}. ${esc(x.label)} · ${KIND[x.kind]}${x.overdue ? " · atrasado" : ""}</span></li>`)
      .join("")}</ul>`
    body.querySelectorAll("li").forEach((li) =>
      li.addEventListener("click", () => {
        const x = items[Number(li.dataset.i)]
        const d = digits(x.contact)
        if (d.length < 10) return
        location.href = `https://web.whatsapp.com/send?phone=${d.length <= 11 ? `55${d}` : d}`
      }),
    )
  }

  // ---------- acompanha a conversa aberta e as mensagens novas ----------
  let busy = false
  async function watch() {
    if (busy) return
    busy = true
    try {
      if (!host.isConnected && document.body) document.body.appendChild(host)
      const title = main() ? chatTitle() : ""
      if (title !== state.title) {
        if (tab !== "chat") {
          tab = "chat"
          root.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x.dataset.tab === "chat"))
        }
        await load(title)
        return
      }
      const lead = state.data?.lead
      const last = lastMessage()
      if (!lead || !last || last.id === baselineLast) return
      baselineLast = last.id
      if (!last.incoming && pendingSend && pendingSend.leadId === lead.id && pendingSend.title === title) {
        // A pessoa apertou Enter: registra o passo.
        const p = pendingSend
        pendingSend = null
        await act("sent", { step: p.step, text: p.text }, "Enviado e registrado no Operacional OS.")
      } else if (last.incoming && state.data.next?.waitingReply) {
        await act("replied", { auto: true }, "Ele respondeu — próximo passo liberado.")
      }
    } finally {
      busy = false
    }
  }
  setInterval(watch, 1200)
})()
