/**
 * Gerador do SVG do avatar com rosto (escolha do Gabriel em 14/11/2026: Astro padrão; Módulo e Visor
 * como opção). Mesmo desenho do painel docs/prototipos/dock-avatar-rostos.html.
 *
 *  - os OLHOS contam o estado do bot (piscando, trabalhando, olhando para você, dormindo…);
 *  - as LUAS em órbita contam o nível de acesso (0 = nenhuma; uma por nível);
 *  - o laranja aparece só em "precisa de você".
 * Devolve markup: o componente DockAvatar o coloca na tela. Nenhum texto de fora entra no SVG.
 */
export type AvatarShape = "astro" | "modulo" | "visor"
export type AvatarEyes = "capsula" | "ponto" | "largo"
export type AvatarFace = "livre" | "trabalhando" | "voce" | "fila" | "pausado" | "cota" | "offline" | "feito"

/** Estado do escritório (office-state/v1) → rosto. */
export const FACE_OF: Record<string, AvatarFace> = {
  ocioso: "livre", trabalhando: "trabalhando", conversando: "trabalhando", na_fila: "fila",
  aguardando_aprovacao: "voce", bloqueado: "voce", pausado: "pausado", sem_cota: "cota",
  sem_conexao: "offline", ponte_desligada: "offline", manutencao: "offline", concluiu: "feito",
}

const hx = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => {
  const A = hx(a), B = hx(b)
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("")
}

function eyes(kind: AvatarEyes, face: AvatarFace, fill: string, dx: number, y: number, k: number) {
  const w = (kind === "largo" ? 9 : kind === "ponto" ? 7.4 : 6.6) * k
  const h = (kind === "ponto" ? 7.4 : kind === "largo" ? 8.4 : 11.5) * k
  const eye = (x: number) => {
    if (face === "pausado") return `<rect class="eye" x="${x - w / 2 - 0.6}" y="${y - 1.3}" width="${w + 1.2}" height="2.6" rx="1.3" fill="${fill}"/>`
    if (face === "offline") return `<path class="eye" d="M${x - 3.4} ${y - 3.4}l6.8 6.8M${x + 3.4} ${y - 3.4}l-6.8 6.8" stroke="${fill}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`
    if (face === "feito") return `<path class="eye" d="M${x - 4.2} ${y + 2}q4.2 -7 8.4 0" stroke="${fill}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`
    if (face === "cota") return `<path class="eye" d="M${x - w / 2} ${y - 0.5}h${w}v${h * 0.28}a${w / 2} ${w / 2} 0 0 1 -${w} 0z" fill="${fill}"/>`
    if (face === "voce") return `<circle class="eye" cx="${x}" cy="${y}" r="${Math.max(w, h) * 0.5 + 0.8}" fill="${fill}"/>`
    return `<rect class="eye" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="${fill}"/>`
  }
  return `<g${face === "fila" ? ' transform="translate(2.2 -2.4)"' : ""}><g class="eyes">${eye(-dx)}${eye(dx)}</g></g>`
}

function orbits(level: number, size: number, square: boolean) {
  let s = ""
  if (size <= 20) {
    for (let i = 0; i < level; i++) {
      const a = ((-50 + i * 34) * Math.PI) / 180
      s += `<circle class="moon" cx="${(44 * Math.cos(a)).toFixed(1)}" cy="${(44 * Math.sin(a)).toFixed(1)}" r="7"/>`
    }
    return s
  }
  const R = [35, 41.5, 48], ph = [-48, 150, 62], sw = size >= 100 ? 1 : 1.5
  for (let i = 0; i < Math.min(level, 3); i++) {
    const a = (ph[i] * Math.PI) / 180, r = R[i]
    const ring = square
      ? `<rect class="orbit" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" rx="${(r * 0.52).toFixed(1)}" stroke-width="${sw}"/>`
      : `<circle class="orbit" r="${r}" stroke-width="${sw}"/>`
    // no módulo a lua anda pela borda do quadrado; nos outros, pelo círculo
    const cx = Math.cos(a) * 1.25, onSide = Math.abs(cx) > 1
    const mx = square ? Math.max(-r, Math.min(r, r * cx)) : r * Math.cos(a)
    const my = square ? (onSide ? r * Math.sin(a) : Math.sin(a) > 0 ? r : -r) : r * Math.sin(a)
    s += `<g class="spin r${i + 1}">${ring}<circle class="moon" cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="${size >= 100 ? 3 : 4}"/></g>`
  }
  return s
}

