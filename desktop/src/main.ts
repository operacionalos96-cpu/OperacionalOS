/**
 * App do OperacionalOS para Windows (fatia 3 da nota 32; desenho na nota 27).
 *
 * Janela: abre o OperacionalOS PUBLICADO (o mesmo site), com o login dele. Uma mudança publicada na Vercel
 * aparece no app sem reinstalar; só a casca e o motor dependem de atualização.
 * Travas da janela:
 *  - só navega no domínio do OperacionalOS; link de fora abre no navegador padrão (só https);
 *  - sem nodeIntegration, com contextIsolation e sandbox; webview proibido; permissões negadas;
 *  - a ponte (window.opos) só responde ao quadro principal da janela, na origem do OperacionalOS;
 *  - fusíveis do Electron no empacotamento (sem RunAsNode, sem NODE_OPTIONS, asar conferido).
 * Motor: roda aqui no processo principal (desktop/src/engine), com o cofre cifrado pelo Windows (DPAPI).
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, safeStorage, session, shell, type IpcMainInvokeEvent } from "electron"
import { createHash, randomBytes } from "node:crypto"
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import nodePath from "node:path"
import { serverClient } from "./engine/client"
import { LEVEL_CEILING, createEngine, type Engine, type EngineLog } from "./engine/engine"
import { createFolderGuard } from "./engine/folders"
import { PROVIDERS, safeEndpoint } from "./engine/providers"
import { fileVault, iaKeyName, redact } from "./engine/vault"
import { settingsStore, type ThemeMode } from "./settings"

const PUBLISHED = "https://operacional-os.vercel.app"
// Só fora do pacote dá para apontar para outro endereço (desenvolvimento). O app instalado abre sempre o publicado.
const APP_URL = !app.isPackaged && process.env.OPOS_URL ? process.env.OPOS_URL : PUBLISHED
const ORIGIN = new URL(APP_URL).origin
const PARTITION = "persist:operacionalos"
const SELFTEST = process.argv.includes("--autoteste")

if (!app.requestSingleInstanceLock()) app.quit()
app.enableSandbox()

let win: BrowserWindow | null = null
let engine: Engine | null = null
const dataDir = () => app.getPath("userData")
const settings = () => (store ??= settingsStore(nodePath.join(dataDir(), "configuracao.json")))
let store: ReturnType<typeof settingsStore> | undefined
const vault = () =>
  fileVault(nodePath.join(dataDir(), "cofre.bin"), {
    encrypt: (p) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error("cofre do Windows indisponível")
      return safeStorage.encryptString(p)
    },
    decrypt: (d) => safeStorage.decryptString(d),
  })

// ---------- registro local (só a pessoa vê) ----------
function logLocal(e: EngineLog | Record<string, unknown>) {
  try {
    const dir = nodePath.join(dataDir(), "registro")
    mkdirSync(dir, { recursive: true })
    appendFileSync(nodePath.join(dir, `${new Date().toISOString().slice(0, 7)}.jsonl`), redact(JSON.stringify({ ...e, at: new Date().toISOString() })) + "\n")
  } catch {
    /* o registro nunca derruba o app */
  }
}

// ---------- tema ----------
const THEME: Record<ThemeMode, "light" | "dark" | "system"> = { claro: "light", escuro: "dark", sistema: "system" }
function applyTheme(mode: ThemeMode) {
  nativeTheme.themeSource = THEME[mode]
  win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0e0f12" : "#f6f5f2")
}

// ---------- quem pode chamar a ponte ----------
function trusted(e: IpcMainInvokeEvent) {
  try {
    return !!win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && new URL(e.senderFrame.url).origin === ORIGIN
  } catch {
    return false
  }
}
const AGENT = /^agt_[0-9A-HJKMNP-TV-Z]{26}$/
const CONN = /^con_[0-9A-HJKMNP-TV-Z]{26}$/
function handle(channel: string, fn: (...args: unknown[]) => unknown) {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!trusted(e)) {
      logLocal({ event: "ponte_recusada", detail: channel })
      throw new Error("recusado")
    }
    return fn(...args)
  })
}
async function confirm(title: string, message: string, detail: string, ok = "Confirmar") {
  const r = await dialog.showMessageBox(win!, { type: "question", title, message, detail, buttons: [ok, "Cancelar"], defaultId: 1, cancelId: 1, noLink: true })
  return r.response === 0
}

