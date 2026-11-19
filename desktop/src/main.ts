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
 * Abertura (nota 39): janela pequena antes da principal, com as etapas reais (atualização, este PC, motor).
 * Bandeja: fechar a janela com o motor ligado deixa o app na bandeja, com "Abrir" e "Parar tudo".
 * Bolinha (opcional, ligada por padrão): com a janela minimizada ou na bandeja, a esfera da Órbita fica
 * na área de trabalho mostrando o estado do motor; clique abre, arraste move, botão direito dá o menu.
 */
import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, net, safeStorage, screen, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from "electron"
import { createHash, randomBytes } from "node:crypto"
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs"
import nodePath from "node:path"
import { classificarPc, codigoCurto, faltaParaMinimo, type EstadoPc } from "./abertura-estado"
import { BOLINHA_LADO, deveMostrarBolinha, foiArraste, posicaoBolinha, textoBolinha, visualDoMotor, type Ponto, type VisualBolinha } from "./bolinha-regras"
import { StopError, serverClient } from "./engine/client"
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
let splash: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
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
    onState: (state, info) => {
      win?.webContents.send("opos:engine-state", { state, ...info })
      // o servidor aceitou o PC: daqui em diante, um 401 quer dizer "desligado" (e não "aguardando")
      if ((state === "esperando" || state === "trabalhando") && !settings().get().pcSeenApproved) settings().update((s) => void (s.pcSeenApproved = true))
      updateTray(state)
      enviarEstadoBolinha()
    },
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
    settings().update((s) => void (s.pcSeenApproved = false))
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
  // bolinha na área de trabalho (interruptor em Dock › PC)
  handle("opos:float:get", () => ({ enabled: settings().get().float.enabled }))
  handle("opos:float:set", (enabled: unknown) => {
    if (typeof enabled !== "boolean") throw new Error("valor inválido")
    return definirBolinha(enabled)
  })
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
    icon: ICONE,
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
  win.on("close", (e) => {
    // motor ligado: a janela some, o app fica na bandeja e os bots seguem respondendo
    if (quitting || SELFTEST || !engine || engine.stopped) return
    e.preventDefault()
    win?.hide()
    showTrayHint()
  })
  win.on("closed", () => {
    win = null
    fecharBolinha()
  })
  // minimizou ou foi para a bandeja: a bolinha aparece (se ligada); voltou por qualquer caminho: ela some
  win.on("minimize", atualizarBolinha)
  win.on("hide", atualizarBolinha)
  win.on("restore", atualizarBolinha)
  win.on("show", atualizarBolinha)
  win.on("focus", atualizarBolinha)
  // sem internet (ou site fora do ar): mostra a página local do modo limitado no lugar do erro do Chromium
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isInternal(url)) return
    void win?.loadFile(nodePath.join(ABERTURA_DIR, "offline.html"), { query: { volta: APP_URL, tema: currentTheme() } })
  })
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

// ---------- abertura (nota 39, Parte A) ----------
const ABERTURA_DIR = nodePath.join(__dirname, "..", "abertura")
// ícone multi-tamanho (16 a 256): a barra de tarefas e a bandeja escolhem o tamanho certo para o DPI
const ICONE = nodePath.join(__dirname, "..", "abertura", "icone.ico")
const currentTheme = (): "claro" | "escuro" => (nativeTheme.shouldUseDarkColors ? "escuro" : "claro")
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
type FaseAbertura = "conferindo" | "baixando" | "pc" | "pc-aguardando" | "pc-desligado" | "motor" | "pronto" | "offline"
interface EstadoAbertura {
  fase: FaseAbertura
  progresso?: number
  baixado?: number
  total?: number
  pcNome?: string
  pcCodigo?: string
  ias?: string[]
  semMotor?: boolean
}
let bootStart = 0
const bootLog: { fase: FaseAbertura; ms: number }[] = []
let escolhaAbertura: ((v: "fechar" | "pedir-de-novo") => void) | null = null

