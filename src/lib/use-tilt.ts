"use client"

import { useEffect, useRef } from "react"

const MAX_DEG = 3

/**
 * Inclinação 3D leve + reflexo de luz seguindo o mouse (classe `tilt`, src/app/globals.css).
 * Só escreve variáveis CSS num quadro de animação por movimento (requestAnimationFrame) — nada de
 * re-render do React — e fica DESLIGADO em tela de toque e com "reduzir movimento" ativo.
 */
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const canTilt = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)")
    if (!canTilt.matches) return

    let frame = 0
    function move(e: PointerEvent) {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = el!.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        const y = (e.clientY - r.top) / r.height
        el!.style.setProperty("--ry", `${(x - 0.5) * 2 * MAX_DEG}deg`)
        el!.style.setProperty("--rx", `${(0.5 - y) * 2 * MAX_DEG}deg`)
        el!.style.setProperty("--mx", `${x * 100}%`)
        el!.style.setProperty("--my", `${y * 100}%`)
        el!.style.setProperty("--ty", "-3px")
        el!.style.setProperty("--sheen", "1")
      })
    }
    function leave() {
      cancelAnimationFrame(frame)
      for (const v of ["--rx", "--ry", "--ty", "--sheen"]) el!.style.removeProperty(v)
    }
    el.addEventListener("pointermove", move)
    el.addEventListener("pointerleave", leave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener("pointermove", move)
      el.removeEventListener("pointerleave", leave)
    }
  }, [])

  return ref
}
