import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js"
import { OutputPass } from "three/addons/postprocessing/OutputPass.js"
import type { SedeOcupado } from "@/lib/domain/office-scene"

/**
 * Sede HZK v2 (plano 38): torre estilizada de 14 andares modelada no Blender e exportada em glTF.
 * Porte do protótipo aprovado `docs/prototipos/sede-blender/web/sede.js` para módulo, sem DOM próprio:
 * a HUD (cabeçalho, registro, cartão do andar, etiqueta) é React em `sede-view.tsx`, que recebe tudo
 * pelos callbacks. Eventos chegam por `applyEvent` já traduzidos em `lib/domain/office-scene` (sedeEventsFor).
 *
 * Coordenadas do Blender (x, y, z) viram (x, z, -y) aqui; giro em Z do Blender = rotation.y.
 * Arquivos em `public/sede/` (a CSP só permite 'self': nada de CDN).
 */

export type SedeLuz = "auto" | "dia" | "noite"

export interface SedeFloorInfo {
  andar: number
  nome: string
  estado: string
  desc: string
  livre: boolean
}

export interface SedeHover extends SedeFloorInfo {
  /** posição do ponteiro dentro do contêiner, em px */
  x: number
  y: number
}

export interface SedeV2Options {
  /** pasta pública dos arquivos (padrão "/sede/") */
  base?: string
  onReady?: () => void
  onError?: (err: unknown) => void
  onHover?: (h: SedeHover | null) => void
  /** entrou num andar (cartão) ou voltou ao prédio (null) */
  onFloor?: (f: SedeFloorInfo | null) => void
  onStatus?: (s: { ativas: number; livres: number }) => void
  /** linhas que a própria cena produz (mudança de área simulada) */
  onLog?: (text: string, alerta: boolean) => void
}

export interface SedeV2Handle {
  applyEvent(ev: { type: string; area?: string | null }): void
  setOcupados(list: SedeOcupado[]): void
  setLuz(mode: SedeLuz): void
  /** cor de fundo da página (tema claro ou escuro do app): o horizonte do céu mistura com ela */
  setFundo(cor: string, escuro: boolean): void
  setAutoRotate(on: boolean): void
  enterFloor(i: number): void
  leaveFloor(): void
  /** encena uma área nova se mudando para o andar livre aberto (não grava nada) */
  simularAreaNova(): void
  stats(): { fps: number[]; calls: number; tris: number; ocupados: number[]; dentro: number | null; carros: number; aneis: number; animacoes: number; decisoes: number }
  dispose(): void
}

// ---------- regras do prédio (iguais às de build/v2_torre.py) ----------
const LOBBY_H = 8, FLOOR_H = 4, SLAB = 0.7, N = 14, CORE = 7, RING = 5.25, ST_R = 8.1
const plan = (i: number) => {
  const t = Math.min(Math.max(i - 1, 0), N - 1) / (N - 1), k = 1 - 0.2 * t
  return { side: 22 * k, r: 3.2 * k, rot: (Math.PI / 4) * t }
}
const level = (i: number) => LOBBY_H + (i - 1) * FLOOR_H
const B = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y)
type P2 = [number, number]
function rrect(w: number, d: number, r: number, n = 4): P2[] {
  const pts: P2[] = []
  const cs: [number, number, number][] = [[w / 2 - r, -d / 2 + r, -90], [w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90], [-w / 2 + r, -d / 2 + r, 180]]
  for (const [cx, cy, a0] of cs)
    for (let k = 0; k <= n; k++) {
      const a = THREE.MathUtils.degToRad(a0 + (90 * k) / n)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  return pts
}
const rot2 = (pts: P2[], a: number): P2[] => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)])
const P = (i: number, grow = 0) => {
  const { side, r, rot } = plan(i)
  return rot2(rrect(side + 2 * grow, side + 2 * grow, r + grow), rot)
}
const corner = (i: number, extra = 0) => {
  const { side, r, rot } = plan(i)
  const a = rot - Math.PI / 4
  const d = (side / 2 - r) * Math.SQRT2 + r + 0.45 + extra
  return { x: d * Math.cos(a), y: d * Math.sin(a), a }
}
const spine = (i: number): P2 => {
  const { side, rot } = plan(i)
  const a = rot - Math.PI / 2, d = side / 2 + 0.55
  return [d * Math.cos(a), d * Math.sin(a)]
}

/** passo do funil (0 a 9) de cada evento comercial: a estação do andar Comercial que trabalha */
const LEAD_STATION: Record<string, number> = {
  "prospect.found": 0, "lead.created": 1, "lead.analyzed": 2, "agent.started": 2, "agent.completed": 2, "agent.failed": 2, "job.started": 2, "job.completed": 2, "job.failed": 2, "job.dead_lettered": 2,
  "lead.approved": 3, "lead.rejected": 3, "hypothesis.created": 3, "lead.contacted": 4, "lead.replied": 5, "lead.followup_sent": 6,
  "job.video": 7, "lead.video_approved": 8, "lead.proposal": 8, "lead.ganho": 9, "lead.perdido": 9,
}
const NOVAS = ["Projetos", "Suporte", "Jurídico", "Parcerias", "Pesquisa"]
const pad = (i: number) => String(i).padStart(2, "0")
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

type Ocupado = SedeOcupado
interface Robot { o: THREE.Object3D; y0: number; ph: number; work: number }
interface InteriorData {
  robots: Robot[]
  courier: { o: THREE.Object3D; a: number; pk: THREE.Object3D | null } | null
  dust?: THREE.Points
  sign?: THREE.Group
  lamps?: THREE.Object3D[]
}
const ud = (g: THREE.Object3D) => g.userData as InteriorData
interface Anim { t: number; dur: number; fn: (k: number) => void; done?: () => void }
type StdMat = THREE.MeshStandardMaterial