function sendSplash(d: EstadoAbertura) {
  bootLog.push({ fase: d.fase, ms: Date.now() - bootStart })
  if (splash && !splash.isDestroyed()) splash.webContents.send("abertura:estado", d)
}

function createSplash() {
  const dark = nativeTheme.shouldUseDarkColors
  splash = new BrowserWindow({
    width: 480,
    height: 300,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    center: true,
    show: false,
    title: "OperacionalOS",
    icon: ICONE,
    backgroundColor: dark ? "#121418" : "#f1f1ed",
    webPreferences: {
      preload: nodePath.join(__dirname, "preload-abertura.js"),
      partition: "abertura", // sessão própria, só em memória: não toca no login do site
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })
  const s = splash
  s.on("closed", () => {
    splash = null
    escolhaAbertura?.("fechar")
  })
  const pronta = new Promise<void>((ok) => {
    s.webContents.once("did-finish-load", () => ok())
    setTimeout(ok, 3000) // nunca trava a abertura por causa da própria tela
  })
  s.once("ready-to-show", () => s.show())
  void s.loadFile(nodePath.join(ABERTURA_DIR, "index.html"), { query: { tema: currentTheme(), versao: app.getVersion() } })
  return pronta
}

/** Some a abertura e mostra a principal com um esmaecer curto (~220 ms). */
async function revealMain(w: BrowserWindow) {
  const s = splash
  if (SELFTEST) {
    if (s && !s.isDestroyed()) s.destroy()
    return
  }
  w.setOpacity(0)
  w.show()
  const passos = 12
  for (let i = 1; i <= passos; i++) {
    await sleep(18)
    if (w.isDestroyed()) break
    w.setOpacity(i / passos)
    if (s && !s.isDestroyed()) s.setOpacity(1 - i / passos)
  }
  if (!w.isDestroyed()) w.setOpacity(1)
  if (s && !s.isDestroyed()) s.destroy()
}

/** Há conexão com o OperacionalOS? Qualquer resposta HTTP conta. */
async function isOnline() {
  try {
    await net.fetch(ORIGIN, { method: "HEAD", signal: AbortSignal.timeout(5000) })
    return true
  } catch {
    return false
  }
}

/** IAs locais conhecidas, só para avisar na abertura (nada é lido além de "respondeu"). */
async function findLocalAI() {
  const alvos: [string, string][] = [
    ["Ollama", "http://127.0.0.1:11434/api/tags"],
    ["LM Studio", "http://127.0.0.1:1234/v1/models"],
  ]
  const r = await Promise.all(
    alvos.map(async ([nome, url]) => {
      try {
        const res = await net.fetch(url, { signal: AbortSignal.timeout(700) })
        return res.ok ? nome : null
      } catch {
        return null
      }
    }),
  )
  return r.filter((x): x is string => !!x)
}

/** Etapa 1: versão nova. Conferir leva no máximo 8 s; baixar mostra a barra e segura no máximo 20 s
 *  (depois continua baixando por trás e instala ao reiniciar). Falhou: segue com a versão atual. */
async function stepUpdate() {
  if (!app.isPackaged || SELFTEST) return "fora do pacote"
  let autoUpdater: typeof import("electron-updater").autoUpdater
  try {
    autoUpdater = (await import("electron-updater")).autoUpdater
  } catch (e) {
    logLocal({ event: "atualizacao_falhou", detail: String((e as Error).message).slice(0, 200) })
    return "falhou"
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true // instala ao reiniciar o app
  autoUpdater.on("update-downloaded", (i) => logLocal({ event: "atualizacao_baixada", detail: i.version }))
  autoUpdater.on("error", (e) => logLocal({ event: "atualizacao_falhou", detail: String(e?.message ?? e).slice(0, 200) }))
  return new Promise<string>((ok) => {
    let feito = false
    let limite = setTimeout(() => fim("tempo esgotado"), 8000)
    const progresso = (p: { percent: number; transferred: number; total: number }) =>
      sendSplash({ fase: "baixando", progresso: p.percent, baixado: p.transferred, total: p.total })
    const disponivel = () => {
      clearTimeout(limite)
      limite = setTimeout(() => fim("baixando por trás"), 20_000)
      sendSplash({ fase: "baixando", progresso: 0 })
    }
    const nada = () => fim("sem versão nova")
    const baixada = () => fim("baixada")
    const erro = () => fim("falhou")
    function fim(r: string) {
      if (feito) return
      feito = true
      clearTimeout(limite)
      autoUpdater.removeListener("download-progress", progresso)
      autoUpdater.removeListener("update-available", disponivel)
      autoUpdater.removeListener("update-not-available", nada)
      autoUpdater.removeListener("update-downloaded", baixada)
      autoUpdater.removeListener("error", erro)
      ok(r)
    }
    autoUpdater.on("download-progress", progresso)
    autoUpdater.on("update-available", disponivel)
    autoUpdater.on("update-not-available", nada)
    autoUpdater.on("update-downloaded", baixada)
    autoUpdater.on("error", erro)
    autoUpdater.checkForUpdates().catch(() => fim("falhou"))
  })
}

/** Etapa 2: este PC. Uma leitura simples (get_worker_config) com o token do PC diz se ele está liberado. */
async function checkPc(online: boolean): Promise<{ estado: EstadoPc; token: string | null }> {
  const token = await vault()
    .get("pc/token")
    .catch(() => null)
  if (!token || !online) return { estado: classificarPc({ temToken: !!token, online, jaAprovado: settings().get().pcSeenApproved }), token }
  let sonda: "ok" | "401" | "falha" = "falha"
  try {
    await serverClient({ baseUrl: ORIGIN, token, timeoutMs: 6000 }).call("get_worker_config")
    sonda = "ok"
  } catch (e) {
    sonda = e instanceof StopError ? "401" : "falha"
  }
  const estado = classificarPc({ temToken: true, online, sonda, jaAprovado: settings().get().pcSeenApproved })
  if (estado === "aprovado" && !settings().get().pcSeenApproved) settings().update((s) => void (s.pcSeenApproved = true))
  return { estado, token }
}

/** PC aguardando liberação: confere de novo a cada minuto e liga o motor quando um founder aprovar. */
function watchApproval() {
  const t = setInterval(async () => {
    const r = await checkPc(true).catch(() => null)
    if (r?.estado === "aprovado") {
      clearInterval(t)
      logLocal({ event: "pc_liberado" })
      void startEngine()
    } else if (!r?.token) clearInterval(t)
  }, 60_000)
}

/** A sequência real da abertura. */
async function boot() {
  bootStart = Date.now()
  await createSplash()
  sendSplash({ fase: "conferindo" })
  const onlineP = isOnline()
  const w = createWindow() // o site já começa a carregar escondido, enquanto as etapas rodam
  const update = await stepUpdate()
  logLocal({ event: "abertura_atualizacao", detail: update })
  const online = await onlineP

  sendSplash({ fase: "pc" })
  let pc = await checkPc(online)
  if (pc.estado === "desligado") {
    sendSplash({ fase: "pc-desligado" })
    logLocal({ event: "abertura_pc_desligado" })
    const escolha = await new Promise<"fechar" | "pedir-de-novo">((ok) => (escolhaAbertura = ok))
    escolhaAbertura = null
    const pai = splash && !splash.isDestroyed() ? splash : undefined
    const pedir =
      escolha === "pedir-de-novo" &&
      (
        await (pai
          ? dialog.showMessageBox(pai, { type: "question", title: "Pedir liberação de novo", message: "Apagar a credencial deste PC e pedir a liberação outra vez?", detail: "O app abre e você faz o pedido em Dock › PCs. Um founder precisa aprovar.", buttons: ["Apagar e abrir", "Cancelar"], defaultId: 1, cancelId: 1, noLink: true })
          : Promise.resolve({ response: 1 }))
      ).response === 0
    if (!pedir) {
      quitting = true
      w.destroy()
      app.quit()
      return
    }
    await vault().delete("pc/token")
    settings().update((s) => void (s.pcSeenApproved = false))
    logLocal({ event: "pc_credencial_apagada" })
    pc = { estado: "sem-pc", token: null }
  }
  if (pc.estado === "aguardando" && pc.token) {
    sendSplash({ fase: "pc-aguardando", pcNome: settings().get().pcName || "Este PC", pcCodigo: codigoCurto(pc.token) })
    await sleep(3200) // tempo de ler o nome e o código; depois o app abre e o motor espera a aprovação
    watchApproval()
  }

  sendSplash({ fase: "motor" })
  const iasP = findLocalAI()
  let semMotor = true
  // aprovado, sem internet ou resposta incerta: o motor liga e tenta sozinho (o servidor recusa se não puder)
  if (!SELFTEST && pc.token && (pc.estado === "aprovado" || pc.estado === "offline" || pc.estado === "incerto")) semMotor = !(await startEngine()).ok
  const ias = await iasP
  if (ias.length) sendSplash({ fase: "motor", ias })
  // espera o site ficar pronto (no máximo 12 s) e cumpre o mínimo de 1,2 s na tela
  await Promise.race([new Promise<void>((ok) => (w.webContents.isLoading() ? w.webContents.once("did-stop-loading", () => ok()) : ok())), sleep(12_000)])
  await sleep(faltaParaMinimo(bootStart, Date.now()))

  sendSplash(online ? { fase: "pronto", semMotor: semMotor && pc.estado !== "aguardando" && pc.estado !== "sem-pc" } : { fase: "offline" })
  await sleep(online ? 1250 : 1600) // os nós se alinham no Z e o laranja acende uma vez
  if (SELFTEST) await captureSplash()
  await revealMain(w)
  if (SELFTEST) return void selfTest(w)
}

async function captureSplash() {
  const s = splash
  if (!s || s.isDestroyed()) return
  const shot = await Promise.race([s.webContents.capturePage().then((i) => i.toPNG()), sleep(3000).then(() => null)]).catch(() => null)
  if (shot?.length) writeFileSync(nodePath.join(dataDir(), "autoteste-abertura.png"), shot)
}

// ---------- bandeja do Windows ----------
let trayHinted = false
function ensureTray() {
  if (tray) return tray
  tray = new Tray(nativeImage.createFromPath(ICONE))
  tray.setToolTip("OperacionalOS")
  tray.setContextMenu(trayMenu())
  tray.on("click", showMain)
  tray.on("double-click", showMain)
  return tray
}
async function pararTudo() {
  await engine?.stopAll()
  // com a janela escondida e o motor parado, não há mais motivo para ficar na bandeja
  if (!win?.isVisible()) app.quit()
}
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Abrir", click: showMain },
    { label: "Parar tudo", click: () => void pararTudo() },
    { type: "separator" },
    { label: "Bolinha na área de trabalho", type: "checkbox", checked: settings().get().float.enabled, click: (item) => void definirBolinha(item.checked) },
    { type: "separator" },
    { label: "Sair", click: () => app.quit() },
  ])
}
function showMain() {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.moveTop()
  win.focus()
  atualizarBolinha()
}
function showTrayHint() {
  const t = ensureTray()
  updateTray(engine?.state ?? "parado")
  if (trayHinted) return
  trayHinted = true
  t.displayBalloon({ title: "O OperacionalOS continua na bandeja", content: "Seus bots seguem respondendo por este PC. Para parar, use Parar tudo.", iconType: "info", noSound: true })
}
const TRAY_TEXT: Record<string, string> = { esperando: "motor ligado, esperando trabalho", trabalhando: "motor trabalhando", erro: "motor tentando de novo", parado: "motor parado", desligado: "PC desligado" }
function updateTray(state: string) {
  if (!tray) return
  tray.setToolTip(`OperacionalOS: ${TRAY_TEXT[state] ?? state}`)
  // escondido e sem motor (parou ou o PC foi desligado): fecha de vez
  if ((state === "parado" || state === "desligado") && win && !win.isVisible() && !quitting) app.quit()
}