// ---------- motor ----------
function forbiddenFolder(p: string) {
  const n = p.toLowerCase().replace(/[\\/]+$/, "")
  const bad = [process.env.SystemRoot, process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.ProgramData, app.getPath("home"), dataDir(), nodePath.dirname(app.getPath("exe"))]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase().replace(/[\\/]+$/, ""))
  return /^[a-z]:$/.test(n) || bad.includes(n) || bad.some((b) => b.startsWith(n + "\\"))
}
async function startEngine() {
  if (engine && !engine.stopped) return { ok: true, state: engine.state }
  const token = await vault().get("pc/token")
  if (!token) return { ok: false, reason: "este PC ainda não foi pareado" }
  const s = settings()
  engine = createEngine({
    client: serverClient({ baseUrl: ORIGIN, token }),
    vault: vault(),
    foldersFor: (agentId) => {
      const roots = s.get().folders[agentId] ?? []
      return roots.length ? createFolderGuard({ roots, trash: (p) => shell.trashItem(p), log: (e) => logLocal({ event: "pasta", agent: agentId, ...e }) }) : null
    },
    confirmedLevel: (agentId) => s.get().levels[agentId] ?? 0,
    confirmedEndpoint: (connectionId) => s.get().endpoints[connectionId] ?? null,
    log: logLocal,
    onState: (state, info) => win?.webContents.send("opos:engine-state", { state, ...info }),
  })
  void engine.run()
  return { ok: true }
}

