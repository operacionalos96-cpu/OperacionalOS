/* eslint-disable @typescript-eslint/no-explicit-any -- porte direto do gerador conferido a 1:1 no protótipo (F3) */
/**
 * Gerador do SVG do avatar (mesmo desenho do protótipo aprovado). Devolve markup: o componente
 * DockAvatar o coloca na tela. O texto do glifo é escapado; ids dos gradientes vêm do React (useId).
 */
type AnyFn = (...a: any[]) => any
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
let idPrefix = "a"
/* ---------- cor ---------- */
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("") }

/* ---------- desenho ---------- */
const Z = -45 // diagonal do Z: para cima e à direita
const circ = (r: number) => 2 * Math.PI * r
// anel com uma abertura (dasharray); rot = ângulo do centro da abertura
const gapRing = (r: number, frac: number) => `stroke-dasharray="${(circ(r) * (1 - frac)).toFixed(2)} ${(circ(r) * frac).toFixed(2)}"`
const gapRot = (deg: number, frac: number) => deg + frac * 180

const ICONS: Record<string, string> = {
  cota: '<path d="M-4.5 -6h9M-4.5 6h9M-3.5 -6c0 3.5 7 3.5 7 6s-7 2.5-7 6M3.5 -6c0 3.5-7 3.5-7 6s7 2.5 7 6" />',
  conexao: '<path d="M-3 -6v4M3 -6v4M-5.5 -2h11v2a5.5 5.5 0 0 1-11 0zM0 5.5v3" />',
  ponte: '<path d="M-6.5 -5.5h13v9h-13zM-3 6.5h6M-7 -7l14 15" />',
}
export const GLYPH_SVG: Record<string, string> = {
  lupa: '<circle cx="-2.5" cy="-2.5" r="6.5" fill="none" stroke-width="3"/><path d="M2.5 2.5l6 6" stroke-width="3.4" stroke-linecap="round"/>',
  codigo: '<path d="M-4 -7l-6 7 6 7M4 -7l6 7-6 7" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  barras: '<path d="M-7 8v-7M0 8v-15M7 8v-10" stroke-width="3.6" stroke-linecap="round"/>',
}

function sphere(v: string, S: number, color: string, gid: string, micro?: boolean) {
  const top = mix(color, "#ffffff", v === "B" ? .16 : .3), mid = color, low = mix(color, "#000000", v === "B" ? .18 : .4)
  const ember = v === "C" ? `<radialGradient id="e${gid}" cx="50%" cy="108%" r="62%"><stop offset="0" stop-color="${mix(color, "#ffffff", .45)}" stop-opacity=".55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>` : ""
  const g = v === "B"
    ? `<linearGradient id="g${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${low}"/></linearGradient>`
    : `<radialGradient id="g${gid}" cx="36%" cy="28%" r="78%"><stop offset="0" stop-color="${top}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${low}"/></radialGradient>`
  return { defs: g + ember, body: `<g class="sphere"><circle r="${S}" fill="url(#g${gid})"/>${v === "C" ? `<circle r="${S}" fill="url(#e${gid})"/>` : ""}${v === "A" ? `<ellipse cx="-${S * .28}" cy="-${S * .42}" rx="${S * .42}" ry="${S * .24}" fill="#fff" opacity=".10" transform="rotate(-28 -${S * .28} -${S * .42})"/>` : ""}<circle r="${S - .5}" fill="none" stroke="var(--rim)" stroke-width="${micro ? 4 : 1}"/></g>` }
}

function glyphMark(glyph: string, S: number, _size: number) {
  if (!glyph) return ""
  if (GLYPH_SVG[glyph]) return `<g fill="#f3f4f6" stroke="#f3f4f6" transform="scale(${(S / 23).toFixed(2)})">${GLYPH_SVG[glyph]}</g>`
  const fs = S * (glyph.length > 1 ? .74 : .95)
  return `<text y="${(fs * .35).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="600" fill="#f3f4f6" font-family="Milliard, Inter, system-ui, sans-serif" letter-spacing="-.02em">${esc(glyph)}</text>`
}

