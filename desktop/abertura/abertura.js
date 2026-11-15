/*
 * Tela de abertura do app (nota 39, Parte A).
 *
 * No app: o processo principal manda o estado pela ponte window.oposAbertura (preload-abertura.ts).
 * No navegador comum (prévia): ?estado=conferindo|baixando|pc|pc-aguardando|pc-desligado|motor|pronto|offline
 * e &tema=claro|escuro. Extras da prévia: &progresso=42, &pc=Nome, &codigo=K7Q2, &ias=Ollama,LM%20Studio,
 * &versao=0.1.0, &movimento=reduzido. Sem ?estado e sem ponte, roda a sequência de demonstração em laço.
 *
 * Texto sempre por textContent: nada que vem de fora vira HTML.
 */
"use strict"
;(function () {
  const q = new URLSearchParams(location.search)
  const raiz = document.documentElement
  const tela = document.getElementById("abertura")
  const $ = (id) => document.getElementById(id)
  const ponte = typeof window.oposAbertura === "object" && window.oposAbertura && typeof window.oposAbertura.aoMudar === "function" ? window.oposAbertura : null

  // ---------- tema ----------
  const escuroDoSistema = window.matchMedia("(prefers-color-scheme: dark)")
  function aplicarTema(t) {
    raiz.dataset.tema = t === "claro" || t === "escuro" ? t : escuroDoSistema.matches ? "escuro" : "claro"
  }
  const temaPedido = q.get("tema")
  aplicarTema(temaPedido)
  escuroDoSistema.addEventListener("change", () => {
    if (temaPedido !== "claro" && temaPedido !== "escuro") aplicarTema(null)
  })

  const versao = (q.get("versao") || "0.1.0").replace(/[^0-9A-Za-z.+-]/g, "").slice(0, 24)
  $("versao").textContent = "v" + versao

  const reduzido = q.get("movimento") === "reduzido" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  raiz.classList.toggle("sem-movimento", reduzido)

  // ---------- fases ----------
  // travados = quantos nós já encaixaram (uma etapa concluída = um nó)
  const FASES = {
    conferindo: { etapa: 1, travados: 0, barra: "indeterminada", status: "Conferindo atualização…" },
    baixando: { etapa: 1, travados: 0, barra: "progresso", status: "Baixando atualização…" },
    pc: { etapa: 2, travados: 1, barra: "indeterminada", status: "Conferindo este PC…" },
    "pc-aguardando": { etapa: 2, travados: 1, barra: "nenhuma", status: "Aguardando liberação de um founder" },
    "pc-desligado": { etapa: 2, travados: 0, barra: "nenhuma", status: "Este PC foi desligado do OperacionalOS" },
    motor: { etapa: 3, travados: 2, barra: "indeterminada", status: "Ligando seus bots…" },
    pronto: { etapa: 3, travados: 3, barra: "cheia", status: "Pronto" },
    offline: { etapa: 3, travados: 3, barra: "cheia", status: "Sem internet: abrindo em modo limitado" },
  }

  const limpa = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "")
  const mb = (n) => (n / 1048576).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " MB"

  function detalhePara(fase, d) {
    if (d.detalhe) return limpa(d.detalhe, 140)
    switch (fase) {
      case "conferindo":
        return "Procurando uma versão nova do app"
      case "baixando": {
        const p = Math.round(d.progresso || 0)
        return d.total ? `${p}% · ${mb(d.baixado || 0)} de ${mb(d.total)} · instala ao reiniciar` : `${p}% · instala ao reiniciar`
      }
      case "pc":
        return "Conferindo a liberação deste PC"
      case "pc-aguardando":
        return `“${limpa(d.pcNome, 60) || "Este PC"}” pediu acesso. Um founder aprova em Dock › PCs.`
      case "pc-desligado":
        return "Um founder (ou você) desligou este PC. Com esta credencial, o app não abre."
      case "motor": {
        const ias = Array.isArray(d.ias) ? d.ias.map((x) => limpa(x, 24)).filter(Boolean).slice(0, 3) : []
        return ias.length ? `IA local encontrada: ${ias.join(", ")}` : "Preparando o motor local do HZK Dock"
      }
      case "pronto":
        return d.semMotor ? "Abrindo. O Dock está sem motor neste PC." : "Abrindo o OperacionalOS"
      case "offline":
        return "IA local e pastas seguem. O resto volta com a conexão."
      default:
        return ""
    }
  }

  let faseAtual = null
  function aplicar(d) {
    if (!d || typeof d !== "object" || !Object.prototype.hasOwnProperty.call(FASES, d.fase)) return
    const f = FASES[d.fase]
    const mudouFase = d.fase !== faseAtual
    faseAtual = d.fase
    tela.dataset.fase = d.fase

    const status = $("status")
    if (mudouFase) {
      status.textContent = f.status
      status.classList.remove("entra")
      void status.offsetWidth // reinicia a entrada do texto
      status.classList.add("entra")
    }
    $("detalhe").textContent = detalhePara(d.fase, d)
    $("etapa").textContent = `${f.etapa} de 3`

    const barra = $("barra")
    barra.dataset.modo = f.barra
    $("barra-cheia").style.width = f.barra === "progresso" ? Math.max(2, Math.min(100, Number(d.progresso) || 0)) + "%" : ""

    const codigo = limpa(d.pcCodigo, 8) // igual à dica que o founder vê: maiúsculas e minúsculas contam
    $("codigo").hidden = !(d.fase === "pc-aguardando" && codigo)
    $("codigo-valor").textContent = codigo

    $("acoes").hidden = d.fase !== "pc-desligado"

    orbita.definir(f.travados, d.fase)
  }

  // ---------- órbitas ----------
  const SOBE = -51.63 // a diagonal do Z do símbolo (de baixo à esquerda para cima à direita)
  const DESCE = SOBE + 180
  const orbita = (function () {
    const nos = [
      { r: 50, alvo: SOBE, vel: 64 },
      { r: 68, alvo: DESCE, vel: 46 },
      { r: 86, alvo: SOBE, vel: 34 },
    ].map((n, i) => {
      const el = $("no-" + i)
      return { ...n, el, rastro: el.querySelector(".rastro"), a: reduzido ? n.alvo : n.alvo + 90 + i * 115, v: n.vel, modo: "livre", tw: null }
    })

    // a linha do Z liga o nó do meio (embaixo, à esquerda) ao de fora (em cima, à direita)
    const ponto = (r, g) => [r * Math.cos((g * Math.PI) / 180), r * Math.sin((g * Math.PI) / 180)]
    const [x1, y1] = ponto(68, DESCE)
    const [x2, y2] = ponto(86, SOBE)
    const linha = $("linha-z")
    linha.setAttribute("x1", x1.toFixed(2))
    linha.setAttribute("y1", y1.toFixed(2))
    linha.setAttribute("x2", x2.toFixed(2))
    linha.setAttribute("y2", y2.toFixed(2))
    const comprimento = Math.hypot(x2 - x1, y2 - y1)
    linha.setAttribute("stroke-dasharray", comprimento.toFixed(1))
    linha.style.setProperty("--comprimento", comprimento.toFixed(1))

    let travados = 0
    let fase = null
    let zFeito = false
    let tz = null

    function encaixar(n, rapido) {
      if (n.modo === "indo" || n.modo === "preso") return
      if (reduzido) {
        n.a = n.alvo
        n.modo = "preso"
        n.el.classList.add("encaixado")
        return
      }
      // o próximo ponto da diagonal à frente, com pelo menos ~150° de volta: o nó acelera e encaixa
      let para = n.alvo
      while (para < n.a + 150) para += 360
      while (para > n.a + 510) para -= 360
      n.tw = { de: n.a, para, t0: performance.now(), dur: rapido ? 700 : 900 }
      n.modo = "indo"
    }
    function soltar(n) {
      n.el.classList.remove("encaixado", "clique")
      n.modo = "livre"
      n.v = 0
      n.tw = null
    }

    function definir(qtd, f) {
      fase = f
      travados = qtd
      const desligado = f === "pc-desligado"
      nos.forEach((n, i) => {
        if (desligado) {
          if (n.modo !== "preso") n.modo = "parando"
          return
        }
        if (i < qtd) encaixar(n, f === "pronto" || f === "offline")
        else if (n.modo !== "livre") soltar(n)
      })
      if (!(f === "pronto" || f === "offline")) {
        zFeito = false
        clearTimeout(tz)
        tela.classList.remove("z", "acende")
      }
      if (reduzido) {
        nos.forEach((n) => n.el.classList.toggle("encaixado", n.modo === "preso"))
        desenhar(0)
        conferirZ()
      }
    }

    function conferirZ() {
      if (zFeito || travados < 3 || !(fase === "pronto" || fase === "offline")) return
      if (!nos.every((n) => n.modo === "preso")) return
      zFeito = true
      tela.classList.add("z")
      if (fase === "pronto") {
        if (reduzido) tela.classList.add("acende")
        else tz = setTimeout(() => tela.classList.add("acende"), 160)
      }
    }

    const easeOut = (t) => 1 - Math.pow(1 - t, 3)
    function desenhar(velocidades) {
      nos.forEach((n, i) => {
        const vel = Math.abs(velocidades ? velocidades[i] : 0)
        n.el.setAttribute("transform", `rotate(${(n.a % 360).toFixed(3)})`)
        // rastro: um arco curto atrás do nó, maior quanto mais rápido
        const graus = Math.min(70, vel * 0.32)
        if (graus < 1 || reduzido) {
          n.rastro.style.opacity = "0"
          return
        }
        const px = (n.r * graus * Math.PI) / 180
        const volta = 2 * Math.PI * n.r
        n.rastro.setAttribute("stroke-dasharray", `${px.toFixed(2)} ${volta.toFixed(2)}`)
        n.rastro.setAttribute("transform", `rotate(${(-graus).toFixed(2)})`)
        n.rastro.style.opacity = Math.min(0.55, 0.12 + vel / 900).toFixed(3)
      })
    }

    let antes = performance.now()
    function quadro(agora) {
      const dt = Math.min(0.05, (agora - antes) / 1000) // aba escondida não dá salto
      antes = agora
      const vels = nos.map((n) => {
        if (n.modo === "livre") {
          n.v += (n.vel - n.v) * Math.min(1, dt * 2.5)
          n.a += n.v * dt
          return n.v
        }
        if (n.modo === "parando") {
          n.v *= Math.exp(-dt * 2.4)
          n.a += n.v * dt
          return n.v
        }
        if (n.modo === "indo") {
          const t = Math.min(1, (agora - n.tw.t0) / n.tw.dur)
          const novo = n.tw.de + (n.tw.para - n.tw.de) * easeOut(t)
          const v = (novo - n.a) / Math.max(dt, 0.001)
          n.a = novo
          if (t >= 1) {
            n.a = n.tw.para
            n.modo = "preso"
            n.v = 0
            n.el.classList.add("encaixado", "clique")
            setTimeout(() => n.el.classList.remove("clique"), 750)
            conferirZ()
          }
          return v
        }
        return 0
      })
      desenhar(vels)
      requestAnimationFrame(quadro)
    }
    if (reduzido) desenhar(0)
    else requestAnimationFrame(quadro)

    return { definir }
  })()

  // ---------- ações do "PC desligado" ----------
  function fechar() {
    if (ponte) ponte.escolher("fechar")
    else window.close()
  }
  $("botao-fechar").addEventListener("click", fechar)
  $("botao-pedir").addEventListener("click", () => {
    if (ponte) ponte.escolher("pedir-de-novo")
  })
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && faseAtual === "pc-desligado") fechar()
  })

  // ---------- origem do estado ----------
  if (ponte) {
    ponte.aoMudar(aplicar)
    aplicar({ fase: "conferindo" })
    return
  }
  const pedido = q.get("estado")
  const extras = {
    progresso: Number(q.get("progresso") || 42),
    baixado: 18.3 * 1048576 * (Number(q.get("progresso") || 42) / 42),
    total: 43.6 * 1048576,
    pcNome: q.get("pc") || "PC do Gabriel",
    pcCodigo: q.get("codigo") || "K7Q2",
    ias: (q.get("ias") || "Ollama").split(",").filter(Boolean),
  }
  if (pedido && FASES[pedido]) {
    // na prévia, o estado entra depois de um instante para mostrar o movimento até ele
    aplicar({ fase: "conferindo" })
    const ordem = ["conferindo", "pc", "motor"]
    const ate = FASES[pedido].travados
    let passo = 0
    const seguir = () => {
      if (passo < ate && passo < ordem.length - 1 && !reduzido) {
        passo++
        aplicar({ fase: ordem[passo], ...extras })
        setTimeout(seguir, 260)
      } else aplicar({ fase: pedido, ...extras })
    }
    setTimeout(seguir, reduzido ? 0 : 120)
    return
  }
  // demonstração em laço: a sequência real de um PC liberado
  const roteiro = [
    ["conferindo", 1500],
    ["pc", 1300],
    ["motor", 1500],
    ["pronto", 2800],
  ]
  let i = 0
  const tocar = () => {
    const [fase, ms] = roteiro[i % roteiro.length]
    aplicar({ fase, ...extras })
    i++
    setTimeout(tocar, ms)
  }
  tocar()
})()
