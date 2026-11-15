import { launch, sleep } from "./cdp.mjs"
const [w, h, pref] = [Number(process.argv[2] || 1600), Number(process.argv[3] || 900), process.argv[4] || "sl"]
const c = await launch({ port: 9350, width: w, height: h, scale: 1 })
await c.goto("file:///C:/Users/Gabriel/Documents/OperacionalOS/Desenvolvimento/OperacionalOS-App-vitrine/docs/prototipos/apresentacao-vitrine.html#s1", 2500)
const n = await c.eval(`document.querySelectorAll(".slide").length`)
for (let i = 0; i < n; i++) {
  await c.eval(`location.hash="#s${i+1}";document.querySelectorAll(".dots button")[${i}].click();1`)
  await sleep(i === 1 ? 5200 : 3600)
  await c.shot(`out/${pref}-${String(i+1).padStart(2,"0")}.png`)
}
const info = await c.eval(`[...document.querySelectorAll(".slide")].map((s,i)=>{const r=s.getBoundingClientRect();const over=[...s.querySelectorAll("*")].filter(e=>{const b=e.getBoundingClientRect();return b.width&&(b.right>r.right+1||b.bottom>r.bottom-70)&&!e.closest(".hud")}).map(e=>e.className||e.tagName).slice(0,4);return (i+1)+":"+JSON.stringify(over)})`)
console.log(info.join("\n"))
console.log("erros:", JSON.stringify(c.errors))
await c.close()