export function avatarSvg(
  o: { shape?: AvatarShape; level?: number; state?: string; size?: number; color?: string; eyes?: AvatarEyes },
  id: string,
): string {
  const { shape = "astro", state = "ocioso", eyes: kind = "capsula" } = o
  // só números e nomes conhecidos chegam ao markup: nada de fora é escrito no SVG
  const level = Math.max(0, Math.min(3, Math.trunc(Number(o.level) || 0)))
  const size = Math.max(8, Math.min(512, Math.trunc(Number(o.size) || 40)))
  const color = /^#[0-9a-fA-F]{6}$/.test(o.color ?? "") ? (o.color as string) : "#3b7cf2"
  const face = Object.hasOwn(FACE_OF, state) ? FACE_OF[state] : "livre"
  const micro = size <= 20
  const dim = face === "pausado" || face === "offline", tired = face === "cota"
  const base = dim ? mix(color, "#8a93a3", 0.72) : tired ? mix(color, "#8a93a3", 0.35) : color
  const S = micro ? 30 : 27
  const ek = micro ? 1.5 : 1
  let defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(base, "#ffffff", 0.22)}"/><stop offset="1" stop-color="${mix(base, "#0b1020", 0.22)}"/></linearGradient>`
  let body: string, look: string
  if (shape === "modulo") {
    const r = S * 0.96
    body = `<rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" rx="${(r * 0.52).toFixed(1)}" fill="url(#${id})"/><rect x="${-r + 4}" y="${-r + 3.5}" width="${2 * r - 8}" height="${(r * 0.7).toFixed(1)}" rx="${(r * 0.4).toFixed(1)}" fill="#fff" opacity=".13"/>`
    look = eyes(kind, face, "#fff", micro ? 11 : 9.5, micro ? 0 : 1, ek)
  } else if (shape === "visor") {
    const shell = dim ? "#3a4252" : "#1b2432", glow = dim ? "#9aa3b2" : mix(color, "#ffffff", tired ? 0.1 : 0.28)
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(shell, "#ffffff", 0.14)}"/><stop offset="1" stop-color="${shell}"/></linearGradient>`
    const band = `x="${(-S * 0.8).toFixed(1)}" y="${(-S * 0.42).toFixed(1)}" width="${(S * 1.6).toFixed(1)}" height="${(S * 0.8).toFixed(1)}" rx="${(S * 0.4).toFixed(1)}"`
    body = `<circle r="${S}" fill="url(#${id})"/><circle r="${S - 0.6}" fill="none" stroke="${glow}" stroke-opacity=".38" stroke-width="${micro ? 4 : 1.2}"/><rect ${band} fill="${mix(color, "#0b1020", dim ? 0.8 : 0.62)}"/><rect ${band} fill="none" stroke="${glow}" stroke-opacity=".5" stroke-width="${micro ? 3 : 1.2}"/>`
    look = eyes(kind, face, glow, micro ? 10 : 8.5, micro ? -1 : -1.2, micro ? 1.3 : 0.82)
  } else {
    body = `<circle r="${S}" fill="url(#${id})"/><ellipse cx="${(-S * 0.3).toFixed(1)}" cy="${(-S * 0.5).toFixed(1)}" rx="${(S * 0.38).toFixed(1)}" ry="${(S * 0.18).toFixed(1)}" fill="#fff" opacity=".22" transform="rotate(-24 ${(-S * 0.3).toFixed(1)} ${(-S * 0.5).toFixed(1)})"/>`
    look = eyes(kind, face, "#fff", micro ? 11 : 9.5, micro ? 0 : -1, ek)
  }
  let extra = ""
  if (face === "voce") {
    extra += `<g class="ask">${shape === "modulo"
      ? `<rect x="${-S - 4}" y="${-S - 4}" width="${2 * S + 8}" height="${2 * S + 8}" rx="${((S + 4) * 0.52).toFixed(1)}" fill="none" stroke="var(--hot)" stroke-width="${micro ? 6 : 2.4}"/>`
      : `<circle r="${S + 4.5}" fill="none" stroke="var(--hot)" stroke-width="${micro ? 6 : 2.4}"/>`}</g>`
    if (!micro) extra += `<circle cx="${(S * 0.86).toFixed(1)}" cy="${(-S * 0.86).toFixed(1)}" r="6.2" fill="var(--hot)" stroke="var(--surface)" stroke-width="2"/>`
  }
  if (face === "pausado" && !micro) extra += `<text class="zz" x="${(S * 0.72).toFixed(1)}" y="${(-S * 0.7).toFixed(1)}" font-size="13" font-weight="700" fill="var(--fg-3)" font-family="Inter, system-ui, sans-serif">z</text>`
  if (face === "fila" && !micro) extra += `<circle class="qdot" cx="${(S * 0.95).toFixed(1)}" cy="${(-S * 0.95).toFixed(1)}" r="4"/>`
  return `<svg class="dock-av" data-level="${level}" data-face="${face}" width="${size}" height="${size}" viewBox="-52 -52 104 104" role="img" aria-label="nível ${level}, ${face}"><defs>${defs}</defs>${orbits(level, size, shape === "modulo")}${body}${look}${extra}</svg>`
}
