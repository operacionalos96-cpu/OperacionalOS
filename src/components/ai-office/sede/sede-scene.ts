import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js"
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js"
import { enqueueScene, SEDE_FLOORS, type SceneAction, type SceneQueue, type SedeFloor } from "@/lib/domain/office-scene"

/**
 * Sede HZK em 3D (ADR 0021). Desenha o prédio e os robôs e encena as ações que chegam por `play()`
 * (eventos reais traduzidos em `lib/domain/office-scene`). Nada aqui sabe de banco ou de tela:
 * quem monta (SedeView) passa as ações e recebe os números de volta.
 *
 * Visual aprovado no protótipo `docs/prototipos/ia-office-sede.html` (nota 20 do Obsidian):
 * corte isométrico, 4 andares + cobertura, robôs em escala humana, cabos com pulsos de dados.
 */

export interface SedeStats {
  trabalhando: number
  andando: number
  pausa: number
  conversando: number
  elevador: number
  esperando: number
  robos: number
}

export interface SedeOptions {
  assets: { symbol: string; wordmark: string }
  onStats?: (s: SedeStats) => void
  /** quantos eventos ainda faltam encenar e quantos foram pulados numa rajada */
  onQueue?: (pending: number, skipped: number) => void
  /** a cena começou a encenar esta ação (é a hora de contar na tela) */
  onAction?: (a: SceneAction) => void
}

export interface SedeHandle {
  play(action: SceneAction): void
  setAutoRotate(on: boolean): void
  dispose(): void
}

type V3 = THREE.Vector3
interface Seat { floor: number; pos: V3; face: number; busy: boolean; desk: [number, number]; hub: [number, number]; ilha: boolean; k: number }
interface Rest { floor: number; pos: V3; face: number; lean: boolean }
interface Chat { floor: number; a: V3; b: V3 }
interface Lounge { pos: V3; face: number }
type After =
  | { type: "sit" }
  | { type: "rest"; sp: Rest }
  | { type: "chat"; c: Chat; side: V3 }
  | { type: "sitLounge"; spot: Lounge }
  | { type: "ride"; dest: number }
interface Robot {
  name: string
  g: THREE.Group
  core: THREE.Group
  head: THREE.Group
  headY: number
  eyeMat: THREE.MeshStandardMaterial
  faceMat: THREE.MeshStandardMaterial
  outM: THREE.MeshBasicMaterial
  bang: THREE.Group
  check: THREE.Group
  top: number
  floor: number
  mode: "idle" | "walk" | "sit" | "rest" | "chat" | "lounge" | "ride"
  path: V3[]
  after: After | null
  timer: number
  seat: Seat | null
  t: number
  glow: number
  checkT: number
  lean: number
  waiting: boolean
  failed: boolean
  job: boolean
  rideFrom: number
  rideTo: number
  rideT: number
  dest: number
}
interface Packet { g: THREE.Group; trail: THREE.Mesh[]; hist: V3[]; curve: THREE.CurvePath<V3>; len: number; s: number; speed: number; onDone: (() => void) | null }
interface Burst { m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; t: number; flat?: boolean }
interface Job { r: Robot | null; seat: Seat }

// ---------- dimensões (metros; robô ~1,6 m) ----------
const W = 12, D = 9, H = 3.3, SL = 0.28, NF = 4
const ROOF = NF * H
const VIEW = 21
const floorY = (i: number) => i * H
const C = { graphite: 0x111827, graphite2: 0x1f2937, graphite3: 0x374151, slab: 0xc9ced8, floor: 0x8a93a3, white: 0xf2f4f7, light: 0xc9d0db, blue: 0x3861f2, accent: 0xea5b25, ok: 0x4fbf8b, fail: 0xd9534f, wood: 0xcbb79c, leaf: 0x6fa88e }
const DOT = { lead: 0xeaf3ff, entrega: 0xff6a2e, discard: 0x8892a3 } as const

