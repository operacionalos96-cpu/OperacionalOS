// Vitrine do OperacionalOS: o app completo em modo demonstração.
// Dados de exemplo guardados só neste PC. Nada toca o banco real e não precisa de login.
//
// Como usar (na pasta do projeto):  npm run vitrine
//
// Instala o que falta (só na primeira vez), liga o site em modo demonstração, monta todas as telas
// de uma vez (para o primeiro clique não demorar) e abre o app para PC. Ao fechar o app, o site
// que este comando ligou é desligado junto.
//
// Roda pelo Node, e não por um arquivo .cmd, porque o Windows bloqueia .cmd baixado da internet.
// Porta: 3040 (outra com VITRINE_PORTA=3045 npm run vitrine).

import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..")
const DESKTOP = join(RAIZ, "desktop")
const PORTA = Number(process.env.VITRINE_PORTA || 3040)
const BASE = `http://localhost:${PORTA}`
const WIN = process.platform === "win32"
const NPM = WIN ? "npm.cmd" : "npm"

const TELAS = [
  "/", "/agenda", "/caixa-de-entrada", "/tarefas", "/pipeline", "/prospeccao", "/clientes", "/produtos",
  "/conteudos", "/mapas", "/metas", "/decisoes", "/financeiro", "/equipe", "/cofre", "/configuracoes",
  "/ai-office", "/dock", "/dock/bots", "/dock/apps", "/dock/skills", "/dock/provedores", "/dock/uso",
  "/dock/rotinas", "/dock/pc",
]

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function parar(msg) {
  console.error(`\n${msg}`)
  process.exit(1)
}

/** Roda um comando do npm e espera terminar. No Windows o npm é um .cmd local do Node, por isso o shell. */
function npm(args, cwd, env = process.env) {
  const r = spawnSync(NPM, args, { cwd, env, stdio: "inherit", shell: WIN })
  if (r.status !== 0) parar(`Falhou: npm ${args.join(" ")} (em ${cwd}). Veja as mensagens acima.`)
}

async function noAr() {
  try {
    const r = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

async function main() {
  const [maior] = process.versions.node.split(".").map(Number)
  if (maior < 20) parar(`Este PC tem o Node.js ${process.versions.node}. Instale o 20 ou mais novo (https://nodejs.org) e rode de novo.`)

  if (!existsSync(join(RAIZ, "node_modules", "next", "package.json"))) {
    console.log("[1/4] Instalando o site. Só na primeira vez, leva um ou dois minutos...")
    npm(["ci", "--no-audit", "--no-fund"], RAIZ)
  }
  if (!existsSync(join(DESKTOP, "node_modules", "electron", "package.json"))) {
    console.log("[2/4] Instalando o app para PC. Só na primeira vez...")
    npm(["ci", "--no-audit", "--no-fund"], DESKTOP)
  }
  if (!existsSync(join(DESKTOP, "node_modules", "electron", "dist", WIN ? "electron.exe" : "electron"))) {
    console.log("Baixando o Electron...")
    const r = spawnSync(process.execPath, [join(DESKTOP, "node_modules", "electron", "install.js")], { cwd: DESKTOP, stdio: "inherit" })
    if (r.status !== 0) parar("Não deu para baixar o Electron. Confira a internet e rode de novo.")
  }

  let site = null
  if (await noAr()) {
    console.log(`[3/4] O site já está no ar em ${BASE}.`)
  } else {
    console.log(`[3/4] Ligando o site de demonstração em ${BASE}...`)
    site = spawn(NPM, ["run", "dev", "--", "-p", String(PORTA)], {
      cwd: RAIZ,
      env: { ...process.env, NEXT_PUBLIC_SANDBOX: "1" },
      stdio: "ignore",
      shell: WIN,
      windowsHide: true,
    })
    let pronto = false
    for (let i = 0; i < 120 && !pronto; i++) {
      if (site.exitCode !== null) parar("O site parou antes de ligar. Rode de novo; se repetir, confira se a porta está livre.")
      pronto = await noAr()
      if (!pronto) await dormir(1000)
    }
    if (!pronto) parar("O site não respondeu em dois minutos.")
  }

  console.log("[4/4] Preparando as telas, cerca de meio minuto...")
  for (const [i, t] of TELAS.entries()) {
    process.stdout.write(`\r  ${i + 1}/${TELAS.length} ${t}`.padEnd(40))
    try {
      await fetch(BASE + t, { signal: AbortSignal.timeout(120_000) })
    } catch {
      // uma tela que não respondeu só vai demorar no primeiro clique
    }
  }

  console.log("\n\nAbrindo o app. Para encerrar, é só fechar o app.")
  const app = spawnSync(NPM, ["run", "start"], {
    cwd: DESKTOP,
    env: { ...process.env, OPOS_URL: BASE },
    stdio: "inherit",
    shell: WIN,
  })

  if (site) {
    // desliga o site que este comando ligou (no Windows, a árvore inteira do npm)
    if (WIN) spawnSync("taskkill", ["/pid", String(site.pid), "/T", "/F"], { stdio: "ignore" })
    else site.kill()
  }
  process.exit(app.status ?? 0)
}

main().catch((e) => parar(String(e?.stack || e)))
