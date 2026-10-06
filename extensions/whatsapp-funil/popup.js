const $ = (id) => document.getElementById(id)
const status = (text, ok) => {
  $("status").textContent = text
  $("status").className = ok ? "ok" : "err"
}

chrome.storage.local.get(["token", "apiBase"]).then(({ token, apiBase }) => {
  if (token) $("token").placeholder = `salvo (…${token.slice(-4)}) — cole outro para trocar`
  $("base").value = apiBase || ""
})

$("save").addEventListener("click", async () => {
  const token = $("token").value.trim()
  const base = $("base").value.trim()
  if (token && !/^oos_[A-Za-z0-9_-]{30,}$/.test(token)) return status("Token inválido (começa com oos_).", false)
  if (base && !/^https:\/\/operacional-os\.vercel\.app\/?$|^http:\/\/localhost:3000\/?$/.test(base)) return status("Endereço não permitido.", false)
  await chrome.storage.local.set({ ...(token ? { token } : {}), apiBase: base || "https://operacional-os.vercel.app" })
  $("token").value = ""
  const r = await chrome.runtime.sendMessage({ type: "api", action: "ping" })
  if (r?.ok) status(`Conectado: ${r.data.nome}. Abra/recarregue o WhatsApp Web.`, true)
  else status(r?.data?.erro || "Não conectou.", false)
})
