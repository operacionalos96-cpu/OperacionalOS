// Driver mínimo de Chrome por CDP (sem dependências: usa o WebSocket nativo do Node).
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ port = 9333, width = 1600, height = 900, scale = 2, profile } = {}) {
  const dir = profile ?? fs.mkdtempSync(path.join(os.tmpdir(), "deck-prof-"))
  const proc = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`,
    `--window-size=${width},${height}`, `--force-device-scale-factor=${scale}`,
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl",
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "about:blank",
  ], { stdio: "ignore" })
  let ver
  for (let i = 0; i < 60; i++) {
    try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break } catch { await sleep(250) }
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((t) => t.type === "page")
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener("open", r, { once: true }))
  let id = 0
  const pend = new Map()
  const listeners = []
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result) }
    else if (m.method) listeners.forEach((f) => f(m))
  })
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })) })
  await send("Page.enable"); await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false })
  const errors = []
  listeners.push((m) => {
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text)
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "))
  })
  const api = {
    send, errors,
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    },
    async goto(url, wait = 2500) {
      const loaded = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { listeners.splice(listeners.indexOf(f), 1); r() } }; listeners.push(f) })
      await send("Page.navigate", { url })
      await Promise.race([loaded, sleep(60000)])
      await sleep(wait)
    },
    async waitFor(expr, timeout = 30000) {
      const t0 = Date.now()
      while (Date.now() - t0 < timeout) { try { if (await api.eval(expr)) return true } catch {} await sleep(300) }
      return false
    },
    async shot(file, clip) {
      const p = { format: file.endsWith(".jpg") ? "jpeg" : "png", captureBeyondViewport: false }
      if (p.format === "jpeg") p.quality = 92
      if (clip) p.clip = { ...clip, scale: 1 }
      const r = await send("Page.captureScreenshot", p)
      fs.writeFileSync(file, Buffer.from(r.data, "base64"))
    },
    async click(x, y) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 })
    },
    async key(key, code = key, keyCode = 0) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode })
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode })
    },
    async close() { try { await send("Browser.close") } catch {} ; proc.kill() },
  }
  return api
}
