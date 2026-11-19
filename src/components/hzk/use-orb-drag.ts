"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Posição da bolinha do guia, só neste navegador. Sem posição salva = o canto de sempre. */
const KEY = "hzk-os-guide-orb-pos"
/** Abaixo disso é clique (abre o guia); acima, a pessoa está arrastando. */
const DRAG_THRESHOLD = 5
/** Folga mínima até a borda da janela. */
const EDGE = 8
/** Passo das setas com Alt. */
const KEY_STEP = 24

export type OrbPos = { x: number; y: number }

function load(): OrbPos | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null")
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null
  } catch {
    return null
  }
}
function store(p: OrbPos | null) {
  try {
    if (p) localStorage.setItem(KEY, JSON.stringify(p))
    else localStorage.removeItem(KEY)
  } catch {}
}

/** Mantém a bolinha inteira dentro da janela. */
export function clampOrb(p: OrbPos, size: number, vw: number, vh: number): OrbPos {
  return {
    x: Math.round(Math.min(Math.max(EDGE, p.x), Math.max(EDGE, vw - size - EDGE))),
    y: Math.round(Math.min(Math.max(EDGE, p.y), Math.max(EDGE, vh - size - EDGE))),
  }
}

/** Caixa da bolinha sem o efeito de zoom do hover (mede o invólucro, que não escala). */
const box = (el: HTMLElement) => (el.parentElement ?? el).getBoundingClientRect()

/**
 * Bolinha flutuante: a pessoa arrasta com mouse ou toque para onde quiser, a posição fica salva e
 * continua dentro da tela ao redimensionar. Clique sem arrastar (menos de 5 px) segue abrindo o guia.
 * Teclado: Alt + setas move; Alt + Home volta ao canto.
 */
export function useOrbDrag(el: React.RefObject<HTMLElement | null>, onClick: () => void) {
  const [pos, setPos] = useState<OrbPos | null>(null)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)

  const fit = useCallback((p: OrbPos) => clampOrb(p, el.current?.offsetWidth ?? 56, window.innerWidth, window.innerHeight), [el])

  useEffect(() => {
    const saved = load()
    if (saved) setPos(fit(saved))
    const onResize = () => setPos((p) => (p ? fit(p) : p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [fit])

  const reset = useCallback(() => {
    setPos(null)
    store(null)
  }, [])

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0) return
      const r = box(e.currentTarget)
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false }
      // captura já no toque: mesmo um puxão rápido, que sai da bolinha no primeiro movimento, vira arrasto
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const s = start.current
      if (!s || s.id !== e.pointerId) return
      const dx = e.clientX - s.x
      const dy = e.clientY - s.y
      if (!s.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        s.moved = true
        setDragging(true)
      }
      setPos(fit({ x: s.left + dx, y: s.top + dy }))
    },
    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const s = start.current
      start.current = null
      if (!s?.moved) return
      swallowClick.current = true
      // se o navegador não mandar o clique depois do arrasto, o próximo clique de verdade não se perde
      setTimeout(() => (swallowClick.current = false), 0)
      setDragging(false)
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      setPos((p) => {
        if (p) store(p)
        return p
      })
    },
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      start.current = null
      setDragging(false)
    },
    onClick() {
      // o clique que fecha um arrasto não abre o guia
      if (swallowClick.current) {
        swallowClick.current = false
        return
      }
      onClick()
    },
    onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
      if (!e.altKey) return
      if (e.key === "Home") {
        e.preventDefault()
        reset()
        return
      }
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
      if (!d) return
      e.preventDefault()
      const r = box(e.currentTarget)
      const next = fit({ x: r.left + d[0] * KEY_STEP, y: r.top + d[1] * KEY_STEP })
      setPos(next)
      store(next)
    },
  }

  return { pos, dragging, reset, handlers }
}