/**
 * avatar({ v: "A"|"B"|"C", level: 0-3, state, size, color, glyph })
 * v A = Saturno (anéis inclinados) · B = Halo (anéis planos com uma abertura) · C = Constelação (órbitas finas com nós)
 */
export function avatarSvg(o: any, prefix: string): string {
  idPrefix = prefix
  const { v = "C", level = 2, state = "ocioso", size = 40, color = "#3d5a80", glyph = "P" } = o
  const id = idPrefix
  const micro = size <= 20
  const sw = size >= 120 ? 1 : 1.55 // espessura relativa: mais grossa no tamanho médio
  let defs = "", back = "", front = "", extra = ""
  let S: number

  if (micro) {
    S = 27
    const sp = sphere(v, S, color, id, true)
    defs += sp.defs
    const R = 42, w = 11
    if (v === "C") {
      // nós a 16 px: um a três pontos na órbita
      const ph = [Z, Z + 120, Z + 240]
      for (let i = 0; i < level; i++) front += `<g class="ring k1${i === level - 1 ? " outer" : ""}" style="--a:${ph[i]}deg;--z:0deg"><circle class="rs" r="${R}" stroke-width="0" /><circle class="nd" cx="${R}" r="8.5"/></g>`
    } else {
      // anel único em 1 a 3 pedaços
      const seg = 96, gap = 24
      if (level) {
        const arcs: number[] = []
        for (let i = 0; i < 3; i++) arcs.push(i < level ? seg : 0, i < level ? gap : seg + gap)
        const k = circ(R) / 360
        front += `<g class="ring k1 outer" style="--a:-${90 + seg / 2}deg;--z:${Z - seg / 2}deg;--dash:4 4"><circle class="rs" r="${R}" stroke-width="${w}" stroke-dasharray="${arcs.map((a) => (a * k).toFixed(2)).join(" ")}"/></g>`
      }
    }
    extra += `<g class="ghost" style="--a:0deg;--dash:4 5"><circle class="rs" r="${R}" stroke-width="5" ${gapRing(R, .18)}/></g>`
    extra += `<circle class="qnode" cx="${(R * Math.cos(-Math.PI / 4)).toFixed(1)}" cy="${(R * Math.sin(-Math.PI / 4)).toFixed(1)}" r="9" fill="var(--fg)"/>`
    extra += `<g class="maint" style="--a:0deg"><circle class="rs" r="${R + 4}" stroke-width="3" ${gapRing(R + 4, .3)} style="stroke:var(--ring-soft)"/></g>`
    const body = sp.body
    return `<svg class="dock-av micro" data-level="${level}" data-state="${state === "concluiu" ? "ocioso" : state}" data-demo="${state === "concluiu" ? "done" : ""}" width="${size}" height="${size}" viewBox="-50 -50 100 100" role="img" aria-label="nível ${level}, ${state}"><defs>${defs}</defs>${body}${front}${extra}</svg>`
  }

  if (v === "A") {
    S = 25
    const rx = [33, 40.5, 48], tilt = [-24, -15, -6], ryk = .34
    for (let i = 0; i < level; i++) {
      const cls = `ring k${i + 1}${i === level - 1 ? " outer" : ""}`, st = `--a:${tilt[i]}deg;--z:${Z}deg`
      const e = `cx="0" cy="0" rx="${rx[i]}" ry="${(rx[i] * ryk).toFixed(1)}" stroke-width="${(1.7 * sw).toFixed(2)}"`
      back += `<g class="${cls}" style="${st}"><ellipse class="rs" ${e} style="opacity:.42"/></g>`
      front += `<g class="${cls}" style="${st}"><ellipse class="rs" ${e} clip-path="url(#f${id})"/></g>`
    }
    defs += `<clipPath id="f${id}"><rect x="-60" y="0" width="120" height="60"/></clipPath>`
  } else if (v === "B") {
    S = 26
    const R = [33.5, 40, 46.5], ph = [200, 80, 320], frac = .12
    for (let i = 0; i < level; i++) {
      front += `<g class="ring k${i + 1}${i === level - 1 ? " outer" : ""}" style="--a:${gapRot(ph[i], frac)}deg;--z:${gapRot(Z, frac)}deg"><circle class="rs" r="${R[i]}" stroke-width="${(1.9 * sw).toFixed(2)}" stroke-linecap="round" ${gapRing(R[i], frac)}/></g>`
    }
  } else {
    S = 26
    const R = [33.5, 40, 46.5], ph = [30, 150, 260]
    for (let i = 0; i < level; i++) {
      front += `<g class="ring k${i + 1}${i === level - 1 ? " outer" : ""}" style="--a:${ph[i]}deg;--z:${Z}deg"><circle class="rs" r="${R[i]}" stroke-width="${(.9 * sw).toFixed(2)}" style="opacity:.55"/><circle class="nd" cx="${R[i]}" r="${(3.3 * (sw > 1 ? 1.25 : 1)).toFixed(1)}"/></g>`
    }
    // a linha do Z que passa quando conclui
    if (level) extra += `<line class="zline" x1="0" y1="0" x2="${(R[level - 1] * Math.cos(Z * Math.PI / 180)).toFixed(1)}" y2="${(R[level - 1] * Math.sin(Z * Math.PI / 180)).toFixed(1)}"/>`
  }
  if (v !== "C" && level) {
    const R = v === "A" ? 33 : [33.5, 40, 46.5][level - 1]
    extra += `<line class="zline" x1="${(S * .7).toFixed(1)}" y1="${(-S * .7).toFixed(1)}" x2="${(R * .78).toFixed(1)}" y2="${(-R * .78).toFixed(1)}"/>`
  }

  const sp = sphere(v, S, color, id)
  defs += sp.defs
  // anel fantasma (nível 0) e anel de manutenção
  extra += `<g class="ghost" style="--a:0deg"><circle class="rs" r="33.5" stroke-width="${(1.4 * sw).toFixed(2)}" stroke-linecap="round" ${gapRing(33.5, .2)}/></g>`
  extra += `<g class="maint" style="--a:0deg"><circle class="rs" r="${level === 3 ? 49 : 47}" stroke-width="${(.8 * sw).toFixed(2)}" stroke-linecap="round" ${gapRing(level === 3 ? 49 : 47, .35)} style="stroke:var(--ring-soft)"/></g>`
  // nó da fila, na borda
  const qa = -Math.PI / 4 - .55, qr = level === 3 ? 49 : 44
  extra += `<circle class="qnode" cx="${(qr * Math.cos(qa)).toFixed(1)}" cy="${(qr * Math.sin(qa)).toFixed(1)}" r="${(3.4 * sw * (sw > 1 ? 1.3 : 1)).toFixed(1)}" fill="var(--fg)"/>`
  // ícones do motivo
  for (const k of ["cota", "conexao", "ponte"]) extra += `<g class="badge b-${k}" transform="translate(34 34)"><circle r="${size >= 120 ? 12 : 16}" fill="var(--badge)" stroke="var(--surface-2)" stroke-width="3.5"/><g fill="none" stroke="var(--badge-fg)" stroke-width="${size >= 120 ? 1.8 : 2.4}" stroke-linecap="round" stroke-linejoin="round" transform="scale(${size >= 120 ? .8 : 1.05})">${ICONS[k]}</g></g>`

  const shown = state === "concluiu" ? "ocioso" : state
  return `<svg class="dock-av" data-level="${level}" data-state="${shown}" data-demo="${state === "concluiu" ? "done" : ""}" width="${size}" height="${size}" viewBox="-50 -50 100 100" role="img" aria-label="nível ${level}, ${state}"><defs>${defs}</defs>${back}${sp.body}${glyphMark(glyph, S, size)}${front}${extra}</svg>`
}


export type _Unused = AnyFn
