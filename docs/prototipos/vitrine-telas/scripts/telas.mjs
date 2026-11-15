// Captura as telas do app (vitrine, modo demonstração) em 1600x900 @2x.
// uso: node telas.mjs <saida> <tema claro|escuro> rota1 rota2 ...
import { launch, sleep } from "./cdp.mjs"
import path from "node:path"
import fs from "node:fs"

const [out, tema, ...rotas] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const B = "http://localhost:3040"
const c = await launch({ port: 9333 + (tema === "escuro" ? 1 : 0) })
await c.goto(B + "/", 500)
const hoje = new Date().toISOString().slice(0, 10)
await c.eval(`(()=>{localStorage.setItem("hzk-os-guide-first","1");localStorage.setItem("hzk-os-guide-day",${JSON.stringify(hoje)});localStorage.setItem("hzk-os-guide-hint","1");localStorage.setItem("theme",${JSON.stringify(tema === "escuro" ? "dark" : "light")});return 1})()`)

// fecha o guia do dia se ele abrir mesmo assim
const fecharGuia = `(()=>{const d=document.querySelector('.fixed.inset-0.z-50');if(!d)return 0;d.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const b=[...d.querySelectorAll('button')].find(b=>/^Agora não$|minimizar|fechar|depois/i.test(b.getAttribute('aria-label')||b.textContent));if(b)b.click();return 1})()`
for (const r of rotas) {
  const [rota, nome, ...resto] = r.split("="); const acao = resto.join("=")
  await c.goto(B + rota, 4000)
  await c.waitFor(`!document.querySelector('[aria-busy="true"]')`, 15000)
  for (let i = 0; i < 3; i++) { const f = await c.eval(fecharGuia); if (!f) break; await sleep(800) }
  if (acao) { console.log("acao", await c.eval(acao)); await sleep(1500) }
  for (let i = 0; i < 3; i++) { const f = await c.eval(fecharGuia); if (!f) break; await sleep(800) }
  await sleep(1500)
  const file = path.join(out, `${nome}-${tema}.png`)
  await c.shot(file)
  console.log("ok", file)
}
console.log("erros:", JSON.stringify(c.errors.slice(0, 10)))
await c.close()