function registerBridge() {
  handle("opos:version", () => ({ app: app.getVersion(), electron: process.versions.electron, levelCeiling: LEVEL_CEILING }))
  handle("opos:theme:get", () => settings().get().theme)
  handle("opos:theme:set", (mode: unknown) => {
    if (mode !== "claro" && mode !== "escuro" && mode !== "sistema") throw new Error("tema inválido")
    settings().update((s) => void (s.theme = mode))
    applyTheme(mode)
    return mode
  })
  handle("opos:pc:status", async () => ({ paired: await vault().has("pc/token"), engine: engine?.state ?? "parado", name: settings().get().pcName }))
  handle("opos:pc:pair", async (name: unknown) => {
    const n = typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : `PC de ${process.env.USERNAME ?? "alguém"}`
    if (!(await confirm("Liberar este PC", `Pedir para liberar este PC como "${n}"?`, "Um founder precisa aprovar. Depois disso, os bots desta conta podem responder por este PC, no nível que você escolher para cada um.", "Pedir"))) return null
    const token = `oos_${randomBytes(32).toString("base64url")}`
    await vault().set("pc/token", token)
    settings().update((s) => void (s.pcName = n))
    logLocal({ event: "pareamento_pedido", detail: n })
    // só o hash sai do PC; a tela chama office_request_pc com ele
    return { name: n, token_hash: createHash("sha256").update(token).digest("hex"), token_hint: token.slice(-4) }
  })
  handle("opos:pc:start", () => startEngine())
  handle("opos:pc:stop", async () => {
    await engine?.stopAll()
    return { ok: true }
  })
  handle("opos:pc:forget", async () => {
    if (!(await confirm("Esquecer este PC", "Apagar a credencial deste PC?", "O motor para. Para usar de novo, o PC pede liberação outra vez."))) return false
    await engine?.stopAll()
    await vault().delete("pc/token")
    return true
  })
  handle("opos:folders:list", (agentId: unknown) => (typeof agentId === "string" && AGENT.test(agentId) ? settings().get().folders[agentId] ?? [] : []))
  handle("opos:folders:add", async (agentId: unknown, botName: unknown) => {
    if (typeof agentId !== "string" || !AGENT.test(agentId)) throw new Error("bot inválido")
    const bot = typeof botName === "string" ? botName.slice(0, 60) : "este bot"
    const r = await dialog.showOpenDialog(win!, { title: `Pasta liberada para ${bot}`, properties: ["openDirectory", "createDirectory"] })
    if (r.canceled || !r.filePaths[0]) return null
    const real = realpathSync.native(r.filePaths[0])
    if (forbiddenFolder(real)) {
      await dialog.showMessageBox(win!, { type: "warning", message: "Esta pasta não pode ser liberada.", detail: "Unidade inteira, pasta do Windows, de programas, a pasta do usuário inteira e a do próprio app ficam de fora. Escolha uma pasta de trabalho." })
      return null
    }
    if (!(await confirm("Liberar pasta", `Liberar "${real}" para ${bot}?`, "O bot poderá ler, escrever e mandar para a lixeira dentro desta pasta (nível 1). Fora dela, o motor recusa.", "Liberar"))) return null
    settings().update((s) => void (s.folders[agentId] = [...new Set([...(s.folders[agentId] ?? []), real])]))
    logLocal({ event: "pasta_liberada", agent: agentId, detail: real })
    return real
  })
  handle("opos:folders:remove", (agentId: unknown, p: unknown) => {
    if (typeof agentId !== "string" || !AGENT.test(agentId) || typeof p !== "string") throw new Error("inválido")
    settings().update((s) => void (s.folders[agentId] = (s.folders[agentId] ?? []).filter((x) => x !== p)))
    logLocal({ event: "pasta_removida", agent: agentId, detail: p })
    return true
  })
  handle("opos:level:get", (agentId: unknown) => (typeof agentId === "string" ? settings().get().levels[agentId] ?? 0 : 0))
  handle("opos:level:confirm", async (agentId: unknown, level: unknown, botName: unknown) => {
    if (typeof agentId !== "string" || !AGENT.test(agentId) || (level !== 0 && level !== 1)) throw new Error("nível não liberado nesta versão")
    const bot = typeof botName === "string" ? botName.slice(0, 60) : "este bot"
    if (level === 1 && !(await confirm("Subir nível", `Subir ${bot} para o nível 1 (pastas) neste PC?`, "O bot poderá ler e escrever nas pastas que você liberar para ele. Rodar programas (nível 2) e controlar o PC (nível 3) não existem nesta versão.", "Subir para 1"))) return settings().get().levels[agentId] ?? 0
    settings().update((s) => void (s.levels[agentId] = level))
    logLocal({ event: "nivel", agent: agentId, detail: String(level) })
    return level
  })
  const keyName = (connectionId: unknown, provider: unknown, endpoint: unknown) => {
    if (typeof connectionId !== "string" || !CONN.test(connectionId) || typeof provider !== "string") throw new Error("inválido")
    const ep = typeof endpoint === "string" && endpoint ? safeEndpoint(endpoint) : PROVIDERS[provider]?.base ?? null
    if (!ep) throw new Error("endereço inválido")
    return { name: iaKeyName(connectionId, ep), endpoint: ep, custom: typeof endpoint === "string" && !!endpoint }
  }
  handle("opos:keys:save", async (connectionId: unknown, provider: unknown, key: unknown, endpoint: unknown) => {
    const k = keyName(connectionId, provider, endpoint)
    if (typeof key !== "string" || key.length < 8 || key.length > 4000 || /\s/.test(key)) throw new Error("chave inválida")
    const label = PROVIDERS[String(provider)]?.label ?? String(provider)
    if (!(await confirm("Guardar chave", `Guardar a chave de ${label} no cofre do Windows?`, `Ela só será enviada para ${k.endpoint}. Nunca vai ao servidor do OperacionalOS nem aparece de novo na tela.`, "Guardar"))) return false
    await vault().set(k.name, key)
    if (k.custom) settings().update((s) => void (s.endpoints[connectionId as string] = k.endpoint))
    logLocal({ event: "chave_guardada", detail: `${label} ${k.endpoint}` })
    return true
  })
  handle("opos:keys:has", async (c: unknown, p: unknown, e: unknown) => vault().has(keyName(c, p, e).name))
  handle("opos:keys:remove", async (c: unknown, p: unknown, e: unknown) => {
    await vault().delete(keyName(c, p, e).name)
    return true
  })
  handle("opos:log:open", () => shell.openPath(nodePath.join(dataDir(), "registro")))
}

