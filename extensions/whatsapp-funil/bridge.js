// Ponte com o Operacional OS: quando o sistema abre uma conversa no WhatsApp Web, a extensão usa a aba
// do WhatsApp que já está aberta (em vez de abrir outra). Só aceita link de conversa do WhatsApp Web.
;(() => {
  "use strict"
  // Avisa o sistema que a extensão está instalada (src/lib/whatsapp-open.ts).
  document.documentElement.dataset.oosFunil = "1"
  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return
    const url = e.data?.__oosOpenWhatsapp
    if (typeof url !== "string" || !/^https:\/\/web\.whatsapp\.com\/send\?phone=\d{10,15}(&text=[^#]*)?$/.test(url)) return
    chrome.runtime.sendMessage({ type: "openWhats", url }).catch(() => {})
  })
})()