export function createSede(container: HTMLElement, opts: SedeOptions): SedeHandle {
  const disposables: { dispose(): void }[] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id)
      fn()
    }, ms)
    timers.add(id)
  }
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x)

  // ---------- materiais ----------
  const std = (c: number, o: THREE.MeshStandardMaterialParameters = {}) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.05, ...o }))
  const M = {
    slab: std(C.slab, { roughness: 0.8 }), floor: std(C.floor, { roughness: 0.85 }), graphite: std(C.graphite, { roughness: 0.5 }), graphite2: std(C.graphite2, { roughness: 0.55 }), graphite3: std(C.graphite3, { roughness: 0.5, metalness: 0.3 }),
    white: std(C.white, { roughness: 0.45 }), light: std(C.light, { roughness: 0.5 }), metal: std(0x9aa4b5, { roughness: 0.35, metalness: 0.7 }), wood: std(C.wood, { roughness: 0.7 }),
    leaf: std(C.leaf, { flatShading: true, roughness: 0.8 }), pot: std(0xe7eaf0, { flatShading: true }),
    blue: std(C.blue, { emissive: C.blue, emissiveIntensity: 1.1, roughness: 0.4 }), blueSoft: std(C.blue, { emissive: C.blue, emissiveIntensity: 0.45 }),
    ledA: std(0x6b8cff, { emissive: 0x6b8cff, emissiveIntensity: 1.5 }), ledB: std(0x4fbf8b, { emissive: 0x4fbf8b, emissiveIntensity: 1.2 }), ledC: std(0xea5b25, { emissive: 0xea5b25, emissiveIntensity: 1.2 }),
    accent: std(C.accent, { emissive: C.accent, emissiveIntensity: 1.2 }), ok: std(C.ok, { emissive: C.ok, emissiveIntensity: 0.8 }),
    sofa: std(0x3b4a6b, { roughness: 0.9 }), keys: std(0x2a3345, { roughness: 0.9 }),
  }
  const geos = new Map<string, THREE.BufferGeometry>()
  // peças finas viram caixa simples (o chanfro nelas não aparece e custa triângulos)
  const rb = (w: number, h: number, d: number, r = 0.03) => {
    const k = `${w},${h},${d},${r}`
    let g = geos.get(k)
    if (!g) {
      g = Math.min(w, h, d) < 0.045 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2))
      geos.set(k, keep(g))
    }
    return g
  }
  const mesh = (g: THREE.BufferGeometry, mt: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, mt)
    o.position.set(x, y, z)
    o.castShadow = true
    o.receiveShadow = true
    return o
  }
  const box = (p: THREE.Object3D, w: number, h: number, d: number, mt: THREE.Material, x: number, y: number, z: number, r?: number) => {
    const o = mesh(rb(w, h, d, r), mt, x, y + h / 2, z)
    p.add(o)
    return o
  }
  const cyl = (p: THREE.Object3D, rt: number, rbt: number, h: number, mt: THREE.Material, x: number, y: number, z: number, seg = 12) => {
    const o = mesh(keep(new THREE.CylinderGeometry(rt, rbt, h, seg)), mt, x, y + h / 2, z)
    p.add(o)
    return o
  }
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  // ---------- renderizador, câmera isométrica, luz ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.domElement.style.display = "block"
  renderer.domElement.style.outline = "none"
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.enablePan = false
  controls.minZoom = 0.7
  controls.maxZoom = 3.2
  controls.minPolarAngle = 0.55
  controls.maxPolarAngle = 1.36
  controls.autoRotateSpeed = 0.25
  controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  scene.add(new THREE.HemisphereLight(0xedf2fa, 0x1f2937, 0.8))
  const sun = new THREE.DirectionalLight(0xfff7ee, 1.4)
  sun.position.set(18, 30, 14)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 20, bottom: -16, near: 1, far: 90 })
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)

  const B = new THREE.Group()
  scene.add(B)
  const staticRoot = new THREE.Group() // tudo que não se mexe: fundido por material e andar no fim
  B.add(staticRoot)
  const dyn = new THREE.Group() // tudo que se mexe
  B.add(dyn)

  // ---------- estrutura: base, lajes, paredes, colunas, vidro com Fresnel ----------
  cyl(staticRoot, 11.5, 11.8, 0.4, std(0x1a2333, { roughness: 0.9 }), 0, -0.7, 0, 64)
  box(staticRoot, W + 2.4, 0.12, D + 2.4, M.graphite2, 0, -0.3, 0, 0.06)
  for (let i = 0; i <= NF; i++) {
    const y = floorY(i)
    box(staticRoot, W, SL, D, M.slab, 0, y - SL, 0, 0.06)
    box(staticRoot, W + 0.08, 0.06, D + 0.08, M.graphite, 0, y - SL - 0.06, 0, 0.03)
    box(staticRoot, W, 0.03, 0.03, M.blueSoft, 0, y - SL * 0.5, D / 2 + 0.01, 0.01)
    box(staticRoot, 0.03, 0.03, D, M.blueSoft, W / 2 + 0.01, y - SL * 0.5, 0, 0.01)
    if (i < NF) {
      box(staticRoot, W - 0.2, 0.012, D - 0.2, M.floor, 0, y, 0, 0.01)
      box(staticRoot, W, H - SL, 0.14, M.graphite2, 0, y, -D / 2 + 0.07, 0.03) // parede do fundo
      box(staticRoot, 0.14, H - SL, D, M.graphite3, -W / 2 + 0.07, y, 0, 0.03) // parede da esquerda
    }
  }
  for (const [x, z] of [[W / 2, D / 2], [-W / 2, D / 2], [W / 2, -D / 2]]) box(staticRoot, 0.16, ROOF, 0.16, M.graphite, x, -SL, z, 0.04)
  const glassMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color(0xbfd2ff) } },
    vertexShader: "varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}",
    fragmentShader: "uniform vec3 uColor;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),3.);gl_FragColor=vec4(uColor,0.035+0.32*f);}",
  }))
  // fachada: o mesmo vidro + quina marcada e dois reflexos diagonais perto dela (o miolo continua transparente)
  const facadeMat = keep(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color(0xbfd2ff) } },
    vertexShader: "varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vec4 mv=viewMatrix*w;vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}",
    fragmentShader: `uniform vec3 uColor;varying vec3 vN;varying vec3 vV;varying vec3 vW;
      void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),3.);
        float d=(${(W / 2).toFixed(2)}-vW.x)+(${(D / 2).toFixed(2)}-vW.z);
        float yl=mod(vW.y,${H.toFixed(2)});
        float edge=exp(-d*7.)*0.4;
        float x=d-(0.55*yl+0.5);
        float b1=1.-smoothstep(0.,0.1,abs(x)),b2=1.-smoothstep(0.,0.035,abs(x-0.34));
        float streak=(b1*0.13+b2*0.1)*exp(-d*0.3);
        gl_FragColor=vec4(mix(uColor,vec3(1.),clamp((edge+streak)*2.,0.,1.)),0.03+0.3*f+edge+streak);}`,
  }))
  for (let i = 0; i < NF; i++) {
    const y = floorY(i) + (H - SL) / 2
    const front = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H - SL)), facadeMat)
    front.position.set(0, y, D / 2 + 0.02)
    const side = new THREE.Mesh(keep(new THREE.PlaneGeometry(D, H - SL)), facadeMat)
    side.rotation.y = Math.PI / 2
    side.position.set(W / 2 + 0.02, y, 0)
    dyn.add(front, side)
    for (let k = 1; k < 4; k++) box(staticRoot, 0.04, H - SL, 0.04, M.graphite, -W / 2 + k * 3, floorY(i), D / 2 + 0.02, 0.01)
  }

  // ---------- mobília ----------
  const chartCanvas = document.createElement("canvas")
  chartCanvas.width = 256
  chartCanvas.height = 160
  const chartTex = keep(new THREE.CanvasTexture(chartCanvas))
  chartTex.colorSpace = THREE.SRGBColorSpace
  let chartT = 0
  const drawChart = () => {
    const g = chartCanvas.getContext("2d")
    if (!g) return
    g.fillStyle = "#0E1526"
    g.fillRect(0, 0, 256, 160)
    g.fillStyle = "#24304A"
    for (let i = 0; i < 4; i++) g.fillRect(14, 16 + i * 9, 70 - i * 12, 4)
    for (let i = 0; i < 8; i++) {
      const h = 24 + Math.abs(Math.sin(chartT * 0.6 + i * 0.8)) * 80
      g.fillStyle = i === 5 ? "#3861F2" : "#5B6B8C"
      g.fillRect(18 + i * 28, 150 - h, 16, h)
    }
    g.strokeStyle = "#8FB0FF"
    g.lineWidth = 3
    g.beginPath()
    for (let x = 0; x <= 10; x++) {
      const y = 70 - Math.sin(chartT * 0.4 + x * 0.6) * 18
      if (x) g.lineTo(14 + x * 23, y)
      else g.moveTo(14, y)
    }
    g.stroke()
    chartTex.needsUpdate = true
  }
  drawChart()
  const screenMat = keep(new THREE.MeshStandardMaterial({ map: chartTex, emissive: 0xffffff, emissiveMap: chartTex, emissiveIntensity: 0.95, roughness: 0.35, toneMapped: false }))
  const spillCv = document.createElement("canvas")
  spillCv.width = spillCv.height = 64
  {
    const g = spillCv.getContext("2d")
    if (g) {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, "rgba(140,175,255,1)")
      gr.addColorStop(1, "rgba(140,175,255,0)")
      g.fillStyle = gr
      g.fillRect(0, 0, 64, 64)
    }
  }
  const spillMat = keep(new THREE.MeshBasicMaterial({ map: keep(new THREE.CanvasTexture(spillCv)), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  const screenG = keep(new THREE.PlaneGeometry(0.56, 0.32)), spillG = keep(new THREE.PlaneGeometry(0.9, 0.6)), mouseG = keep(new THREE.SphereGeometry(0.035, 10, 6))
  const group = (p: THREE.Object3D, x: number, z: number, ry: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = ry
    p.add(g)
    return g
  }
  function desk(p: THREE.Object3D, x: number, z: number, ry: number) {
    const g = group(p, x, z, ry)
    box(g, 1.4, 0.05, 0.72, M.white, 0, 0.72, 0, 0.02)
    for (const dx of [-0.62, 0.62]) {
      box(g, 0.05, 0.7, 0.6, M.graphite3, dx, 0.02, 0, 0.02)
      box(g, 0.05, 0.03, 0.66, M.graphite3, dx, 0, 0, 0.01)
    }
    box(g, 1.2, 0.25, 0.03, M.light, 0, 0.47, -0.3, 0.01)
    cyl(g, 0.08, 0.09, 0.015, M.white, 0, 0.77, -0.2, 16)
    const a1 = mesh(rb(0.03, 0.26, 0.03, 0.012), M.white, 0, 0.9, -0.2)
    a1.rotation.x = 0.25
    const a2 = mesh(rb(0.03, 0.2, 0.03, 0.012), M.white, 0, 1.05, -0.13)
    a2.rotation.x = -0.6
    g.add(a1, a2)
    box(g, 0.6, 0.36, 0.018, M.graphite, 0, 0.98, -0.08, 0.01)
    g.add(mesh(screenG, screenMat, 0, 1.16, -0.069))
    const sp = mesh(spillG, spillMat, 0, 0.752, 0.02)
    sp.rotation.x = -Math.PI / 2
    g.add(sp)
    box(g, 0.44, 0.018, 0.15, M.keys, 0, 0.775, 0.12, 0.008)
    const mouse = mesh(mouseG, M.graphite2, 0.3, 0.78, 0.13)
    mouse.scale.set(0.9, 0.45, 1.3)
    g.add(mouse)
  }
  function chair(p: THREE.Object3D, x: number, z: number, ry: number) {
    const g = group(p, x, z, ry)
    box(g, 0.48, 0.07, 0.46, M.graphite2, 0, 0.42, 0, 0.03)
    box(g, 0.46, 0.5, 0.06, M.graphite2, 0, 0.5, -0.22, 0.03)
    cyl(g, 0.025, 0.025, 0.4, M.metal, 0, 0.03, 0, 8)
    for (let k = 0; k < 5; k++) {
      const leg = mesh(rb(0.3, 0.025, 0.04, 0.01), M.metal, Math.sin(k * 1.256) * 0.14, 0.04, Math.cos(k * 1.256) * 0.14)
      leg.rotation.y = k * 1.256
      g.add(leg)
    }
  }
  const potG = keep(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 6))
  function plant(p: THREE.Object3D, x: number, z: number, s = 1) {
    const g = group(p, x, z, 0)
    g.add(mesh(potG, M.pot, 0, 0.2, 0))
    for (const [a, b, c, r] of [[0, 0.72, 0, 0.34], [0.12, 0.98, 0.05, 0.22], [-0.1, 0.92, -0.06, 0.2]]) g.add(mesh(keep(new THREE.IcosahedronGeometry(r, 0)), M.leaf, a, b, c))
    g.scale.setScalar(s)
  }
  function rack(p: THREE.Object3D, x: number, z: number, ry: number) {
    const g = group(p, x, z, ry)
    box(g, 0.62, 2.05, 0.9, M.graphite, 0, 0, 0, 0.03)
    box(g, 0.56, 1.95, 0.02, M.graphite2, 0, 0.05, 0.45, 0.01)
    for (let r = 0; r < 9; r++) {
      const mt = [M.ledA, M.ledB, M.ledA, M.ledC][(r + Math.floor(Math.abs(x) * 3)) % 4]
      box(g, 0.36, 0.018, 0.012, M.graphite3, -0.05, 0.18 + r * 0.2, 0.47, 0.004)
      box(g, 0.04, 0.018, 0.012, mt, 0.22, 0.18 + r * 0.2, 0.47, 0.004)
    }
  }
  function sofa(p: THREE.Object3D, x: number, z: number, ry: number) {
    const g = group(p, x, z, ry)
    box(g, 1.9, 0.4, 0.8, M.sofa, 0, 0, 0, 0.12)
    box(g, 1.9, 0.42, 0.2, M.sofa, 0, 0.36, -0.3, 0.08)
    for (const dx of [-0.9, 0.9]) box(g, 0.16, 0.55, 0.8, M.sofa, dx, 0, 0, 0.07)
  }
  function coffee(p: THREE.Object3D, x: number, z: number, ry: number) {
    const g = group(p, x, z, ry)
    box(g, 0.7, 1.7, 0.55, M.white, 0, 0, 0, 0.05)
    box(g, 0.5, 0.4, 0.03, M.graphite3, 0, 0.95, 0.28, 0.01)
    box(g, 0.36, 0.04, 0.02, M.blue, 0, 1.48, 0.28, 0.01)
    box(g, 0.3, 0.12, 0.3, M.light, 0, 0.62, 0.12, 0.02)
  }
  function shelf(p: THREE.Object3D, x: number, z: number, ry: number) {
    const g = group(p, x, z, ry)
    box(g, 1.6, 1.9, 0.36, M.graphite2, 0, 0, 0, 0.03)
    for (let r = 0; r < 4; r++) {
      box(g, 1.5, 0.025, 0.32, M.graphite3, 0, 0.3 + r * 0.42, 0.01, 0.01)
      for (let c = 0; c < 5; c++) if ((r * 5 + c) % 3 !== 2) box(g, 0.2, 0.16, 0.2, (r + c) % 4 === 0 ? M.blue : M.light, -0.56 + c * 0.28, 0.33 + r * 0.42, 0.02, 0.03)
    }
  }

  // ---------- andares (cada um com um arranjo; sem rótulos na cena) ----------
  const loader = new THREE.TextureLoader()
  const symTex = keep(loader.load(opts.assets.symbol, () => wake()))
  symTex.colorSpace = THREE.SRGBColorSpace
  const horTex = keep(loader.load(opts.assets.wordmark, () => wake()))
  horTex.colorSpace = THREE.SRGBColorSpace
  const ISL: [number, number][] = [[-2.7, 0.9], [1.7, 0.9]]
  const LAYOUT: { tipo: "estacoes" | "servidores" | "analise"; ilhas: [number, number][] }[] = [
    { tipo: "estacoes", ilhas: ISL }, { tipo: "servidores", ilhas: [ISL[0]] }, { tipo: "analise", ilhas: [ISL[0]] }, { tipo: "estacoes", ilhas: ISL },
  ]
  const SEATS: Seat[] = [], RESTS: Rest[] = [], CHATS: Chat[] = []
  const floatPanels: { m: THREE.Mesh; base: number; t: number }[] = [], rings: THREE.Mesh[] = [], arms: { j1: THREE.Group; j2: THREE.Group; t: number }[] = []
  const padGlow = keep(new THREE.MeshBasicMaterial({ color: C.blue, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  const ceilMat = std(0xffffff, { emissive: 0xfff1de, emissiveIntensity: 0.7 })
  let shadowSpots = 0
  // luz de cima para baixo sobre as mesas (spot com sombra suave; a sombra só considera o próprio andar)
  function topLight(f: THREE.Object3D, y: number, cx: number, cz: number, shadow: boolean) {
    box(f, 2.4, 0.04, 1.4, ceilMat, cx, H - SL - 0.1, cz, 0.02)
    const s = new THREE.SpotLight(0xfff1de, 26, 6, 0.95, 0.75, 2)
    s.position.set(cx, y + H - SL - 0.15, cz)
    s.target.position.set(cx, y, cz)
    if (shadow && shadowSpots < 7) {
      s.castShadow = true
      shadowSpots++
      s.shadow.mapSize.set(512, 512)
      s.shadow.camera.near = 0.3
      s.shadow.camera.far = 3.4
      s.shadow.bias = -0.0006
      s.shadow.normalBias = 0.02
      s.shadow.radius = 4
    }
    s.shadow.camera.layers.set(1 + Math.round(y / H))
    B.add(s, s.target)
  }
  const ringG = keep(new THREE.TorusGeometry(0.13, 0.016, 6, 28, Math.PI * 1.4))
  for (let i = 0; i < NF; i++) {
    const y = floorY(i), f = new THREE.Group()
    f.position.y = y
    staticRoot.add(f)
    const L = LAYOUT[i]
    L.ilhas.forEach(([cx, cz], k) => {
      for (const [dx, dz, r] of [[-0.72, -0.42, 0], [0.72, -0.42, 0], [-0.72, 0.42, Math.PI], [0.72, 0.42, Math.PI]]) {
        desk(f, cx + dx, cz + dz, r)
        const back = r === 0 ? 1 : -1
        chair(f, cx + dx, cz + dz + back * 0.78, r === 0 ? Math.PI : 0)
        SEATS.push({ floor: i, pos: V(cx + dx, 0, cz + dz + back * 0.72), face: r === 0 ? Math.PI : 0, busy: false, desk: [cx + dx, cz + dz], hub: [cx, cz], ilha: true, k })
      }
      topLight(f, y, cx, cz, true)
      const ring = new THREE.Mesh(ringG, M.blue)
      ring.position.set(cx - 0.72, y + 1.45, cz - 0.42)
      ring.rotation.x = Math.PI / 2
      dyn.add(ring)
      rings.push(ring)
    })
    if (L.tipo === "analise") {
      const TX = 1.7, TZ = 0.9
      box(f, 3.4, 0.06, 1.3, M.white, TX, 0.72, TZ, 0.06)
      for (const s of [-1, 1]) box(f, 0.5, 0.72, 0.8, M.graphite3, TX + s * 1.0, 0, TZ, 0.05)
      box(f, 0.5, 0.03, 0.24, M.blue, TX, 0.78, TZ, 0.01)
      for (const [x, s] of [[0.75, -1], [1.7, -1], [2.65, -1], [0.75, 1], [1.7, 1], [2.65, 1]]) {
        const face = s < 0 ? 0 : Math.PI
        chair(f, x, TZ + s * 1.07, face)
        SEATS.push({ floor: i, pos: V(x, 0, TZ + s * 1.01), face, busy: false, desk: [x, TZ + s * 0.35], hub: [TX, TZ], ilha: false, k: 1 })
      }
      const holo = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.7, 0.62)), keep(new THREE.MeshBasicMaterial({ map: chartTex, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })))
      holo.position.set(TX, y + 1.22, TZ)
      holo.rotation.y = 0.62
      dyn.add(holo)
      floatPanels.push({ m: holo, base: holo.position.y, t: 7 })
      box(f, 0.5, 0.06, 0.5, M.graphite, TX, H - SL - 0.42, TZ, 0.03)
      box(f, 0.3, 0.02, 0.3, M.blue, TX, H - SL - 0.44, TZ, 0.01)
      topLight(f, y, TX, TZ, true)
    }
    if (L.tipo === "servidores") {
      for (let k = 0; k < 5; k++) {
        rack(f, 0.3 + k * 0.7, 0.9, 0)
        rack(f, 0.3 + k * 0.7, -0.2, Math.PI)
      }
      for (let k = 0; k < 6; k++) rack(f, 1.5 + k * 0.7, -3.75, 0)
      topLight(f, y, 1.7, 0.35, false)
    } else {
      rack(f, 3.6, -3.75, 0)
      rack(f, 4.3, -3.75, 0)
      if (i % 2 === 0) rack(f, 5.0, -3.75, 0)
    }
    rack(f, -5.45, 0.5, Math.PI / 2)
    rack(f, -5.45, 1.2, Math.PI / 2)
    if (i % 2 === 1) {
      box(f, 1.6, 0.8, 0.7, M.graphite3, -4.9, 0, -3.2, 0.04)
      const arm = new THREE.Group()
      arm.position.set(-4.9, y + 0.8, -3.2)
      arm.add(mesh(keep(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 12)), M.white, 0, 0.05, 0))
      const j1 = new THREE.Group()
      j1.position.y = 0.1
      arm.add(j1)
      j1.add(mesh(rb(0.06, 0.5, 0.06, 0.02), M.white, 0, 0.25, 0))
      const j2 = new THREE.Group()
      j2.position.y = 0.5
      j1.add(j2)
      j2.add(mesh(rb(0.05, 0.4, 0.05, 0.02), M.white, 0, 0.2, 0), mesh(keep(new THREE.SphereGeometry(0.04, 8, 6)), M.blue, 0, 0.42, 0))
      j2.rotation.z = 1.0
      dyn.add(arm)
      arms.push({ j1, j2, t: i })
    } else shelf(f, -5.6, -1.5, Math.PI / 2)
    coffee(f, -5.45, 2.6, Math.PI / 2)
    plant(f, 5.4, 3.6, 0.8)
    cyl(f, 0.62, 0.66, 0.05, M.graphite, 4.2, 0, 0.8, 24)
    const padRing = mesh(keep(new THREE.TorusGeometry(0.54, 0.022, 4, 40)), M.blue, 4.2, 0.06, 0.8)
    padRing.rotation.x = Math.PI / 2
    f.add(padRing)
    const gl = new THREE.Mesh(keep(new THREE.CircleGeometry(0.5, 32)), padGlow)
    gl.rotation.x = -Math.PI / 2
    gl.position.set(4.2, y + 0.056, 0.8)
    dyn.add(gl)
    RESTS.push({ floor: i, pos: V(4.2, 0, 0.8), face: 0.6, lean: false }, { floor: i, pos: V(-4.75, 0, 2.6), face: -Math.PI / 2, lean: true }, { floor: i, pos: V(5.2, 0, -2.2), face: Math.PI / 2, lean: true })
    CHATS.push({ floor: i, a: V(4.6, 0, 3.3), b: V(4.6, 0, 2.4) })
    if (i === 0 || i === 2) {
      const fr = new THREE.Group()
      box(fr, 0.9, 0.9, 0.04, M.graphite, 0, 0, 0, 0.02)
      fr.add(mesh(keep(new THREE.PlaneGeometry(0.72, 0.73)), keep(new THREE.MeshBasicMaterial({ map: symTex, transparent: true })), 0, 0.45, 0.025))
      fr.position.set(-1.0, 1.5, -D / 2 + 0.15)
      f.add(fr)
    }
  }

  // ---------- cobertura: painel "HZK Company" (única tipografia), totem do Z, ar-condicionado, lounge ----------
  const R = new THREE.Group()
  R.position.y = ROOF
  staticRoot.add(R)
  box(R, W, 0.5, 0.06, glassMat, 0, 0, D / 2 - 0.03, 0.01)
  box(R, W - 0.1, 0.04, 0.04, M.graphite3, 0, 0.5, D / 2 - 0.03, 0.01)
  const sign = new THREE.Group()
  box(sign, 0.1, 1.1, 0.1, M.graphite, -1.9, 0, 0, 0.03)
  box(sign, 0.1, 1.1, 0.1, M.graphite, 1.9, 0, 0, 0.03)
  box(sign, 4.6, 1.05, 0.14, M.graphite, 0, 1.1, 0, 0.05)
  box(sign, 4.5, 0.04, 0.04, M.blue, 0, 1.06, 0.08, 0.01)
  sign.add(mesh(keep(new THREE.PlaneGeometry(4.1, 0.78)), keep(new THREE.MeshBasicMaterial({ map: horTex, transparent: true, toneMapped: false })), 0, 1.62, 0.075))
  sign.position.set(-1.5, 0, D / 2 - 0.6)
  R.add(sign)
  const totem = new THREE.Group()
  box(totem, 0.5, 2.2, 0.5, M.graphite, 0, 0, 0, 0.06)
  box(totem, 0.04, 2.0, 0.04, M.blue, 0.27, 0.1, 0, 0.01)
  totem.add(mesh(keep(new THREE.PlaneGeometry(0.42, 0.43)), keep(new THREE.MeshBasicMaterial({ map: symTex, transparent: true, toneMapped: false })), 0, 1.85, 0.26))
  totem.position.set(-5.2, 0, -3.4)
  R.add(totem)
  const fans: THREE.Group[] = []
  const bladeG = rb(0.38, 0.015, 0.11, 0.01), hubG = keep(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10)), grillG = keep(new THREE.TorusGeometry(0.42, 0.04, 6, 24))
  for (const [x, z] of [[3.4, -2.6], [5.0, -2.6]]) {
    box(R, 1.4, 0.9, 1.2, M.light, x, 0, z, 0.05)
    box(R, 1.3, 0.04, 1.1, M.graphite3, x, 0.9, z, 0.02)
    const grill = mesh(grillG, M.graphite3, x, 0.96, z)
    grill.rotation.x = Math.PI / 2
    R.add(grill)
    const fan = new THREE.Group()
    fan.position.set(x, ROOF + 0.95, z)
    for (let b = 0; b < 4; b++) {
      const arm = new THREE.Group()
      arm.rotation.y = (b * Math.PI) / 2
      arm.add(mesh(bladeG, M.graphite, 0.19, 0, 0))
      fan.add(arm)
    }
    fan.add(mesh(hubG, M.metal, 0, 0, 0))
    dyn.add(fan)
    fans.push(fan)
  }
  const pipeG = keep(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 10))
  for (const dz of [-0.25, 0, 0.25]) {
    const p = mesh(pipeG, M.metal, 2.0, 0.35, -3.4 + dz)
    p.rotation.z = Math.PI / 2
    R.add(p)
  }
  for (const [x, z] of [[4.2, -3.4], [-0.2, -3.4]]) box(R, 0.16, 0.5, 0.9, M.graphite3, x, 0, z, 0.03)
  sofa(R, 1.6, 1.4, Math.PI)
  sofa(R, 3.9, 0.6, -Math.PI / 2)
  box(R, 1.0, 0.36, 0.6, M.wood, 2.3, 0, 0.4, 0.06)
  for (const [x, z, s] of [[0.2, 2.8, 1.1], [5.4, 2.9, 0.9], [0.4, -0.6, 0.8]]) plant(R, x, z, s)
  const LOUNGE: Lounge[] = [{ pos: V(1.6, 0, 1.55), face: Math.PI }, { pos: V(1.0, 0, 1.55), face: Math.PI }, { pos: V(3.75, 0, 0.6), face: -Math.PI / 2 }]

  // ---------- elevador: tubo de vidro na frente à esquerda; anel de luz em cada parada ----------
  const ELX = -5.2, ELZ = 3.85, ELAX = ELX + 0.95, ELAZ = ELZ - 0.9
  {
    const tube = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.6, 0.6, ROOF + 1.1, 32, 1, true)), glassMat)
    tube.position.set(ELX, (ROOF + 1.1) / 2 - SL, ELZ)
    dyn.add(tube)
    for (const dx of [0.55, -0.55]) box(staticRoot, 0.04, ROOF + 1.1, 0.04, M.graphite, ELX + dx, -SL, ELZ - 0.2, 0.01)
    const stopG = keep(new THREE.TorusGeometry(0.68, 0.025, 4, 40))
    for (let i = 0; i <= NF; i++) {
      const ring = mesh(stopG, M.blue, ELX, floorY(i) + 0.02, ELZ)
      ring.rotation.x = Math.PI / 2
      staticRoot.add(ring)
    }
    cyl(staticRoot, 0.66, 0.66, 0.06, M.graphite, ELX, ROOF + 1.1 - SL, ELZ, 32)
  }
  const cab = new THREE.Group()
  cab.add(mesh(keep(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 32)), M.light, 0, 0, 0))
  {
    const rim = mesh(keep(new THREE.TorusGeometry(0.55, 0.02, 4, 40)), M.blue, 0, 0.04, 0)
    rim.rotation.x = Math.PI / 2
    cab.add(rim)
  }
  cab.position.set(ELX, 0.03, ELZ)
  dyn.add(cab)

  // ---------- cabos: feixes de 3–4 cabos finos com pulsos laranja defasados ----------
  const cableMats: THREE.ShaderMaterial[] = []
  function cableMaterial(len: number) {
    const m = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSpeed: { value: 1.2 + Math.random() * 1.6 }, uPhase: { value: Math.random() }, uLen: { value: len }, uGap: { value: 2.2 + Math.random() * 2.6 }, uBase: { value: new THREE.Color(0x3a4560) }, uGlow: { value: new THREE.Color(0xff6a2e) } },
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `uniform float uTime,uSpeed,uPhase,uLen,uGap;uniform vec3 uBase,uGlow;varying vec2 vUv;
        void main(){float d=vUv.x*uLen;float x=fract((d-uTime*uSpeed)/uGap+uPhase);float head=smoothstep(0.93,0.985,x)*(1.-smoothstep(0.985,1.,x));float tail=smoothstep(0.78,0.985,x)*0.5;
          float p=clamp(head*1.4+tail,0.,1.);gl_FragColor=vec4(mix(uBase,uGlow*2.4,p),1.);
          #include <colorspace_fragment>
        }`,
    }))
    cableMats.push(m)
    return m
  }
  function bundle(points: V3[], n = 3, sep = 0.08) {
    const off = V(1, 0, 1).normalize()
    for (let k = 0; k < n; k++) {
      const o = off.clone().multiplyScalar((k - (n - 1) / 2) * sep)
      const path = new THREE.CurvePath<V3>()
      for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i].clone().add(o), points[i + 1].clone().add(o)))
      const len = path.getLength()
      dyn.add(new THREE.Mesh(keep(new THREE.TubeGeometry(path, Math.max(4, Math.round(len * 2)), 0.028, 5, false)), cableMaterial(len)))
    }
  }
  // duto principal no canto do fundo à direita; as mesas são alimentadas pelo caminho visível
  // (teto junto ao vidro lateral e à fachada, descida na frente, canaleta no piso): é por ele que os dados viajam
  const RX = W / 2 - 0.45, RZ = -D / 2 + 0.45, FZ = D / 2 - 0.4
  const feedPath = (fl: number, hx: number, hz: number, k: number) => {
    const y = floorY(fl), yt = y + H - SL - 0.26 - k * 0.13
    return [V(RX, yt, RZ), V(RX, yt, FZ), V(hx, yt, FZ), V(hx, y + 0.06, FZ), V(hx, y + 0.06, hz), V(hx, y + 0.76, hz)]
  }
  box(staticRoot, 0.32, ROOF + 0.6, 0.06, M.graphite3, RX, -SL, RZ - 0.12, 0.01)
  bundle([V(RX, 0.2, RZ), V(RX, ROOF + 0.5, RZ), V(RX - 2.2, ROOF + 0.5, RZ), V(RX - 2.2, ROOF + 0.5, RZ + 1.0)], 4)
  for (let i = 0; i < NF; i++) {
    const y = floorY(i), yc = y + H - SL - 0.45, L = LAYOUT[i]
    bundle([V(RX, yc, RZ), V(4.3, yc, RZ), V(4.3, yc, -3.4), V(4.3, y + 2.05, -3.4)], 3)
    bundle([V(RX, yc - 0.16, RZ), V(-5.45, yc - 0.16, RZ), V(-5.45, yc - 0.16, 0.85), V(-5.45, y + 2.05, 0.85)], 3)
    bundle([V(RX, y + 0.25, RZ), V(RX, y + 0.08, -3.1), V(-3.9, y + 0.08, -3.1), V(-3.9, y + 0.08, -1.9), V(-5.0, y + 0.08, -1.9), V(-5.0, y + 0.08, 0.5)], 2, 0.07)
    if (L.tipo === "servidores") for (const x of [0.3, 1.7, 3.1]) bundle([V(RX, yc, RZ), V(RX, yc, 0.35), V(x, yc, 0.35), V(x, y + 2.05, 0.35)], 3)
    if (L.tipo === "analise") bundle([V(RX, yc - 0.08, RZ), V(RX, yc - 0.08, 0.9), V(1.7, yc - 0.08, 0.9), V(1.7, y + H - SL - 0.42, 0.9)], 3)
    L.ilhas.forEach(([cx, cz], k) => {
      bundle(feedPath(i, cx, cz, k), 3)
      box(staticRoot, 0.1, 0.72, 0.1, M.graphite3, cx, y + 0.02, cz, 0.02)
    })
    if (L.tipo === "analise") {
      bundle(feedPath(i, 1.7, 0.9, 1), 3)
      box(staticRoot, 0.1, 0.7, 0.1, M.graphite3, 1.7, y + 0.02, 0.9, 0.02)
    }
  }

  // ---------- robôs (desenho próprio: gota flutuante, cabeça separada, visor) ----------
  const prof = [[0, 0], [0.11, 0.02], [0.21, 0.09], [0.29, 0.23], [0.34, 0.41], [0.35, 0.55], [0.32, 0.64], [0, 0.65]].map(([x, y]) => new THREE.Vector2(x, y))
  const bodyG = keep(new THREE.LatheGeometry(prof, 18)), headG = keep(new THREE.SphereGeometry(0.29, 18, 12)), visorG = keep(new THREE.SphereGeometry(0.27, 18, 10))
  const finG = keep(new THREE.SphereGeometry(0.27, 12, 8)), collarG = keep(new THREE.TorusGeometry(0.32, 0.026, 6, 22)), eyeG = rb(0.11, 0.045, 0.035, 0.018)
  const bangG = rb(0.12, 0.34, 0.12, 0.05), bangDotG = keep(new THREE.IcosahedronGeometry(0.075, 0)), chkA = rb(0.08, 0.15, 0.06, 0.02), chkB = rb(0.08, 0.28, 0.06, 0.02), shadowG = keep(new THREE.CircleGeometry(0.3, 20))
  const shell = std(0xf4f5f7, { roughness: 0.5 }), visorMat = keep(new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.4 })), collarMat = std(0xb9c2d0)
  const blobMat = keep(new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.2, depthWrite: false }))
  const robots: Robot[] = []
  const VAR = { padrao: [1, 1, 1, 1], compacto: [1.12, 0.82, 1.12, 1.1], alto: [0.88, 1.2, 0.88, 0.92] } as const
  function makeRobot(name: string, tipo: keyof typeof VAR, floor: number): Robot {
    const v = VAR[tipo]
    const g = new THREE.Group(), core = new THREE.Group()
    g.add(core)
    const bodyY = 0.3, bh = 0.65 * v[1], hy = bodyY + bh + 0.1 + 0.25 * v[3]
    const body = mesh(bodyG, shell, 0, bodyY, 0)
    body.scale.set(v[0], v[1], v[2])
    const col = mesh(collarG, collarMat, 0, bodyY + bh - 0.02, 0)
    col.rotation.x = Math.PI / 2
    col.scale.set(v[0], v[2], 1)
    core.add(body, col)
    for (const s of [-1, 1]) {
      const f = mesh(finG, shell, s * 0.38 * v[0], bodyY + bh * 0.55, 0.02)
      f.scale.set(0.12, 0.62 * v[1], 0.34)
      f.rotation.z = s * 0.12
      core.add(f)
    }
    const head = new THREE.Group()
    head.position.y = hy
    core.add(head)
    const faceMat = keep(shell.clone())
    faceMat.emissive = new THREE.Color(0x5c86ff)
    faceMat.emissiveIntensity = 0
    const hs = mesh(headG, faceMat, 0, 0, 0)
    hs.scale.set(1.15 * v[3], 0.86 * v[3], v[3])
    const vi = mesh(visorG, visorMat, 0, 0, 0.09 * v[3])
    vi.scale.set(1.05 * v[3], 0.6 * v[3], 0.75 * v[3])
    head.add(hs, vi)
    const eyeMat = std(0x9cc2ff, { emissive: 0x7fb0ff, emissiveIntensity: 1.4 })
    for (const s of [-1, 1]) head.add(mesh(eyeG, eyeMat, s * 0.09 * v[3], 0.01, 0.29 * v[3]))
    const outM = keep(new THREE.MeshBasicMaterial({ color: C.accent, side: THREE.BackSide, transparent: true, opacity: 0 }))
    const ob = new THREE.Mesh(bodyG, outM)
    ob.position.y = bodyY - 0.03
    ob.scale.set(v[0] * 1.1, v[1] * 1.08, v[2] * 1.1)
    core.add(ob)
    const oh = new THREE.Mesh(headG, outM)
    oh.scale.set(1.15 * v[3] * 1.1, 0.86 * v[3] * 1.12, v[3] * 1.1)
    head.add(oh)
    const top = hy + 0.3 * v[3] + 0.18
    const bang = new THREE.Group()
    bang.add(mesh(bangG, M.accent, 0, 0.17, 0), mesh(bangDotG, M.accent, 0, 0, 0))
    bang.position.y = top
    bang.visible = false
    const check = new THREE.Group()
    const c1 = mesh(chkA, M.ok, -0.06, 0, 0)
    c1.rotation.z = 0.8
    const c2 = mesh(chkB, M.ok, 0.08, 0.04, 0)
    c2.rotation.z = -0.6
    check.add(c1, c2)
    check.position.y = top
    check.visible = false
    const sh = new THREE.Mesh(shadowG, blobMat)
    sh.rotation.x = -Math.PI / 2
    sh.position.y = 0.012
    g.add(bang, check, sh)
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = o === body || o === hs
    })
    dyn.add(g)
    const r: Robot = { name, g, core, head, headY: hy, eyeMat, faceMat, outM, bang, check, top, floor, mode: "idle", path: [], after: null, timer: 0, seat: null, t: Math.random() * 6, glow: 0, checkT: 0, lean: 0, waiting: false, failed: false, job: false, rideFrom: 0, rideTo: 0, rideT: 0, dest: 0 }
    robots.push(r)
    return r
  }
  const NOMES = ["Qualificador", "Follow-up", "Montador de site", "Revisor", "Analista", "Coordenador", "Pesquisador", "Redator", "Suporte", "Designer", "Financeiro", "Operações", "Roteirista", "Dados"]
  const TIPOS = ["padrao", "compacto", "alto"] as const
  NOMES.forEach((n, k) => makeRobot(n, TIPOS[k % 3], k % NF))

  // ---------- rotina: trabalhar, pausa no café, conversa, lounge da cobertura, elevador ----------
  const AISLE_BACK = -1.6, AISLE_FRONT = 3.0, LANE_X = -4.4
  function route(r: Robot, floor: number, to: V3): V3[] {
    const p = r.g.position, y = floor === NF ? ROOF : floorY(floor)
    if (floor === NF) return [V(to.x, y, to.z)]
    const aisle = (z: number) => (Math.abs(z - AISLE_BACK) < Math.abs(z - AISLE_FRONT) ? AISLE_BACK : AISLE_FRONT)
    const a1 = aisle(p.z), a2 = aisle(to.z)
    const pts = [V(p.x, y, a1)]
    if (a1 !== a2) pts.push(V(LANE_X, y, a1), V(LANE_X, y, a2))
    pts.push(V(to.x, y, a2), V(to.x, y, to.z))
    return pts
  }
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
  const freeSeat = (floor: number) => pick(SEATS.filter((x) => x.floor === floor && !x.busy))
  function release(r: Robot) {
    if (r.seat) {
      r.seat.busy = false
      r.seat = null
    }
    r.lean = 0
  }
  function plan(r: Robot) {
    release(r)
    const roll = Math.random()
    if (roll < 0.14) {
      const dest = Math.random() < 0.35 ? NF : (r.floor + 1 + Math.floor(Math.random() * (NF - 1))) % NF
      r.path = route(r, r.floor, V(ELAX, 0, ELAZ))
      r.path.push(V(ELX, r.g.position.y, ELZ))
      r.after = { type: "ride", dest }
      r.mode = "walk"
      return
    }
    if (r.floor === NF) {
      const spot = pick(LOUNGE)
      r.path = route(r, NF, spot.pos)
      r.after = { type: "sitLounge", spot }
      r.mode = "walk"
      return
    }
    if (roll < 0.62) {
      const s = freeSeat(r.floor)
      if (s) {
        s.busy = true
        r.seat = s
        r.path = route(r, r.floor, s.pos)
        r.after = { type: "sit" }
        r.mode = "walk"
        return
      }
    }
    if (roll < 0.82) {
      const sp = pick(RESTS.filter((x) => x.floor === r.floor))
      r.path = route(r, r.floor, sp.pos)
      r.after = { type: "rest", sp }
      r.mode = "walk"
      return
    }
    const c = CHATS.find((x) => x.floor === r.floor)
    if (c) {
      const side = Math.random() < 0.5 ? c.a : c.b
      r.path = route(r, r.floor, side)
      r.after = { type: "chat", c, side }
      r.mode = "walk"
      return
    }
    r.mode = "idle"
    r.timer = 2
  }
  function arrive(r: Robot) {
    const a = r.after
    r.after = null
    if (!a) {
      r.mode = "idle"
      r.timer = 1 + Math.random() * 2
    } else if (a.type === "sit" && r.seat) {
      r.mode = "sit"
      r.g.rotation.y = r.seat.face
      r.timer = 10 + Math.random() * 16
    } else if (a.type === "rest") {
      r.mode = "rest"
      r.g.rotation.y = a.sp.face
      r.lean = a.sp.lean ? 0.12 : 0
      r.timer = 6 + Math.random() * 8
    } else if (a.type === "chat") {
      r.mode = "chat"
      const o = a.side === a.c.a ? a.c.b : a.c.a
      r.g.rotation.y = Math.atan2(o.x - a.side.x, o.z - a.side.z)
      r.timer = 6 + Math.random() * 6
    } else if (a.type === "sitLounge") {
      r.mode = "lounge"
      r.g.rotation.y = a.spot.face
      r.timer = 10 + Math.random() * 10
    } else if (a.type === "ride") {
      r.mode = "ride"
      r.rideFrom = r.g.position.y
      r.rideTo = a.dest === NF ? ROOF : floorY(a.dest)
      r.dest = a.dest
      r.rideT = 0
    } else {
      r.mode = "idle"
      r.timer = 1
    }
  }
  function robotLayer(r: Robot) {
    r.g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.layers.set(0)
        o.layers.enable(1 + r.floor)
      }
    })
  }
  robots.forEach((r, k) => {
    robotLayer(r)
    const s = freeSeat(r.floor), y = floorY(r.floor)
    if (s && k % 3 !== 2) {
      s.busy = true
      r.seat = s
      r.g.position.set(s.pos.x, y, s.pos.z)
      r.g.rotation.y = s.face
      r.mode = "sit"
      r.timer = 4 + Math.random() * 12
    } else {
      const sp = RESTS.filter((x) => x.floor === r.floor)[k % 2]
      r.g.position.set(sp.pos.x, y, sp.pos.z)
      r.g.rotation.y = sp.face
      r.mode = "rest"
      r.lean = sp.lean ? 0.12 : 0
      r.timer = 3 + Math.random() * 6
    }
  })
  function paintAttention(r: Robot) {
    const color = r.failed ? C.fail : C.accent
    r.outM.color.set(color)
    r.outM.opacity = r.waiting || r.failed ? 0.9 : 0
    r.bang.visible = r.waiting
    r.eyeMat.color.set(r.waiting || r.failed ? color : 0x9cc2ff)
    r.eyeMat.emissive.set(r.waiting || r.failed ? color : 0x7fb0ff)
  }
  function showCheck(r: Robot) {
    r.check.visible = true
    r.checkT = 1.6
  }

  // ---------- pacotes de dados (seguem o cabo do meio de cada feixe; desenhados por cima, como ícone de jogo) ----------
  const dotG = keep(new THREE.SphereGeometry(0.1, 12, 8))
  const dotMats = new Map<number, THREE.MeshBasicMaterial[]>()
  const dotMaterials = (col: number) => {
    let m = dotMats.get(col)
    if (!m) {
      m = [keep(new THREE.MeshBasicMaterial({ color: col, toneMapped: false, depthTest: false })), keep(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }))]
      for (let i = 1; i <= 6; i++) m.push(keep(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55 - i * 0.08, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false })))
      dotMats.set(col, m)
    }
    return m
  }
  const packets: Packet[] = [], bursts: Burst[] = []
  const handoffs: { job: Job; col: number; cb: () => void; wait: number }[] = []
  function packet(col: number, pts: V3[], onDone: (() => void) | null, speed = 3.4) {
    const mats = dotMaterials(col)
    const g = new THREE.Group()
    const head = new THREE.Mesh(dotG, mats[0]), halo = new THREE.Mesh(dotG, mats[1])
    halo.scale.setScalar(3)
    head.renderOrder = halo.renderOrder = 20
    g.add(head, halo)
    const trail: THREE.Mesh[] = []
    for (let i = 1; i <= 6; i++) {
      const t = new THREE.Mesh(dotG, mats[1 + i])
      t.renderOrder = 19
      t.scale.setScalar(1 - i * 0.12)
      t.visible = false
      dyn.add(t)
      trail.push(t)
    }
    dyn.add(g)
    const curve = new THREE.CurvePath<V3>()
    for (let i = 0; i < pts.length - 1; i++) if (pts[i].distanceTo(pts[i + 1]) > 0.01) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]))
    g.position.copy(pts[0])
    packets.push({ g, trail, hist: [], curve, len: Math.max(curve.getLength(), 0.01), s: 0, speed, onDone })
    wake()
  }
  const deskToRiser = (seat: Seat) => {
    const y = floorY(seat.floor), [dx, dz] = seat.desk, [hx, hz] = seat.hub
    return [V(dx, y + 0.85, dz), V(hx, y + 0.85, hz), ...feedPath(seat.floor, hx, hz, seat.k).reverse()]
  }
  const ROOF_IN = [V(RX - 2.2, ROOF + 7, RZ + 1.0), V(RX - 2.2, ROOF + 0.5, RZ + 1.0), V(RX - 2.2, ROOF + 0.5, RZ), V(RX, ROOF + 0.5, RZ)]
  const SIGN_POS = V(-1.5, ROOF + 1.62, D / 2 - 0.6 + 0.12)
  const burstG = keep(new THREE.RingGeometry(0.08, 0.13, 32)), signG = keep(new THREE.PlaneGeometry(4.4, 0.95))
  function burst(pos: V3, col: number) {
    const m = new THREE.Mesh(burstG, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
    m.position.copy(pos)
    m.rotation.x = -Math.PI / 2
    dyn.add(m)
    bursts.push({ m, t: 0 })
  }
  function signBurst() {
    const m = new THREE.Mesh(signG, new THREE.MeshBasicMaterial({ color: 0xff6a2e, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }))
    m.position.copy(SIGN_POS)
    m.position.z += 0.02
    dyn.add(m)
    bursts.push({ m, t: 0, flat: true })
  }
  /** Quem recebe no andar: um robô sentado numa ilha; senão chama um do andar; sem ninguém, a mesa recebe sozinha. */
  function claim(floor: number): Job {
    let r = robots.find((x) => x.floor === floor && x.mode === "sit" && !x.waiting && !x.job && x.seat && x.seat.ilha === (floor !== SEDE_FLOORS.analise))
    if (r && r.seat) {
      r.job = true
      return { r, seat: r.seat }
    }
    const s = SEATS.find((x) => x.floor === floor && !x.busy && x.ilha === (floor !== SEDE_FLOORS.analise)) ?? SEATS.find((x) => x.floor === floor && !x.busy) ?? SEATS.find((x) => x.floor === floor)!
    r = robots.find((x) => x.floor === floor && !x.waiting && !x.job && x.mode !== "ride")
    if (!r) return { r: null, seat: s }
    release(r)
    s.busy = true
    r.seat = s
    r.job = true
    r.path = route(r, floor, s.pos)
    r.after = { type: "sit" }
    r.mode = "walk"
    return { r, seat: s }
  }
  function freeJob(job: Job, delay = 1800) {
    later(() => {
      if (job.r && !job.r.waiting) {
        job.r.job = false
        job.r.timer = 4 + Math.random() * 6
      }
    }, delay)
  }
  /** Lead "na mão" de um robô esperando decisão (análise): a decisão real resolve o "!". */
  const awaiting = new Map<string, Job>()
  /** Último lugar de cada lead (para o próximo passo partir de onde ele está). */
  const where = new Map<string, Seat>()
  const agentRobot = new Map<string, Robot>()
  const floorIdx = (f: SedeFloor) => SEDE_FLOORS[f]
  const sourceSeat = (entity: string, floor: SedeFloor) => {
    const known = where.get(entity)
    if (known && known.floor === floorIdx(floor)) return known
    const r = robots.find((x) => x.floor === floorIdx(floor) && x.mode === "sit" && x.seat)
    return r?.seat ?? SEATS.find((x) => x.floor === floorIdx(floor))!
  }
  function handoff(job: Job, col: number, cb: () => void) {
    handoffs.push({ job, col, cb, wait: 0 })
  }

  // ---------- fila de ações reais (uma por vez; rajadas são resumidas) ----------
  let queue: SceneQueue = { items: [], skipped: 0 }
  let busy = false
  const reportQueue = () => opts.onQueue?.(queue.items.length + (busy ? 1 : 0), queue.skipped)
  function done(gap = 700) {
    later(() => {
      busy = false
      reportQueue()
      next()
    }, gap)
  }
  function next() {
    if (busy || !queue.items.length) return
    const [a, ...rest] = queue.items
    queue = { ...queue, items: rest }
    busy = true
    reportQueue()
    run(a)
  }
  function run(a: SceneAction) {
    opts.onAction?.(a)
    switch (a.kind) {
      case "arrive": {
        const job = claim(floorIdx(a.floor))
        packet(DOT.lead, [...ROOF_IN, ...deskToRiser(job.seat).reverse()], () =>
          handoff(job, DOT.lead, () => {
            where.set(a.entity, job.seat)
            freeJob(job)
            done()
          }),
        )
        return
      }
      case "transfer": {
        const from = sourceSeat(a.entity, a.from)
        const job = claim(floorIdx(a.to))
        packet(DOT.lead, [...deskToRiser(from), ...deskToRiser(job.seat).reverse()], () =>
          handoff(job, DOT.lead, () => {
            where.set(a.entity, job.seat)
            if (a.await && job.r) {
              job.r.waiting = true
              paintAttention(job.r)
              releaseAwait(a.entity, false) // uma nova análise do mesmo lead substitui a anterior
              awaiting.set(a.entity, job)
            } else freeJob(job)
            done()
          }),
        )
        return
      }
      case "resolve": {
        releaseAwait(a.entity, a.approved)
        done(900)
        return
      }
      case "send": {
        const from = sourceSeat(a.entity, a.from)
        const up = [...deskToRiser(from), V(RX, ROOF + 0.5, RZ), V(RX - 2.2, ROOF + 0.5, RZ), V(RX - 2.2, ROOF + 0.5, RZ + 1.0)]
        if (a.celebrate) {
          packet(DOT.entrega, [...up, V(RX - 2.2, ROOF + 1.62, SIGN_POS.z), SIGN_POS], () => {
            signBurst()
            packet(DOT.entrega, [SIGN_POS, V(SIGN_POS.x, ROOF + 8, SIGN_POS.z)], null, 5)
            done()
          })
        } else packet(DOT.entrega, [...up, V(RX - 2.2, ROOF + 7, RZ + 1.0)], () => done())
        return
      }
      case "discard": {
        const s = sourceSeat(a.entity, a.floor)
        burst(V(s.desk[0], floorY(s.floor) + 0.8, s.desk[1]), DOT.discard)
        releaseAwait(a.entity, false)
        where.delete(a.entity)
        done(900)
        return
      }
      case "agent": {
        let r = agentRobot.get(a.agent)
        if (!r || r.floor !== floorIdx(a.floor)) {
          r = robots.find((x) => x.floor === floorIdx(a.floor) && !agentHas(x)) ?? robots.find((x) => x.floor === floorIdx(a.floor))
          if (r) agentRobot.set(a.agent, r)
        }
        if (r) {
          r.failed = a.state === "failed"
          if (a.state === "working") r.glow = 1.6
          if (a.state === "done") showCheck(r)
          paintAttention(r)
        }
        done(500)
        return
      }
    }
  }
  const agentHas = (r: Robot) => [...agentRobot.values()].includes(r)
  function releaseAwait(entity: string, approved: boolean) {
    const job = awaiting.get(entity)
    if (!job) return
    awaiting.delete(entity)
    if (job.r) {
      job.r.waiting = false
      paintAttention(job.r)
      if (approved) showCheck(job.r)
      job.r.job = false
      job.r.timer = 3 + Math.random() * 3
    }
  }

  // ---------- fundir o que é fixo, por material e andar (poucos desenhos; a sombra de cada spot só vê o seu andar) ----------
  {
    staticRoot.updateMatrixWorld(true)
    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>()
    const remove: THREE.Mesh[] = []
    staticRoot.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const fl = Math.max(0, Math.min(NF, Math.floor((o.matrixWorld.elements[13] + 0.35) / H)))
      const mat = o.material as THREE.Material
      const k = `${mat.uuid}|${fl}`
      if (!buckets.has(k)) buckets.set(k, { mat, geos: [] })
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      for (const a of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(a)) g.deleteAttribute(a)
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      if (!g.attributes.normal) g.computeVertexNormals()
      buckets.get(k)!.geos.push(g)
      remove.push(o)
    })
    remove.forEach((o) => o.parent?.remove(o))
    buckets.forEach(({ mat, geos: list }, k) => {
      const merged = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!merged) return
      const m = new THREE.Mesh(keep(merged), mat)
      m.layers.enable(1 + Number(k.split("|")[1]))
      m.castShadow = !mat.transparent
      m.receiveShadow = true
      B.add(m)
    })
    B.remove(staticRoot)
  }

  // ---------- laço: pausa com a aba escondida; teto de ~30 quadros por segundo ----------
  // Só para testes no painel do navegador escondido (que congela o requestAnimationFrame): ?raf=timeout, nunca em produção.
  const testTimer = process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("raf") === "timeout"
  const raf = (cb: (t: number) => void) => (testTimer ? (setTimeout(() => cb(performance.now()), 33) as unknown as number) : requestAnimationFrame(cb))
  const isHidden = () => !testTimer && document.hidden
  let running = false, last = 0, elapsed = 0, chartClock = 0, statClock = 0, frameN = 0, disposed = false, rafId = 0
  const tmp = new THREE.Vector3()
  function wake() {
    if (!running && !disposed && !isHidden()) {
      running = true
      last = 0
      rafId = raf(loop)
    }
  }
  function stats(): SedeStats {
    const c = { sit: 0, walk: 0, rest: 0, chat: 0, lounge: 0, ride: 0, idle: 0 }
    robots.forEach((r) => c[r.mode]++)
    return { trabalhando: c.sit, andando: c.walk, pausa: c.rest + c.lounge, conversando: c.chat, elevador: c.ride, esperando: robots.filter((r) => r.waiting).length, robos: robots.length }
  }
  function loop(now: number) {
    if (disposed) return
    if (isHidden()) {
      running = false
      return
    }
    if (now - last < 33) {
      rafId = raf(loop)
      return
    }
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0.033
    last = now
    elapsed += dt
    controls.update()
    cableMats.forEach((m) => (m.uniforms.uTime.value = elapsed))
    for (const r of robots) {
      r.t += dt
      if (r.mode === "walk") {
        const tgt = r.path[0]
        if (!tgt) arrive(r)
        else {
          tmp.copy(tgt).sub(r.g.position)
          tmp.y = 0
          const d = tmp.length()
          if (d < 0.04) {
            r.g.position.x = tgt.x
            r.g.position.z = tgt.z
            r.path.shift()
            if (!r.path.length) arrive(r)
          } else {
            tmp.normalize()
            r.g.position.addScaledVector(tmp, Math.min(d, dt * 1.25))
            r.g.rotation.y = Math.atan2(tmp.x, tmp.z)
          }
        }
      } else if (r.mode === "ride") {
        r.rideT += dt / (Math.abs(r.rideTo - r.rideFrom) / 2.2 + 0.6)
        const k = Math.min(r.rideT, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        r.g.position.y = r.rideFrom + (r.rideTo - r.rideFrom) * e
        cab.position.y = r.g.position.y + 0.03
        if (k >= 1) {
          r.floor = r.dest
          robotLayer(r)
          r.g.position.set(ELAX, r.rideTo, ELAZ)
          r.mode = "idle"
          r.timer = 0.5
        }
      } else {
        r.timer -= dt
        if (r.timer <= 0 && !r.waiting && !r.job) plan(r)
      }
      const sitting = r.mode === "sit" || r.mode === "lounge"
      r.core.position.y += ((sitting ? -0.12 : 0) + Math.sin(r.t * 1.6) * 0.03 - r.core.position.y) * 0.2
      r.head.position.y = r.headY + Math.sin(r.t * 1.6 - 0.7) * 0.025
      r.core.rotation.z += ((r.mode === "rest" ? r.lean : 0) - r.core.rotation.z) * 0.1
      r.head.rotation.y = r.mode === "chat" ? Math.sin(r.t * 2.2) * 0.3 : r.mode === "sit" ? Math.sin(r.t * 0.7) * 0.15 : 0
      r.glow += ((r.mode === "sit" ? 1 : 0) - r.glow) * 0.08
      r.faceMat.emissiveIntensity = r.glow * (0.32 + 0.06 * Math.sin(r.t * 3.47))
      if (r.waiting) {
        r.outM.opacity = 0.55 + 0.4 * Math.sin(r.t * 5)
        r.bang.position.y = r.top + Math.sin(r.t * 3) * 0.05
      }
      if (r.checkT > 0) {
        r.checkT -= dt
        r.check.position.y = r.top + (1.6 - r.checkT) * 0.12
        if (r.checkT <= 0) r.check.visible = false
      }
    }
    fans.forEach((f, k) => (f.rotation.y += dt * (6 + k)))
    rings.forEach((g, k) => (g.rotation.z += dt * (2 + (k % 3))))
    floatPanels.forEach((p) => (p.m.position.y = p.base + Math.sin(elapsed * 0.8 + p.t) * 0.05))
    arms.forEach((a) => {
      a.j1.rotation.y = Math.sin(elapsed * 0.6 + a.t) * 1.2
      a.j2.rotation.z = 0.8 + Math.sin(elapsed * 1.1 + a.t) * 0.4
    })
    ;[M.ledA, M.ledB, M.ledC].forEach((m, k) => (m.emissiveIntensity = 1.0 + 0.6 * Math.max(0, Math.sin(elapsed * (3 + k * 1.7) + k))))
    chartClock += dt
    if (chartClock > 0.6) {
      chartClock = 0
      chartT += 0.6
      drawChart()
    }
    statClock += dt
    if (statClock > 1) {
      statClock = 0
      opts.onStats?.(stats())
    }
    // pacotes, entregas na mesa e anéis de chegada
    for (let i = packets.length - 1; i >= 0; i--) {
      const p = packets[i]
      p.s += p.speed * dt
      const u = Math.min(p.s / p.len, 1)
      p.hist.unshift(p.g.position.clone())
      if (p.hist.length > 12) p.hist.pop()
      p.g.position.copy(p.curve.getPointAt(u))
      p.trail.forEach((t, k) => {
        const h = p.hist[k * 2 + 1]
        t.visible = !!h
        if (h) t.position.copy(h)
      })
      p.g.children[1].scale.setScalar(2.6 + Math.sin(elapsed * 9) * 0.4)
      if (u >= 1) {
        packets.splice(i, 1)
        dyn.remove(p.g, ...p.trail)
        p.onDone?.()
      }
    }
    for (let i = handoffs.length - 1; i >= 0; i--) {
      const h = handoffs[i], r = h.job.r
      h.wait += dt
      // entrega quando o robô senta; se ele ainda estiver a caminho depois de 5 s, a mesa recebe e ele chega depois
      if (!r || (r.mode === "sit" && r.seat === h.job.seat) || h.wait > 5) {
        handoffs.splice(i, 1)
        const [dx, dz] = h.job.seat.desk
        burst(V(dx, floorY(h.job.seat.floor) + 0.8, dz), h.col)
        if (r) r.glow = 1.6
        h.cb()
      }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.t += dt
      const k = b.t / 0.9
      if (b.flat) b.m.material.opacity = 0.55 * (1 - k)
      else {
        b.m.scale.setScalar(1 + k * 6)
        b.m.material.opacity = 0.9 * (1 - k)
      }
      if (k >= 1) {
        bursts.splice(i, 1)
        dyn.remove(b.m)
        b.m.material.dispose()
      }
    }
    if (frameN++ % 2 === 0) renderer.shadowMap.needsUpdate = true
    padGlow.opacity = 0.18 + 0.14 * Math.sin(elapsed * 2.4)
    renderer.render(scene, camera)
    rafId = raf(loop) // prédio vivo: sempre há algo acontecendo
  }

  // ---------- tamanho, câmera e ciclo de vida ----------
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1, a = w / h
    camera.left = (-VIEW * a) / 2
    camera.right = (VIEW * a) / 2
    camera.top = VIEW / 2
    camera.bottom = -VIEW / 2
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    wake()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  const onVisible = () => !document.hidden && wake()
  document.addEventListener("visibilitychange", onVisible)
  controls.addEventListener("change", wake)
  const target = V(0, ROOF * 0.48, 0)
  {
    const az = 0.62, el = 0.34, dist = 60
    camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el))
  }
  controls.target.copy(target)
  camera.zoom = container.clientWidth < 760 ? 0.75 : 1
  resize()
  opts.onStats?.(stats())

  return {
    play(action) {
      queue = enqueueScene(queue, action)
      reportQueue()
      next()
      wake()
    },
    setAutoRotate(on) {
      controls.autoRotate = on
      wake()
    },
    dispose() {
      disposed = true
      cancelAnimationFrame(rafId)
      timers.forEach((t) => clearTimeout(t))
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisible)
      controls.dispose()
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose()
      })
      disposables.forEach((d) => d.dispose())
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