// ---------- bolinha na área de trabalho ----------
const BOLINHA_DIR = nodePath.join(__dirname, "..", "bolinha")
let bolinha: BrowserWindow | null = null
let bolinhaPronta = false
let arraste: { cursor: Ponto; janela: Ponto; moveu: boolean } | null = null
/** só no autoteste: força um visual para retratar cada estado */
let visualForcado: VisualBolinha | null = null

const areasDeTrabalho = () => screen.getAllDisplays().map((d) => d.workArea)

function estadoBolinha() {
  const visual = visualForcado ?? visualDoMotor(engine?.state ?? "parado")
  return { visual, tema: currentTheme(), texto: textoBolinha(visual) }
}
function enviarEstadoBolinha() {
  if (bolinha && !bolinha.isDestroyed() && bolinhaPronta) bolinha.webContents.send("bolinha:estado", estadoBolinha())
}

function criarBolinha() {
  bolinhaPronta = false
  const b = new BrowserWindow({
    width: BOLINHA_LADO,
    height: BOLINHA_LADO,
    useContentSize: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // fora da barra de tarefas
    alwaysOnTop: true,
    focusable: false, // não rouba o foco de quem está trabalhando
    show: false,
    title: "OperacionalOS",
    icon: ICONE,
    webPreferences: {
      preload: nodePath.join(__dirname, "preload-bolinha.js"),
      partition: "bolinha", // sessão própria, só em memória
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  })
  b.setAlwaysOnTop(true, "floating")
  b.on("closed", () => {
    if (bolinha === b) bolinha = null
    arraste = null
  })
  b.webContents.once("did-finish-load", () => {
    bolinhaPronta = true
    enviarEstadoBolinha()
    atualizarBolinha() // pode ter sido pedida enquanto carregava
  })
  void b.loadFile(nodePath.join(BOLINHA_DIR, "index.html"), { query: { tema: currentTheme() } })
  return b
}

function posicionarBolinha(b: BrowserWindow) {
  const f = settings().get().float
  const p = posicaoBolinha(f.x === null || f.y === null ? null : { x: f.x, y: f.y }, areasDeTrabalho(), screen.getPrimaryDisplay().workArea)
  b.setBounds({ x: p.x, y: p.y, width: BOLINHA_LADO, height: BOLINHA_LADO })
}

/** Mostra ou esconde a bolinha conforme a opção e o estado da janela principal. */
function atualizarBolinha() {
  const vivo = !!win && !win.isDestroyed()
  const mostrar = deveMostrarBolinha({ ligada: settings().get().float.enabled, janelaExiste: vivo, minimizada: vivo && win!.isMinimized(), visivel: vivo && win!.isVisible(), saindo: quitting })
  if (!mostrar) {
    arraste = null
    if (bolinha && !bolinha.isDestroyed() && bolinha.isVisible()) bolinha.hide()
    return
  }
  const b = bolinha && !bolinha.isDestroyed() ? bolinha : (bolinha = criarBolinha())
  if (!bolinhaPronta) return // o did-finish-load chama de novo
  if (!b.isVisible()) {
    posicionarBolinha(b)
    b.showInactive()
    b.setAlwaysOnTop(true, "floating")
  }
  enviarEstadoBolinha()
}

function fecharBolinha() {
  arraste = null
  if (bolinha && !bolinha.isDestroyed()) bolinha.destroy()
  bolinha = null
}

function definirBolinha(enabled: boolean) {
  settings().update((s) => void (s.float.enabled = enabled))
  logLocal({ event: "bolinha", detail: enabled ? "ligada" : "desligada" })
  if (!enabled) fecharBolinha()
  else atualizarBolinha()
  tray?.setContextMenu(trayMenu())
  return { enabled }
}

function menuDaBolinha(b: BrowserWindow) {
  const itens: MenuItemConstructorOptions[] = [{ label: "Abrir", click: showMain }]
  if (engine && !engine.stopped) itens.push({ label: "Parar tudo", click: () => void pararTudo() })
  itens.push({ type: "separator" }, { label: "Esconder a bolinha", click: () => void definirBolinha(false) })
  // o Windows só fecha o menu com clique fora se a janela dona estiver em primeiro plano:
  // a bolinha fica focável só enquanto o menu está aberto e volta a não roubar foco ao fechar
  b.setFocusable(true)
  b.focus()
  Menu.buildFromTemplate(itens).popup({
    window: b,
    callback: () => {
      if (!b.isDestroyed()) {
        b.setFocusable(false)
        b.setAlwaysOnTop(true, "floating")
      }
    },
  })
}

/** Avisos da bolinha: só o aviso, sem dados. A posição vem do mouse, lida aqui. */
function ouvirBolinha() {
  ipcMain.on("bolinha:aviso", (e, aviso: unknown) => {
    const b = bolinha
    if (!b || b.isDestroyed() || e.sender !== b.webContents) return
    const guardarPosicao = () => {
      const [x, y] = b.getPosition()
      const p = posicaoBolinha({ x, y }, areasDeTrabalho(), screen.getPrimaryDisplay().workArea)
      b.setBounds({ x: p.x, y: p.y, width: BOLINHA_LADO, height: BOLINHA_LADO })
      settings().update((s) => void ((s.float.x = p.x), (s.float.y = p.y)))
    }
    if (aviso === "apertou") {
      const [x, y] = b.getPosition()
      arraste = { cursor: screen.getCursorScreenPoint(), janela: { x, y }, moveu: false }
    } else if (aviso === "moveu" && arraste) {
      const c = screen.getCursorScreenPoint()
      if (!arraste.moveu && !foiArraste(arraste.cursor, c)) return
      arraste.moveu = true
      b.setBounds({ x: arraste.janela.x + c.x - arraste.cursor.x, y: arraste.janela.y + c.y - arraste.cursor.y, width: BOLINHA_LADO, height: BOLINHA_LADO })
    } else if (aviso === "soltou" && arraste) {
      const a = arraste
      arraste = null
      if (!a.moveu && !foiArraste(a.cursor, screen.getCursorScreenPoint())) return showMain()
      guardarPosicao()
    } else if (aviso === "cancelou") {
      // o soltar se perdeu (menu, outra janela): para de seguir o mouse e nunca abre a janela
      const moveu = arraste?.moveu
      arraste = null
      if (moveu) guardarPosicao()
    } else if (aviso === "menu") {
      arraste = null
      menuDaBolinha(b)
    }
  })
  // monitor tirado ou resolução trocada: confere a posição de novo
  const conferir = () => {
    if (bolinha && !bolinha.isDestroyed() && bolinha.isVisible()) posicionarBolinha(bolinha)
  }
  screen.on("display-removed", conferir)
  screen.on("display-added", conferir)
  screen.on("display-metrics-changed", conferir)
  nativeTheme.on("updated", enviarEstadoBolinha)
}

/** --autoteste-bolinha: liga pela ponte, minimiza, retrata cada estado, clica, desliga pela ponte e confere. */
async function testarBolinha(w: BrowserWindow) {
  const wc = w.webContents
  const r: Record<string, unknown> = {}
  const antes = settings().get().float.enabled
  const ver = () => ({ existe: !!bolinha && !bolinha.isDestroyed(), visivel: !!bolinha && !bolinha.isDestroyed() && bolinha.isVisible(), principalMinimizada: w.isMinimized(), principalVisivel: w.isVisible() })
  r.pontePegou = await wc.executeJavaScript("window.opos.float.get()").catch((e) => String(e))
  r.ponteLigou = await wc.executeJavaScript("window.opos.float.set(true)").catch((e) => String(e))
  r.ponteRecusaLixo = await wc.executeJavaScript(`window.opos.float.set("sim").then(() => "aceitou", () => "recusou")`).catch((e) => String(e))
  w.show()
  await sleep(500)
  r.comJanelaAberta = ver()
  w.minimize()
  await sleep(1500)
  r.minimizada = { ...ver(), bounds: bolinha?.getBounds(), sempreNoTopo: bolinha?.isAlwaysOnTop(), focavel: bolinha?.isFocusable(), areaPrincipal: screen.getPrimaryDisplay().workArea }
  const prefs = (bolinha?.webContents as unknown as { getLastWebPreferences?: () => Record<string, unknown> } | undefined)?.getLastWebPreferences?.() ?? {}
  const pagina = await bolinha?.webContents.executeJavaScript(`({ require: typeof require, process: typeof process, ponte: Object.keys(window.oposBolinha || {}), protocolo: location.protocol })`).catch((e) => String(e))
  r.travas = { contextIsolation: prefs.contextIsolation, sandbox: prefs.sandbox, nodeIntegration: prefs.nodeIntegration, pagina }
  const retratos: string[] = []
  for (const v of ["quieta", "lenta", "girando", "alerta"] as const) {
    visualForcado = v
    enviarEstadoBolinha()
    await sleep(700)
    const png = await bolinha?.webContents.capturePage().then((i) => i.toPNG()).catch(() => null)
    if (png?.length) {
      const f = nodePath.join(dataDir(), `autoteste-bolinha-${v}.png`)
      writeFileSync(f, png)
      retratos.push(f)
    }
  }
  visualForcado = null
  enviarEstadoBolinha()
  r.retratos = retratos
  // clique de verdade dentro da página da bolinha (pointerdown e pointerup), sem mexer o mouse da pessoa
  bolinha?.webContents.sendInputEvent({ type: "mouseDown", x: 36, y: 36, button: "left", clickCount: 1 })
  await sleep(60)
  bolinha?.webContents.sendInputEvent({ type: "mouseUp", x: 36, y: 36, button: "left", clickCount: 1 })
  await sleep(1200)
  r.depoisDoClique = ver()
  // desliga pela ponte: minimizar não mostra mais nada
  r.ponteDesligou = await wc.executeJavaScript("window.opos.float.set(false)").catch((e) => String(e))
  w.minimize()
  await sleep(1200)
  r.desligadaEMinimizada = ver()
  w.restore()
  definirBolinha(antes)
  r.voltouPara = settings().get().float.enabled
  return r
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
    // a abertura passou pelas etapas (fase e milissegundos desde o início); retrato em autoteste-abertura.png
    abertura: { fases: bootLog, minimoCumprido: (bootLog.find((f) => f.fase === "pronto" || f.fase === "offline")?.ms ?? 0) >= 1200 },
    bolinha: process.argv.includes("--autoteste-bolinha") ? await testarBolinha(w) : null,
  }
  writeFileSync(nodePath.join(dataDir(), "autoteste.json"), JSON.stringify(report, null, 2))
  // retrato da janela (prova visual); nunca deixa o teste pendurado
  const shot = await Promise.race([wc.capturePage().then((i) => i.toPNG()), new Promise<null>((r) => setTimeout(() => r(null), 5000))]).catch(() => null)
  if (shot?.length) writeFileSync(nodePath.join(dataDir(), "autoteste.png"), shot)
  app.quit()
}

app.on("second-instance", () => {
  if (win && !splash) showMain()
  else splash?.focus()
})
app.on("window-all-closed", () => app.quit())
app.on("before-quit", () => {
  quitting = true
  fecharBolinha()
  void engine?.stopAll()
})

void app.whenReady().then(async () => {
  lockSession()
  registerBridge()
  ouvirBolinha()
  buildMenu()
  applyTheme(settings().get().theme)
  nativeTheme.on("updated", () => win?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#0e0f12" : "#f6f5f2"))
  ipcMain.on("abertura:escolha", (e, v) => {
    // só a própria tela de abertura, e só um dos dois valores fixos
    if (!splash || e.sender !== splash.webContents || (v !== "fechar" && v !== "pedir-de-novo")) return
    escolhaAbertura?.(v)
  })
  // abertura: atualização, este PC e motor, nesta ordem; depois abre a janela principal
  await boot()
})