// ---------- janela travada ----------
function lockSession() {
  const ses = session.fromPartition(PARTITION)
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "clipboard-sanitized-write"))
  ses.setPermissionCheckHandler((_wc, permission) => permission === "clipboard-sanitized-write")
  ses.setDevicePermissionHandler(() => false)
  ses.setDisplayMediaRequestHandler((_req, cb) => cb({}))
  ses.on("will-download", (e) => e.preventDefault())
}
const isInternal = (url: string) => {
  try {
    return new URL(url).origin === ORIGIN
  } catch {
    return false
  }
}
const openOutside = (url: string) => {
  if (SELFTEST) return void logLocal({ event: "abriria_fora", detail: url.slice(0, 200) })
  try {
    if (new URL(url).protocol === "https:") void shell.openExternal(url)
  } catch {
    /* endereço inválido: ignora */
  }
}

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (ev) => ev.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url)
    return { action: "deny" }
  })
  const guard = (ev: { preventDefault(): void }, url: string) => {
    if (!isInternal(url)) {
      ev.preventDefault()
      openOutside(url)
      logLocal({ event: "navegacao_bloqueada", detail: url.slice(0, 200) })
    }
  }
  contents.on("will-navigate", (ev, url) => guard(ev, url))
  contents.on("will-redirect", (ev, url) => guard(ev, url))
})

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 380,
    minHeight: 560,
    title: "OperacionalOS",
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0e0f12" : "#f6f5f2",
    autoHideMenuBar: true,
    webPreferences: {
      preload: nodePath.join(__dirname, "preload.js"),
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: true,
      devTools: !app.isPackaged,
    },
  })
  win.once("ready-to-show", () => {
    if (!SELFTEST) win?.show()
  })
  win.on("closed", () => (win = null))
  void win.loadURL(APP_URL)
  return win
}

function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "OperacionalOS",
        submenu: [
          { label: "Recarregar", accelerator: "F5", click: () => win?.webContents.reload() },
          { label: "Parar tudo (motor do PC)", accelerator: "CmdOrCtrl+Shift+P", click: () => void engine?.stopAll() },
          { label: "Abrir registro local", click: () => void shell.openPath(nodePath.join(dataDir(), "registro")) },
          ...(app.isPackaged ? [] : [{ role: "toggleDevTools" as const }]),
          { type: "separator" },
          { role: "quit", label: "Sair" },
        ],
      },
      { role: "editMenu", label: "Editar" },
      { role: "viewMenu", label: "Exibir", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }] },
    ]),
  )
}

async function checkUpdates() {
  if (!app.isPackaged || SELFTEST) return
  try {
    const { autoUpdater } = await import("electron-updater")
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true // instala ao reiniciar o app
    autoUpdater.on("update-downloaded", (i) => logLocal({ event: "atualizacao_baixada", detail: i.version }))
    autoUpdater.on("error", (e) => logLocal({ event: "atualizacao_falhou", detail: String(e?.message ?? e).slice(0, 200) }))
    await autoUpdater.checkForUpdates()
  } catch (e) {
    logLocal({ event: "atualizacao_falhou", detail: String((e as Error).message).slice(0, 200) })
  }
}