export function createSedeV2(container: HTMLElement, opts: SedeV2Options = {}): SedeV2Handle {
  const base = opts.base ?? "/sede/"
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const mobile = container.clientWidth < 700 || /Android|iPhone|iPad/i.test(navigator.userAgent)
  const S = {
    ocupados: new Map<number, Ocupado>(),
    inside: null as number | null,
    hover: null as number | null,
    luz: "auto" as SedeLuz,
    night: false,
    pending: new Map<number, number>(),
    anims: [] as Anim[],
    idle: 0,
    autoRotate: !reduced,
    loaded: false,
    disposed: false,
    fundo: { cor: new THREE.Color(0xd6e8f7), escuro: false, set: false },
  }
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id)
      if (!S.disposed) fn()
    }, ms)
    timers.add(id)
  }
  const anim = (dur: number, fn: (k: number) => void, done?: () => void) => {
    // com movimento reduzido, as animações longas viram corte seco
    S.anims.push({ t: 0, dur: reduced ? Math.min(dur, 0.01) : dur, fn, done })
  }

  // ---------- render ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" })
  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  container.appendChild(canvas)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // three 0.160 não tem NeutralToneMapping: o protótipo aprovado também rodou com ACES (mesmo visual)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.localClippingEnabled = true
  renderer.info.autoReset = false
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 6000) // lente longa: cara de maquete
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.maxPolarAngle = THREE.MathUtils.degToRad(84)
  controls.minDistance = 60
  controls.maxDistance = 520
  controls.autoRotateSpeed = 0.35
  controls.addEventListener("start", () => {
    S.idle = 0
    controls.autoRotate = false
  })
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTex
  pmrem.dispose()

  const skyU = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } }
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(3000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: skyU,
        fog: false,
        vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = smoothstep(-0.35, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }",
      }),
    ),
  )
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9aa7b5, 0.9)
  const sun = new THREE.DirectionalLight(0xffffff, 2.4)
  sun.castShadow = true
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 110, bottom: -60, near: 10, far: 500 })
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.05
  const interiorLight = new THREE.PointLight(0xfff1dd, 0, 34, 1.5)
  scene.add(hemi, sun, sun.target, interiorLight)

  let composer: EffectComposer | null = null
  let bloom: UnrealBloomPass | null = null
  if (!mobile) {
    composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.7, 0.9)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
  }

  // ---------- utilidades ----------
  const GLOW = (() => {
    const c = document.createElement("canvas")
    c.width = c.height = 64
    const g = c.getContext("2d")!
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, "rgba(255,255,255,1)")
    r.addColorStop(0.25, "rgba(255,190,140,.8)")
    r.addColorStop(1, "rgba(234,92,38,0)")
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(c)
  })()
  const ORANGE = new THREE.Color(0xea5c26)
  const glowSprite = (size = 1.4) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffb080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    s.scale.setScalar(size)
    return s
  }
  const pulseObj = (size = 1.2) => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.SphereGeometry(size * 0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc299 })))
    g.add(glowSprite(size))
    return g
  }
  function signTexture(l1: string, l2?: string, w = 512, h = 128) {
    const c = document.createElement("canvas")
    c.width = w
    c.height = h
    const g = c.getContext("2d")!
    g.fillStyle = "#1c2432"
    g.beginPath()
    g.roundRect(0, 0, w, h, 26)
    g.fill()
    g.fillStyle = "#ea5c26"
    g.fillRect(26, h - 22, w - 52, 6)
    g.textAlign = "center"
    g.textBaseline = "middle"
    g.fillStyle = "#f3f1ec"
    // nomes longos (áreas do app) encolhem para caber na placa
    let size = l2 ? 46 : 60
    g.font = `700 ${size}px Segoe UI, system-ui, sans-serif`
    while (size > 22 && g.measureText(l1).width > w - 48) {
      size -= 2
      g.font = `700 ${size}px Segoe UI, system-ui, sans-serif`
    }
    g.fillText(l1, w / 2, l2 ? h * 0.32 : h * 0.44)
    if (l2) {
      g.fillStyle = "#a9b1ba"
      g.font = "30px Segoe UI, system-ui, sans-serif"
      g.fillText(l2, w / 2, h * 0.62)
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }

  // ---------- carga ----------
  const draco = new DRACOLoader().setDecoderPath(`${base}draco/`)
  // decodificador em JS puro: o WebAssembly exigiria 'wasm-unsafe-eval' na CSP de produção
  draco.setDecoderConfig({ type: "js" })
  const loader = new GLTFLoader().setDRACOLoader(draco)
  const load = (u: string) => new Promise<THREE.Group>((res, rej) => loader.load(u, (g) => res(g.scene), undefined, rej))
  const loadTex = (u: string) => new Promise<THREE.Texture>((res, rej) => new THREE.TextureLoader().load(u, res, undefined, rej))
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6)
  const glassMat = new Map<number, StdMat>()
  const outlines = new Map<number, THREE.Group>()
  const beacons = new Map<number, THREE.Group>()
  const signs = new Map<number, THREE.Mesh>()
  const hits: THREE.Mesh[] = []
  const glowMats: { m: StdMat; base: number; warm: boolean }[] = []
  const cars: THREE.Object3D[] = []
  let pivot: THREE.Object3D | null = null
  let rings: THREE.Object3D[] = []
  let kit: THREE.Group | null = null
  const lobbyGlass: THREE.MeshPhysicalMaterial[] = []
  const aoTex: THREE.Texture[] = []

  function shadows<T extends THREE.Object3D>(root: T) {
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    return root
  }
  function kitClone(name: string) {
    const src = kit!.getObjectByName(name)!
    const c = src.clone(true)
    c.position.set(0, 0, 0)
    c.rotation.set(0, 0, 0)
    return c
  }

  async function boot() {
    const [root, aoT, aoP, kitG] = await Promise.all([load(`${base}sede_exterior.glb`), loadTex(`${base}ao_torre.jpg`), loadTex(`${base}ao_praca.jpg`), load(`${base}kit.glb`)])
    if (S.disposed) return
    kit = shadows(kitG)
    aoTex.push(aoT, aoP)
    for (const t of [aoT, aoP]) {
      t.flipY = false
      t.colorSpace = THREE.NoColorSpace
    }
    const mats = new Set<THREE.Material>()
    root.traverse((o) => {
      if (o.name === "AR_TorreHZK_Coroa_Pivo") pivot = o
      if (/^AR_TorreHZK_Carro_\d$/.test(o.name)) cars.push(o)
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      let top: THREE.Object3D = o
      while (top.parent && top.parent !== root) top = top.parent
      const nm = /_Vidro|PortaGiratoria/.test(o.name) ? o.name : top.name
      const fl = /AR_TorreHZK_F(\d\d)_Vidro/.exec(nm)
      o.castShadow = o.receiveShadow = true
      if (fl && +fl[1] >= 1) {
        const m = new THREE.MeshStandardMaterial({ color: 0x3f86bd, roughness: 0.16, metalness: 0.3, envMapIntensity: 1.1, flatShading: true })
        glassMat.set(+fl[1], m)
        mesh.material = m
      } else if (fl || /PortaGiratoria/.test(nm)) {
        const m = new THREE.MeshPhysicalMaterial({ color: 0xbfdcee, roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide, emissive: 0xffe2bd, emissiveIntensity: 0 })
        mesh.material = m
        o.castShadow = false
        lobbyGlass.push(m)
      } else {
        const m = (mesh.material as StdMat).clone()
        mesh.material = m
        if (/^EXT_Torre/.test(nm)) m.aoMap = aoT
        else if (/^EXT_Praca/.test(nm)) m.aoMap = aoP
        const e = m.emissive
        if (e && e.r + e.g + e.b > 0.01) glowMats.push({ m, base: m.emissiveIntensity || 1, warm: e.b < e.r * 0.6 })
      }
      mats.add(mesh.material as THREE.Material)
    })
    for (const m of mats) {
      m.clippingPlanes = [clipPlane]
      m.clipShadows = true
    }
    if (pivot) rings = [2, 3].map((k) => pivot!.getObjectByName(`AR_TorreHZK_Coroa_Anel_${k}`)).filter((x): x is THREE.Object3D => !!x)
    scene.add(root)
    buildFloorHelpers()
    S.loaded = true
    for (let i = 1; i <= N; i++) setSign(i)
    setLuz(S.luz)
    resize()
    status()
    opts.onReady?.()
  }
  const status = () => opts.onStatus?.({ ativas: S.ocupados.size, livres: N - S.ocupados.size })

  function paintGlass() {
    for (const [i, m] of glassMat) {
      const occ = S.ocupados.has(i)
      if (S.night) {
        m.color.set(occ ? 0xd9a868 : 0x1b2432)
        m.emissive.set(occ ? 0xffb061 : 0x000000)
        m.emissiveIntensity = occ ? 0.45 : 0
        m.roughness = 0.3
        m.metalness = 0.1
      } else {
        m.color.set(occ ? 0x3f86bd : 0x7f8c98)
        m.emissive.set(0x000000)
        m.emissiveIntensity = 0
        m.roughness = occ ? 0.16 : 0.5
        m.metalness = occ ? 0.3 : 0.1
      }
      m.userData.e = m.emissive.clone()
      m.userData.i = m.emissiveIntensity
    }
  }

  function buildFloorHelpers() {
    for (let i = 1; i <= N; i++) {
      // contorno laranja (hover)
      const g = new THREE.Group()
      for (const z of [level(i) + 0.06, level(i) + FLOOR_H - SLAB - 0.06])
        g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P(i, 0.5).map(([x, y]) => B(x, y, z))), new THREE.LineBasicMaterial({ color: 0xff9a5c, depthTest: false, transparent: true })))
      g.visible = false
      g.renderOrder = 10
      scene.add(g)
      outlines.set(i, g)
      // bloco invisível para o ponteiro
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(P(i, 0.6).map(([x, y]) => new THREE.Vector2(x, y))), { depth: FLOOR_H - 0.05, bevelEnabled: false })
      geo.rotateX(-Math.PI / 2)
      const h = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }))
      h.position.y = level(i) - SLAB + 0.02
      h.userData.andar = i
      scene.add(h)
      hits.push(h)
      // farol de decisão, acima da placa do número
      const c = corner(i, 0.7), b = new THREE.Group()
      b.add(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), new THREE.MeshBasicMaterial({ color: 0xff8a3d })))
      const sp = glowSprite(4.5)
      b.add(sp)
      b.position.copy(B(c.x, c.y, level(i) + 2.7))
      b.visible = false
      b.userData.sp = sp
      scene.add(b)
      beacons.set(i, b)
    }
  }
  // placa com o nome da área na fachada (vem dos dados, não do modelo)
  function setSign(i: number) {
    const old = signs.get(i)
    if (old) {
      scene.remove(old)
      old.geometry.dispose()
      const m = old.material as THREE.MeshBasicMaterial
      m.map?.dispose()
      m.dispose()
      signs.delete(i)
    }
    const o = S.ocupados.get(i)
    if (!o || !S.loaded) return
    const c = corner(i, -0.25)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: signTexture(o.nome.toUpperCase()), transparent: true, clippingPlanes: [clipPlane], toneMapped: false }))
    m.position.copy(B(c.x, c.y, level(i) + 1.05))
    m.rotation.y = c.a + Math.PI / 2
    scene.add(m)
    signs.set(i, m)
  }

  // ---------- luz e fundo ----------
  const isNightNow = () => {
    const h = new Date().getHours()
    return h < 6 || h >= 18
  }
  function paintSky() {
    if (S.night) {
      skyU.top.value.set(0x060a14)
      skyU.bottom.value.set(0x24324d)
    } else {
      skyU.top.value.set(0x5fa3e8)
      skyU.bottom.value.set(0xd6e8f7)
    }
    // o horizonte puxa para a cor da página: a cena encaixa no tema claro e no escuro do app
    if (S.fundo.set) {
      skyU.bottom.value.lerp(S.fundo.cor, S.night ? 0.25 : 0.45)
      if (S.fundo.escuro && !S.night) skyU.top.value.lerp(new THREE.Color(0x2b4a70), 0.45)
    }
  }
  function setLuz(mode: SedeLuz) {
    S.luz = mode
    S.night = mode === "noite" || (mode === "auto" && isNightNow())
    if (S.night) {
      hemi.intensity = 0.16
      hemi.color.set(0x8fa6c9)
      hemi.groundColor.set(0x1c2230)
      sun.intensity = 0.22
      sun.color.set(0xa9c1ff)
      sun.position.set(-70, 130, -40)
      renderer.toneMappingExposure = 0.95
      if (bloom) {
        bloom.strength = 0.32
        bloom.threshold = 0.82
      }
    } else {
      hemi.intensity = 0.5
      hemi.color.set(0xffffff)
      hemi.groundColor.set(0x9aa7b5)
      sun.intensity = 2.1
      sun.color.set(0xfff1dc)
      sun.position.set(80, 120, 90)
      renderer.toneMappingExposure = 0.82
      if (bloom) {
        bloom.strength = 0.12
        bloom.threshold = 0.97
      }
    }
    paintSky()
    for (const g of glowMats) g.m.emissiveIntensity = g.base * (S.night ? (g.warm ? 3.2 : 2.2) : 1.0)
    for (const m of lobbyGlass) m.emissiveIntensity = S.night ? 0.7 : 0
    paintGlass()
  }

  // ---------- hover e clique ----------
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
  let flying = false
  function pick(ev: PointerEvent) {
    const r = canvas.getBoundingClientRect()
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(mouse, camera)
    const h = ray.intersectObjects(hits, false)[0]
    return h ? (h.object.userData.andar as number) : null
  }
  function floorInfo(i: number): SedeFloorInfo {
    const o = S.ocupados.get(i)
    if (!o) return { andar: i, nome: "Disponível", estado: "andar livre", livre: true, desc: "Andar livre: vidro fosco, luz apagada e poeira no ar. Quando uma área passa a ter movimento, ela se muda para cá." }
    return { andar: i, nome: o.nome, estado: S.pending.get(i) ? "ocupado · decisão esperando" : "ocupado", livre: false, desc: o.desc || "Área nova: os primeiros movimentos já acendem o andar." }
  }
  function setHover(i: number | null, ev?: PointerEvent) {
    if (S.hover && S.hover !== i) outlines.get(S.hover)!.visible = false
    S.hover = i
    if (!i || !ev) {
      canvas.style.cursor = ""
      opts.onHover?.(null)
      return
    }
    outlines.get(i)!.visible = true
    canvas.style.cursor = "pointer"
    const r = container.getBoundingClientRect()
    opts.onHover?.({ ...floorInfo(i), x: ev.clientX - r.left, y: ev.clientY - r.top })
  }
  const onMove = (ev: PointerEvent) => {
    S.idle = 0
    if (S.inside || flying || !S.loaded) return
    setHover(pick(ev), ev)
  }
  const onLeave = () => setHover(null)
  let downAt: [number, number] | null = null
  const onDown = (ev: PointerEvent) => {
    downAt = [ev.clientX, ev.clientY]
  }
  const onUp = (ev: PointerEvent) => {
    if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 6 || S.inside || flying || !S.loaded) return
    const i = pick(ev)
    if (i) void enterFloor(i)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && S.inside) leaveFloor()
  }
  canvas.addEventListener("pointermove", onMove)
  canvas.addEventListener("pointerleave", onLeave)
  canvas.addEventListener("pointerdown", onDown)
  canvas.addEventListener("pointerup", onUp)
  window.addEventListener("keydown", onKey)

  // ---------- câmera ----------
  const homeView = { pos: new THREE.Vector3(), target: new THREE.Vector3(0, 41, 0) }
  function frameHome() {
    const k = camera.aspect < 1 ? 1.45 : 1
    homeView.pos.set(132 * k, 96 + 14 * (k - 1), 188 * k)
  }
  function fly(toPos: THREE.Vector3, toTarget: THREE.Vector3, dur = 1.5) {
    return new Promise<void>((res) => {
      const p0 = camera.position.clone(), t0 = controls.target.clone()
      flying = true
      controls.enabled = false
      controls.autoRotate = false
      anim(
        dur,
        (k) => {
          const e = ease(k)
          camera.position.lerpVectors(p0, toPos, e)
          controls.target.lerpVectors(t0, toTarget, e)
          camera.lookAt(controls.target)
        },
        () => {
          flying = false
          controls.enabled = true
          res()
        },
      )
    })
  }

  // ---------- entrar no andar ----------
  let interior: THREE.Group | null = null
  const cache = new Map<number, THREE.Group>()
  async function enterFloor(i: number) {
    if (!S.loaded || flying || i < 1 || i > N) return
    setHover(null)
    S.inside = i
    const y = level(i), az = THREE.MathUtils.degToRad(35), k = camera.aspect < 1 ? 1.75 : 1
    opts.onFloor?.(floorInfo(i))
    controls.minDistance = 14
    controls.maxDistance = 520
    const fl = fly(new THREE.Vector3(Math.sin(az) * 34 * k, y + 27 * k, Math.cos(az) * 34 * k), new THREE.Vector3(0, y + 0.5, 0))
    clipPlane.constant = y + 0.02
    interiorLight.position.set(0, y + 5, 0)
    interiorLight.intensity = 0
    await loadInterior(i)
    if (S.disposed || S.inside !== i) return
    anim(0.8, (t) => {
      interiorLight.intensity = (S.ocupados.has(i) ? 9 : 3) * t
    })
    await fl
    if (S.inside === i) controls.maxDistance = 110
  }
  function scan(g: THREE.Group) {
    // robôs são filhos diretos: o mensageiro anda no anel, os outros flutuam no lugar
    shadows(g)
    const d = ud(g)
    d.robots = []
    d.courier = null
    for (const o of g.children) {
      if (/RoboCourier$/.test(o.name)) d.courier = { o, a: Math.atan2(-o.position.z, o.position.x), pk: g.children.find((q) => /PacoteCourier$/.test(q.name)) || null }
      else if (/Robo/.test(o.name)) d.robots.push({ o, y0: o.position.y, ph: Math.random() * 6, work: 0 })
    }
    return g
  }
  function prep(g: THREE.Group, i: number) {
    const core = kitClone("KIT_NucleoCorte")
    core.position.y = level(i)
    g.add(core)
    return scan(g)
  }
  async function loadInterior(i: number) {
    if (interior) {
      scene.remove(interior)
      interior = null
    }
    const occ = S.ocupados.get(i)
    let g = cache.get(i)
    if (!g) {
      // só os 5 andares fixos têm interior modelado; os demais são montados com as peças do kit
      if (occ && !occ.nova && i <= 5) {
        try {
          g = prep(await load(`${base}interior_F${pad(i)}.glb`), i)
        } catch (e) {
          console.warn("[sede 3D] interior", i, e)
          g = prep(procOcupado(i, occ.nome), i)
        }
        cache.set(i, g)
      } else if (occ) {
        g = prep(procOcupado(i, occ.nome), i)
        cache.set(i, g)
      } else g = prep(procLivre(i), i)
    }
    if (S.disposed || S.inside !== i) return
    interior = g
    scene.add(g)
  }
  function leaveFloor() {
    if (!S.inside) return
    S.inside = null
    opts.onFloor?.(null)
    anim(0.5, (k) => {
      interiorLight.intensity *= 1 - k
    })
    controls.minDistance = 60
    controls.maxDistance = 520
    void fly(homeView.pos.clone(), homeView.target.clone()).then(() => {
      if (S.inside) return
      clipPlane.constant = 1e6
      if (interior) {
        scene.remove(interior)
        interior = null
      }
    })
  }

  // ---------- andar livre, mudança e andar de área nova (montados com as peças do kit) ----------
  function place(name: string, r: number, deg: number, i: number, dz = 0, face = 0) {
    const a = THREE.MathUtils.degToRad(deg) + plan(i).rot
    const o = kitClone(name)
    o.position.copy(B(r * Math.cos(a), r * Math.sin(a), level(i) + 0.03 + dz))
    o.rotation.y = a - Math.PI / 2 + face
    return o
  }
  function floorPlate(i: number, color: number) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P(i, -0.3).map(([x, y]) => new THREE.Vector2(x, y)))), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))
    m.rotation.x = -Math.PI / 2
    m.position.y = level(i) + 0.03
    m.receiveShadow = true
    return m
  }
  function standSign(i: number, l1: string, l2: string) {
    const g = new THREE.Group(), y = level(i)
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.7, 0.12), new THREE.MeshStandardMaterial({ color: 0x1c2432, roughness: 0.5 }))
    post.position.y = 0.85
    g.add(post)
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture(l1, l2, 512, 220), toneMapped: false }))
    face.position.set(0, 1.25, 0.07)
    g.add(face)
    g.position.copy(B(0, -CORE / 2 - 2.6, y))
    return g
  }
  function pendants(i: number, on: boolean) {
    const list: THREE.Object3D[] = []
    for (let k = 0; k < 8; k++) {
      const p = place("KIT_Pendente", 7.3, 22.5 + 45 * k, i)
      p.traverse((o) => {
        const mesh = o as THREE.Mesh
        const mat = mesh.material as StdMat | undefined
        if (mesh.isMesh && mat?.emissive && mat.emissive.r > 0.1) {
          const m = mat.clone()
          mesh.material = m
          m.emissiveIntensity = on ? 2 : 0
          if (!on) m.color.set(0x8c9198)
          p.userData.lamp = m
        }
      })
      list.push(p)
    }
    return list
  }
  function dataRing(i: number) {
    const g = new THREE.Group(), y = level(i) + 0.05
    const a = new THREE.Mesh(new THREE.RingGeometry(RING - 0.3, RING + 0.3, 64), new THREE.MeshStandardMaterial({ color: 0x1c2432 }))
    a.rotation.x = -Math.PI / 2
    a.position.y = y
    const b = new THREE.Mesh(new THREE.RingGeometry(RING - 0.07, RING + 0.07, 64), new THREE.MeshStandardMaterial({ color: 0xea5c26, emissive: 0xea5c26, emissiveIntensity: 1.6 }))
    b.rotation.x = -Math.PI / 2
    b.position.y = y + 0.02
    g.add(a, b)
    return g
  }
  function procLivre(i: number) {
    const g = new THREE.Group(), y = level(i)
    g.add(floorPlate(i, 0xa9a49b))
    const n = 900, pos = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) {
      const r = 4.4 + Math.random() * 5, a = Math.random() * 6.283
      pos.set([r * Math.cos(a), y + 0.2 + Math.random() * 3.1, r * Math.sin(a)], k * 3)
    }
    const dg = new THREE.BufferGeometry()
    dg.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    const d = ud(g)
    d.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xf0e4d2, size: 0.07, transparent: true, opacity: 0.6, depthWrite: false }))
    g.add(d.dust)
    d.sign = standSign(i, "DISPONÍVEL", `andar ${pad(i)}`)
    g.add(d.sign)
    d.lamps = pendants(i, false)
    g.add(...d.lamps)
    return g
  }
  function furnish(g: THREE.Group, i: number) {
    for (const [k, deg] of [20, 60, 100, 140, 300, 340].entries()) {
      g.add(place("KIT_Mesa", ST_R, deg, i, 0, Math.PI), place("KIT_Cadeira", ST_R - 0.85, deg, i, 0, Math.PI))
      if (k % 2 === 0) g.add(place("KIT_Divisoria", ST_R + 0.2, deg + 20, i, 0, Math.PI / 2))
    }
    g.add(place("KIT_Sofa", 9.0, 200, i, 0, Math.PI), place("KIT_MesaCentro", 7.6, 200, i), place("KIT_Sofa", 9.0, 250, i, 0, Math.PI))
    for (const deg of [45, 135, 225, 315]) g.add(place("KIT_Planta", 9.4 * (plan(i).side / 22), deg, i))
    g.add(dataRing(i))
    const rb = place("KIT_Robo", RING, 200, i, 1.05)
    rb.name = "RoboCourier"
    const pk = place("KIT_Pacote", RING, 200, i, 1.72)
    pk.name = `AR_TorreHZK_F${pad(i)}_PacoteCourier`
    g.add(rb, pk)
  }
  function procOcupado(i: number, nome: string) {
    const g = new THREE.Group()
    g.add(floorPlate(i, 0xc9c4ba))
    g.add(...pendants(i, true))
    g.add(standSign(i, nome.toUpperCase(), `andar ${pad(i)}`))
    furnish(g, i)
    return g
  }
  function mudanca(i: number) {
    const g = interior
    if (!g) return
    const usados = new Set([...S.ocupados.values()].map((o) => o.nome))
    const nome = NOVAS.find((n) => !usados.has(n)) ?? `Área ${pad(i)}`
    const y = level(i), d = ud(g)
    opts.onLog?.(`Área nova "${nome}" mudando para o andar ${pad(i)} (simulação)`, true)
    for (let k = 0; k < 9; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0xc69c6d, roughness: 0.85, flatShading: true }))
      box.castShadow = true
      const s = B(-1.55, -CORE / 2 - 0.6, y - 3), a = -Math.PI / 2 + (k - 4) * 0.3, e = B(7.2 * Math.cos(a), 7.2 * Math.sin(a), y + 0.3)
      box.position.copy(s)
      g.add(box)
      later(
        () =>
          anim(1.7, (t) => {
            const up = Math.min(1, t * 2.2)
            box.position.set(s.x, s.y + (y + 0.3 - s.y) * ease(up), s.z)
            if (t > 0.45) {
              const q = ease((t - 0.45) / 0.55)
              box.position.x = s.x + (e.x - s.x) * q
              box.position.z = s.z + (e.z - s.z) * q
              box.position.y = y + 0.3 + Math.sin(q * Math.PI) * 0.8
            }
            box.rotation.y = t * 1.5
          }),
        k * 240,
      )
      later(() => anim(0.5, (t) => box.scale.setScalar(1 - t), () => g.remove(box)), 4300 + k * 60)
    }
    ;(d.lamps ?? []).forEach((p, k) =>
      later(
        () =>
          anim(0.45, (t) => {
            const lamp = p.userData.lamp as StdMat | undefined
            if (!lamp) return
            lamp.emissiveIntensity = 2 * t
            lamp.color.set(0xfff6ea)
          }),
        2300 + k * 170,
      ),
    )
    const dustMat = d.dust?.material as THREE.PointsMaterial | undefined
    if (dustMat) anim(2.6, (t) => (dustMat.opacity = 0.6 * (1 - t)))
    later(() => {
      if (d.dust) g.remove(d.dust)
      if (d.sign) g.remove(d.sign)
      d.dust = undefined
      g.add(standSign(i, nome.toUpperCase(), `andar ${pad(i)}`))
      ;((g.children[0] as THREE.Mesh).material as StdMat).color.set(0xc9c4ba)
      furnish(g, i)
      scan(g)
      S.ocupados.set(i, { andar: i, key: nome.toLowerCase(), nome, desc: `Área nova (${nome}). Os primeiros movimentos já acendem o andar.`, nova: true })
      cache.set(i, g)
      paintGlass()
      setSign(i)
      if (S.inside === i) opts.onFloor?.(floorInfo(i))
      status()
      anim(0.6, (t) => (interiorLight.intensity = 3 + 6 * t))
    }, 4700)
  }

  // ---------- eventos → cena (nota 29) ----------
  const areaFloor = (key: string) => {
    for (const [i, o] of S.ocupados) if (o.key === key) return i
    return null
  }
  function flashFloor(i: number) {
    const m = glassMat.get(i)
    if (!m) return
    S.anims.push({
      t: 0,
      dur: 1.4,
      fn: (t) => {
        const k = Math.sin(t * Math.PI)
        m.emissive.copy(m.userData.e).lerp(ORANGE, k)
        m.emissiveIntensity = Math.max(m.userData.i, 0.8 * k)
      },
      done: () => {
        m.emissive.copy(m.userData.e)
        m.emissiveIntensity = m.userData.i
      },
    })
  }
  // pulso que sobe pela espinha de dados da fachada, da marquise até o andar
  function spinePulse(i: number) {
    if (S.inside || reduced) return flashFloor(i)
    const pts = [B(...spine(1), 5.5)]
    for (let k = 1; k <= i; k++) {
      const [x, y] = spine(k)
      pts.push(B(x, y, level(k) - SLAB), B(x, y, level(k) + (k === i ? 1.6 : FLOOR_H - SLAB)))
    }
    const p = pulseObj(4)
    ;((p.children[0] as THREE.Mesh).material as THREE.Material).clippingPlanes = [clipPlane]
    scene.add(p)
    anim(
      0.35 + i * 0.16,
      (t) => {
        const f = t * (pts.length - 1), a = Math.min(pts.length - 2, Math.floor(f))
        p.position.lerpVectors(pts[a], pts[a + 1], f - a)
      },
      () => {
        scene.remove(p)
        flashFloor(i)
      },
    )
  }
  const stationA = (n: number, i: number) => THREE.MathUtils.degToRad(90 + 36 * n) + plan(i).rot
  function ringPulse(i: number, a1: number, out = 0) {
    const host = interior
    if (!host) return
    const y = level(i) + 0.16, a0 = -Math.PI / 2
    let d = a1 - a0
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    if (!out) d = Math.PI * 2
    const p = pulseObj(1.3)
    host.add(p)
    anim(
      out ? 1.9 : 2.6,
      (t) => {
        if (!out || t < 0.72) {
          const a = a0 + d * ease(out ? t / 0.72 : t)
          p.position.copy(B(RING * Math.cos(a), RING * Math.sin(a), y))
        } else {
          const s = (t - 0.72) / 0.28, r = RING + out * s
          p.position.copy(B(r * Math.cos(a1), r * Math.sin(a1), y + s * 0.9))
        }
      },
      () => host.remove(p),
    )
  }
  function packetTo(i: number, bx: number, by: number) {
    const host = interior
    if (!host) return
    const y = level(i), box = kitClone("KIT_Pacote"), s = B(-1.55, -CORE / 2 - 0.5, y + 0.4), e = B(bx, by, y + 1.0)
    box.position.copy(s)
    box.add(glowSprite(1.1))
    host.add(box)
    anim(
      1.7,
      (t) => {
        const k = ease(t)
        box.position.lerpVectors(s, e, k)
        box.position.y += Math.sin(k * Math.PI) * 1.6
        box.rotation.y = k * 4
      },
      () => later(() => anim(0.4, (t) => box.scale.setScalar(1 - t), () => host.remove(box)), 1200),
    )
  }
  function newcomer(i: number) {
    const host = interior
    if (!host) return
    const y = level(i), g = new THREE.Group()
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0xea5c26, flatShading: true }))
    b.position.y = 0.65
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshStandardMaterial({ color: 0xece9e3, flatShading: true }))
    h.position.y = 1.5
    g.add(b, h)
    shadows(g)
    const s = B(-1.55, -CORE / 2 - 0.4, y), e = B(-1.0, -CORE / 2 - 4.6, y)
    g.position.copy(s)
    host.add(g)
    anim(2.4, (t) => {
      g.position.lerpVectors(s, e, ease(t))
      g.position.y = y + Math.abs(Math.sin(t * 14)) * 0.08
    })
  }
  let stage = 0
  function applyEvent(ev: { type: string; area?: string | null }) {
    const type = ev.type
    const key = ev.area ?? null
    const i = key ? areaFloor(key) : null
    if (type === "aprovacao.pedida" && i) S.pending.set(i, (S.pending.get(i) || 0) + 1)
    else if (type === "aprovacao.decidida" && i) S.pending.set(i, Math.max(0, (S.pending.get(i) || 0) - 1))
    if (!i || !S.loaded) return
    if (S.inside === i) opts.onFloor?.(floorInfo(i))
    spinePulse(i)
    if (S.inside !== i || !interior) return
    if (key === "comercial" && type in LEAD_STATION) {
      const n = LEAD_STATION[type]
      ringPulse(i, stationA(n, i), ST_R - 1.0 - RING)
      const rb = interior.getObjectByName(`AR_TorreHZK_F${pad(i)}_Est${n}_Robo`)
      const r = ud(interior).robots.find((q) => q.o === rb)
      if (r) r.work = 3
    } else if (key === "tarefas") {
      const deg = [20, 60, 100, 140, 180, 340][Math.floor(Math.random() * 6)], a = THREE.MathUtils.degToRad(deg + 3) + plan(i).rot
      packetTo(i, ST_R * Math.cos(a), ST_R * Math.sin(a))
    } else if (key === "conteudos") {
      const p = interior.getObjectByName("AR_TorreHZK_F04_PacoteEsteira")
      if (p) {
        stage = (stage + 1) % 4
        const [x, y] = rot2([[-7.6, -2.85 + stage * 1.9]], plan(i).rot)[0], from = p.position.clone(), to = B(x, y, from.y)
        anim(1.2, (t) => p.position.lerpVectors(from, to, ease(t)))
      } else ringPulse(i, 0)
    } else if (key === "equipe" && type === "member.invited") newcomer(i)
    else ringPulse(i, 0)
  }

  // ---------- carros em volta da quadra ----------
  const lanes = [43.3, 38.9, 43.3].map((h) => {
    const pts = rrect(2 * h, 2 * h, 14.2 - (46.2 - h), 8).map(([x, y]) => B(x, y, 0.06))
    const len = [0]
    for (let k = 0; k < pts.length; k++) len.push(len[k] + pts[k].distanceTo(pts[(k + 1) % pts.length]))
    return { pts, len }
  })
  function carAt(car: THREE.Object3D, lane: (typeof lanes)[number], s: number, dir: number) {
    const { pts, len } = lane, total = len[len.length - 1]
    const d = ((s % total) + total) % total
    let k = 0
    while (len[k + 1] < d) k++
    const a = pts[k], b = pts[(k + 1) % pts.length], f = (d - len[k]) / (len[k + 1] - len[k])
    car.position.lerpVectors(a, b, f)
    car.rotation.set(0, Math.atan2(-(b.z - a.z), b.x - a.x) + (dir < 0 ? Math.PI : 0), 0)
  }

  // ---------- laço ----------
  let last = performance.now(), frames = 0, fpsT = 0, clock = 0, tilt = 0, rafId = 0
  let running = false, visible = true, onScreen = true
  const fpsLog: number[] = []
  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    composer?.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    frameHome()
    if (!S.inside && !flying) {
      camera.position.copy(homeView.pos)
      controls.target.copy(homeView.target)
    }
  }
  function loop(now: number) {
    if (!running || S.disposed) return
    rafId = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    clock += dt
    S.idle += dt
    for (let k = S.anims.length - 1; k >= 0; k--) {
      const a = S.anims[k]
      a.t += dt
      const p = Math.min(1, a.t / a.dur)
      a.fn(p)
      if (p >= 1) {
        S.anims.splice(k, 1)
        a.done?.()
      }
    }
    // coroa: as órbitas giram no plano da moeda; com decisão esperando, inclinam e viram um giroscópio
    const waiting = [...S.pending.values()].some((v) => v > 0)
    tilt += ((waiting ? 1 : 0) - tilt) * Math.min(1, dt * 1.5)
    const spin = reduced ? 0 : clock
    rings.forEach((r, k) => {
      r.rotation.set(tilt * (k ? 1.1 : -0.8) * Math.sin(spin * (k ? 0.9 : 0.7) + k), spin * (k ? -0.25 : 0.4), tilt * (k ? 0.5 : 0.9) * Math.cos(spin * 0.6 + k))
    })
    for (const [i, b] of beacons) {
      const on = (S.pending.get(i) || 0) > 0 && !S.inside
      b.visible = on
      if (on) (b.userData.sp as THREE.Sprite).scale.setScalar(reduced ? 4 : 3.4 + Math.sin(now / 240) * 1.5)
    }
    if (!reduced) cars.forEach((c, k) => carAt(c, lanes[k % 3], clock * (k === 1 ? -7 : 9 + k) + k * 90, k === 1 ? -1 : 1))
    if (interior && !reduced) {
      const d = ud(interior)
      for (const r of d.robots || []) {
        r.o.position.y = r.y0 + Math.sin(now / 650 + r.ph) * 0.09
        if (r.work > 0) {
          r.o.rotation.y += dt * 7
          r.work -= dt
        }
      }
      const c = d.courier
      if (c) {
        c.a += dt * 0.5
        const y = level(S.inside ?? 1) + 1.1 + Math.sin(now / 500) * 0.06, p = B(RING * Math.cos(c.a), RING * Math.sin(c.a), y)
        c.o.position.copy(p)
        c.o.rotation.set(0, c.a + Math.PI, 0)
        if (c.pk) {
          c.pk.position.set(p.x, p.y + 0.72, p.z)
          c.pk.rotation.set(0, clock, 0)
        }
      }
      if (d.dust) d.dust.rotation.y += dt * 0.015
    }
    controls.autoRotate = S.autoRotate && !S.inside && !flying && S.idle > 6
    if (!flying) controls.update()
    renderer.info.reset() // com o compositor, a contagem zeraria a cada passe
    if (composer) composer.render()
    else renderer.render(scene, camera)
    frames++
    fpsT += dt
    if (fpsT >= 1) {
      fpsLog.push(Math.round(frames / fpsT))
      if (fpsLog.length > 60) fpsLog.shift()
      frames = 0
      fpsT = 0
    }
  }
  function updateRunning() {
    const on = visible && onScreen && !S.disposed
    if (on === running) return
    running = on
    if (on) {
      last = performance.now()
      rafId = requestAnimationFrame(loop)
    } else cancelAnimationFrame(rafId)
  }
  const onVisibility = () => {
    visible = !document.hidden
    updateRunning()
  }
  document.addEventListener("visibilitychange", onVisibility)
  const io = new IntersectionObserver((e) => {
    onScreen = e[0]?.isIntersecting ?? true
    updateRunning()
  })
  io.observe(container)
  const ro = new ResizeObserver(() => resize())
  ro.observe(container)
  resize()
  setLuz("auto")
  visible = !document.hidden
  updateRunning()

  boot().catch((e) => {
    if (S.disposed) return
    console.error("[sede 3D]", e)
    opts.onError?.(e)
  })

  return {
    applyEvent,
    setOcupados(list) {
      S.ocupados.clear()
      for (const a of list) S.ocupados.set(a.andar, { ...a })
      for (const k of [...cache.keys()]) if (k !== S.inside) cache.delete(k)
      paintGlass()
      for (let i = 1; i <= N; i++) setSign(i)
      status()
    },
    setLuz,
    setFundo(cor, escuro) {
      // lê a cor real pintando um pixel: o token pode vir em hex, rgb ou oklch
      const c = document.createElement("canvas")
      c.width = c.height = 1
      const g = c.getContext("2d")
      if (!g) return
      g.fillStyle = cor
      g.fillRect(0, 0, 1, 1)
      const [r, gg, b] = g.getImageData(0, 0, 1, 1).data
      S.fundo.cor.setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace)
      S.fundo.escuro = escuro
      S.fundo.set = true
      paintSky()
    },
    setAutoRotate(on) {
      S.autoRotate = on && !reduced
      if (!S.autoRotate) controls.autoRotate = false
      else S.idle = 7
    },
    enterFloor: (i) => void enterFloor(i),
    leaveFloor,
    simularAreaNova() {
      if (S.inside && !S.ocupados.has(S.inside)) mudanca(S.inside)
    },
    stats: () => ({ fps: fpsLog.slice(-8), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ocupados: [...S.ocupados.keys()], dentro: S.inside, carros: cars.length, aneis: rings.length, animacoes: S.anims.length, decisoes: [...S.pending.values()].reduce((a, b) => a + b, 0) }),
    dispose() {
      S.disposed = true
      running = false
      cancelAnimationFrame(rafId)
      for (const t of timers) clearTimeout(t)
      timers.clear()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("keydown", onKey)
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
      canvas.removeEventListener("pointerdown", onDown)
      canvas.removeEventListener("pointerup", onUp)
      io.disconnect()
      ro.disconnect()
      controls.dispose()
      const seen = new Set<unknown>()
      const free = (root: THREE.Object3D) =>
        root.traverse((o) => {
          const m = o as THREE.Mesh
          if (m.geometry && !seen.has(m.geometry)) {
            seen.add(m.geometry)
            m.geometry.dispose()
          }
          const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []
          for (const mat of mats) {
            if (seen.has(mat)) continue
            seen.add(mat)
            const map = (mat as THREE.MeshBasicMaterial).map
            if (map) map.dispose()
            mat.dispose()
          }
        })
      free(scene)
      for (const g of cache.values()) free(g)
      if (kit) free(kit)
      GLOW.dispose()
      aoTex.forEach((t) => t.dispose())
      envTex.dispose()
      draco.dispose()
      composer?.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
