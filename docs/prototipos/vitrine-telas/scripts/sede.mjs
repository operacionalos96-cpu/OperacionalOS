// Sede 3D: prédio de dia, de noite, demonstração e dentro do andar 03.
import { launch, sleep } from "./cdp.mjs"
import fs from "node:fs"

const tema = process.argv[2] ?? "claro"
const out = "raw"
fs.mkdirSync(out, { recursive: true })
const c = await launch({ port: 9340 })
await c.goto("http://localhost:3040/", 500)
const hoje = new Date().toISOString().slice(0, 10)
await c.eval(`(()=>{localStorage.setItem("hzk-os-guide-first","1");localStorage.setItem("hzk-os-guide-day","${hoje}");localStorage.setItem("hzk-os-guide-hint","1");localStorage.setItem("theme","${tema === "escuro" ? "dark" : "light"}");return 1})()`)

async function guia() {
  for (let i = 0; i < 4; i++) {
    const r = await c.eval(`(()=>{const d=document.querySelector('.fixed.inset-0.z-50');if(!d)return 0;const b=[...d.querySelectorAll('button')].find(b=>/^Agora não$/.test(b.textContent.trim()));if(b){b.click();return 2}(d.querySelector('button')||d).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return 1})()`)
    if (!r) return; await sleep(900)
  }
}
const shot0 = c.shot.bind(c)
c.shot = async (f) => { await guia(); await sleep(400); await guia(); return shot0(f) }
async function clickText(sel, re) {
  const box = await c.eval(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>${re}.test(e.textContent.trim()));if(!e)return null;e.scrollIntoView({block:"center"});e.click();return 1})()`)
  if (!box) { console.log("não achei", re); return false }
  return true
}

await c.goto("http://localhost:3040/ai-office", 4000)
await clickText("button,[role=tab]", /^Sede 3D$/)
const ok = await c.waitFor(`/áreas ativas/.test(document.body.innerText)`, 90000)
console.log("pronto:", ok, await c.eval(`(document.body.innerText.match(/\\d+ áreas ativas[^\\n]*/)||[""])[0]`))
await c.eval(`window.scrollTo(0,0)`)
await sleep(6000)
// parar o giro para a foto ficar nítida
await clickText("button", /^Girando$/)
await clickText("button", /^Dia$/); await sleep(3500)
await c.shot(`${out}/sede-dia-${tema}.png`)
await clickText("button", /^Noite$/); await sleep(3500)
await c.shot(`${out}/sede-noite-${tema}.png`)
await clickText("button", /^Dia$/); await sleep(2500)
await clickText("button", /^Demonstração$/); await sleep(9000)
await c.shot(`${out}/sede-demo-${tema}.png`)
await sleep(9000)
await c.shot(`${out}/sede-demo2-${tema}.png`)
// entrar no andar 03
await c.eval(`(()=>{const s=document.querySelector("select");const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set;set.call(s,"3");s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()`)
await sleep(6000)
await c.shot(`${out}/sede-andar3-${tema}.png`)
await sleep(8000)
await c.shot(`${out}/sede-andar3b-${tema}.png`)
console.log("erros:", JSON.stringify(c.errors.slice(0, 8)))
await c.close()
