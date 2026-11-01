"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Número que conta até o valor quando aparece ou muda (ease-out, até 600 ms; só na 1ª carga da sessão).
 * Comunica "isto é um dado vivo". Respeita prefers-reduced-motion.
 */
/** Já contou nesta sessão? Ao voltar para a página, o número aparece pronto (briefing). */
let countedThisSession = false

export function CountUp({ value, format = String, duration = 600 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(countedThisSession ? value : 0)

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const start = from.current
    from.current = value
    countedThisSession = true
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
