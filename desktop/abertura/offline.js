// Modo limitado: "Tentar de novo" volta ao endereço do OperacionalOS (só http/https; o processo principal
// ainda confere a origem antes de deixar navegar). Tenta sozinho a cada 30 s.
"use strict"
;(function () {
  const q = new URLSearchParams(location.search)
  const t = q.get("tema")
  document.documentElement.dataset.tema = t === "claro" || t === "escuro" ? t : matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro"
  let volta = null
  try {
    const u = new URL(q.get("volta") || "")
    if (u.protocol === "https:" || u.protocol === "http:") volta = u.href
  } catch {
    volta = null
  }
  const tentar = () => {
    if (volta) location.href = volta
  }
  document.getElementById("tentar").addEventListener("click", tentar)
  setInterval(() => {
    if (navigator.onLine) tentar()
  }, 30000)
})()