/** --autoteste: abre a janela escondida, confere as travas de dentro da página e grava um relatório. */
async function selfTest(w: BrowserWindow) {
  const wc = w.webContents
  await new Promise<void>((ok) => (wc.isLoading() ? wc.once("did-stop-loading", () => ok()) : ok()))
  const page = await wc.executeJavaScript(`({
    url: location.href, title: document.title,
    require: typeof require, process: typeof process, module: typeof module,
    opos: typeof window.opos, oposKeys: window.opos ? Object.keys(window.opos) : [],
    frozen: window.opos ? Object.isFrozen(window.opos) : null
  })`)
  await wc.executeJavaScript(`location.href = "https://example.com/"; true`).catch(() => null)
  await new Promise((r) => setTimeout(r, 1500))
  const afterNav = wc.getURL()
  const popup = await wc.executeJavaScript(`String(window.open("https://example.com/"))`).catch((e) => String(e))
  const prefs = (wc as unknown as { getLastWebPreferences?: () => Record<string, unknown> }).getLastWebPreferences?.() ?? {}
  // tema: a página enxerga a escolha (o next-themes do site segue prefers-color-scheme no modo "sistema")
  const dark = "matchMedia('(prefers-color-scheme: dark)').matches"
  const before = settings().get().theme
  applyTheme("escuro")
  await new Promise((r) => setTimeout(r, 300))
  const pageDark = await wc.executeJavaScript(dark)
  applyTheme("claro")
  await new Promise((r) => setTimeout(r, 300))
  const pageLight = !(await wc.executeJavaScript(dark))
  applyTheme(before)
  // atualização: procura e baixa a versão nova no endereço configurado (só com --autoteste-atualizacao)
  let update: Record<string, unknown> | null = null
  if (process.argv.includes("--autoteste-atualizacao")) {
    const { autoUpdater } = await import("electron-updater")
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    update = await new Promise((ok) => {
      const t = setTimeout(() => ok({ result: "tempo esgotado" }), 120_000)
      autoUpdater.once("update-not-available", (i) => (clearTimeout(t), ok({ result: "sem versão nova", version: i.version })))
      autoUpdater.once("update-downloaded", (i) => (clearTimeout(t), ok({ result: "baixada e conferida", version: i.version, file: nodePath.basename(i.downloadedFile) })))
      autoUpdater.once("error", (e) => (clearTimeout(t), ok({ result: "erro", detail: String(e?.message ?? e).slice(0, 300) })))
      autoUpdater.checkForUpdates().catch((e) => (clearTimeout(t), ok({ result: "erro", detail: String(e?.message ?? e).slice(0, 300) })))
    })
  }
  const report = {
    at: new Date().toISOString(),
    app: app.getVersion(),
    electron: process.versions.electron,
    packaged: app.isPackaged,
    loaded: APP_URL,
    page,
    navigationToOutside: { attempted: "https://example.com/", stayedOn: afterNav, blocked: isInternal(afterNav) },
    windowOpen: popup,
    webPreferences: { contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, nodeIntegration: prefs.nodeIntegration, webviewTag: prefs.webviewTag, webSecurity: prefs.webSecurity },
    theme: { mode: settings().get().theme, source: nativeTheme.themeSource, pageSawDark: pageDark, pageSawLight: pageLight },
    update,
    vaultEncryption: safeStorage.isEncryptionAvailable(),
  }
  writeFileSync(nodePath.join(dataDir(), "autoteste.json"), JSON.stringify(report, null, 2))
  // retrato da janela (prova visual); nunca deixa o teste pendurado
  const shot = await Promise.race([wc.capturePage().then((i) => i.toPNG()), new Promise<null>((r) => setTimeout(() => r(null), 5000))]).catch(() => null)
  if (shot?.length) writeFileSync(nodePath.join(dataDir(), "autoteste.png"), shot)
  app.quit()
}

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
app.on("window-all-closed", () => app.quit())
app.on("before-quit", () => void engine?.stopAll())

void app.whenReady().then(async () => {
  lockSession()
  registerBridge()
  buildMenu()
  applyTheme(settings().get().theme)
  nativeTheme.on("updated", () => win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0e0f12" : "#f6f5f2"))
  const w = createWindow()
  if (SELFTEST) return void selfTest(w)
  void checkUpdates()
  // PC já pareado: o motor começa sozinho (o servidor recusa se o PC não foi aprovado ou foi desligado)
  if (await vault().has("pc/token").catch(() => false)) void startEngine()
})
