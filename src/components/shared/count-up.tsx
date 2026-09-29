"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Número que conta até o valor quando aparece ou muda (ease-out, ~0,9s).
 * Comunica "isto é um dado vivo". Respeita prefers-reduced-motion.
 */
export function CountUp({ value, format = String, duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const start = from.current
    from.current = value
    if (reduce || start === value) {
      setShown(value)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(start + (value - start) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])

  return <>{format(Math.round(shown))}</>
}
