// Única ponte com o Operacional OS: o token fica no chrome.storage.local (só desta extensão)
// e nunca vai para a página do WhatsApp.
const DEFAULT_BASE = "https://operacional-os.vercel.app"

async function config() {
  const { token = "", apiBase = DEFAULT_BASE } = await chrome.storage.local.get(["token", "apiBase"])
  return { token, apiBase: apiBase.replace(/\/+$/, "") }
}

async function api(action, body) {
  const { token, apiBase } = await config()
  if (!token) return { ok: false, status: 0, data: { erro: "Extensão sem token: clique no ícone e cole o token gerado em Prospecção › Funil › Conectar extensão." } }
  try {
    const res = await fetch(`${apiBase}/api/ext/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { erro: "Sem conexão com o Operacional OS." } }
  }
}

/** Plano B para baixar o áudio/vídeo do funil (só links assinados do Storage do Supabase). */
async function media(url) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/sign\/conteudos\/funil\//.test(url)) return { ok: false, erro: "link inválido" }
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, erro: "link expirado — reabra a conversa" }
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ""
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000))
    return { ok: true, dataUrl: `data:${res.headers.get("content-type") || "application/octet-stream"};base64,${btoa(bin)}` }
  } catch {
    return { ok: false, erro: "não consegui baixar o arquivo" }
  }
}

const ACTIONS = new Set(["ping", "funnel", "lookup", "sent", "replied", "stop", "today", "sync", "agent_agenda", "agent_sent", "agent_reply", "agent_free_sent", "agent_human"])

/** Abre a conversa na aba do WhatsApp Web que já existe (ou cria uma, se não houver) e traz ela para frente. */
async function openWhats(url) {
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" })
  if (!tab) {
    await chrome.tabs.create({ url })
    return { ok: true, nova: true }
  }
  await chrome.tabs.update(tab.id, { url, active: true })
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {})
  return { ok: true }
}
const SYSTEM = /^(https:\/\/operacional-os\.vercel\.app|http:\/\/localhost:3000)\//
const WHATS_LINK = /^https:\/\/web\.whatsapp\.com\/send\?phone=\d{10,15}(&text=[^#]*)?$/

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Pedido do próprio Operacional OS (bridge.js): abrir a conversa na aba do WhatsApp já aberta.
  if (msg?.type === "openWhats" && sender.id === chrome.runtime.id && SYSTEM.test(sender.url || "") && typeof msg.url === "string" && WHATS_LINK.test(msg.url)) {
    openWhats(msg.url).then(reply, (e) => reply({ ok: false, erro: String(e?.message || e) }))
    return true
  }
  // Só aceita pedidos do próprio popup ou do WhatsApp Web.
  const from = sender.url || ""
  if (!msg || sender.id !== chrome.runtime.id || !(from.startsWith("https://web.whatsapp.com/") || from.startsWith(`chrome-extension://${chrome.runtime.id}/`))) return false
  // Agente: abre a conversa do número NA MESMA aba, pelo Chrome (a página do WhatsApp não consegue trocar o próprio endereço).
  if (msg.type === "open" && typeof msg.phone === "string" && /^\d{10,15}$/.test(msg.phone) && sender.tab?.id) {
    chrome.tabs.update(sender.tab.id, { url: `https://web.whatsapp.com/send?phone=${msg.phone}` }).then(
      () => reply({ ok: true }),
      (e) => reply({ ok: false, erro: String(e?.message || e) }),
    )
    return true
  }
  if (msg.type === "media" && typeof msg.url === "string") {
    media(msg.url).then(reply)
    return true
  }
  if (msg.type !== "api" || !ACTIONS.has(msg.action)) return false
  api(msg.action, msg.body).then(reply)
  return true
})
