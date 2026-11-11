/**
 * Fundo "as órbitas que se alinham no Z" (nota 34 do cofre). Como no gráfico "Um universo digital"
 * do guia HZK: o sol laranja fica no canto de cima à direita, quase fora da tela, e só os arcos das
 * órbitas aparecem. Três nós laranja andam em três órbitas, cada um no seu ritmo (48 s, 72 s e 144 s);
 * a cada 144 s eles se alinham na diagonal do Z do logo e uma linha laranja os liga por um instante.
 * Na abertura começam alinhados. Só rotação em CSS (leve); parado com "reduzir movimento".
 */
const C = { x: 690, y: 120 }
const RINGS = [120, 210, 310, 420, 540]
const DIAG = 135 // graus: do sol para baixo-esquerda, a diagonal do Z

const at = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) }
}

// Nós da marca: alinhados em DIAG no instante 0 e a cada 144 s (48, 72 e 144 dividem 144).
const BRAND = [
  { r: 210, dur: 48, size: 5 },
  { r: 310, dur: 72, size: 5.5 },
  { r: 420, dur: 144, size: 6 },
]
// Nós neutros, fora de fase, só para dar vida.
const NEUTRAL = [
  { r: 120, dur: 50, start: 112, size: 3 },
  { r: 310, dur: 90, start: 170, size: 3 },
  { r: 540, dur: 140, start: 118, size: 3.5 },
  { r: 540, dur: 140, start: 168, size: 2.5 },
]
const STARS: [number, number, number][] = [
  [140, 120, 1.4], [260, 300, 1.2], [90, 420, 1.5], [430, 560, 1.2], [600, 470, 1.3], [330, 80, 1.1], [520, 250, 1.2],
]

export function OrbitField() {
  const a = at(BRAND[0].r, DIAG)
  const b = at(BRAND[2].r, DIAG)
  return (
    <div aria-hidden className="hzk-orbit-field pointer-events-none fixed top-0 right-0 z-0 hidden md:block">
      <svg viewBox="0 0 800 620" preserveAspectRatio="xMaxYMin meet" className="h-full w-full">
        <defs>
          <radialGradient id="hzk-sun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ea5b25" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ea5b25" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sol e órbitas */}
        <circle cx={C.x} cy={C.y} r={90} fill="url(#hzk-sun)" />
        {RINGS.map((r, i) => (
          <circle key={r} cx={C.x} cy={C.y} r={r} fill="none" className={i === RINGS.length - 1 ? "hzk-orbit-line hzk-orbit-dashed" : "hzk-orbit-line"} />
        ))}
        <circle cx={C.x} cy={C.y} r={13} className="hzk-orbit-node-hot" />

        {/* Estrelas */}
        {STARS.map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} className="hzk-star" style={{ animationDelay: `${i * 0.9}s` }} />
        ))}

        {/* Linha do Z: aparece quando os três nós se alinham */}
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="hzk-align-line" />

        {/* Nós neutros */}
        {NEUTRAL.map((n, i) => {
          const p = at(n.r, n.start)
          return (
            <g key={`n${i}`} className="hzk-orbit-spin" style={{ animationDuration: `${n.dur}s` }}>
              <circle cx={p.x} cy={p.y} r={n.size} className="hzk-orbit-node" />
            </g>
          )
        })}

        {/* Nós da marca */}
        {BRAND.map((n, i) => {
          const p = at(n.r, DIAG)
          return (
            <g key={`b${i}`} className="hzk-orbit-spin" style={{ animationDuration: `${n.dur}s` }}>
              <circle cx={p.x} cy={p.y} r={n.size + 6} className="hzk-node-halo" />
              <circle cx={p.x} cy={p.y} r={n.size} className="hzk-orbit-node-hot" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
