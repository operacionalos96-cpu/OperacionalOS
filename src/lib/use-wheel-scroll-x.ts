"use client"

import { useEffect } from "react"

/** Linha e página da rodinha em pixels (deltaMode 1 e 2). */
const LINE = 16

/** Algum elemento entre o ponteiro e o quadro ainda rola na vertical nessa direção? (ex.: uma coluna comprida) */
function innerCanScrollY(target: EventTarget | null, board: HTMLElement, dy: number) {
  for (let el = target instanceof Element ? target : null; el && el !== board; el = el.parentElement) {
    if (!(el instanceof HTMLElement) || el.scrollHeight <= el.clientHeight + 1) continue
    const oy = getComputedStyle(el).overflowY
    if (oy !== "auto" && oy !== "scroll") continue
    if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true
  }
  return false
}

/**
 * Quadro com rolagem lateral (Pipeline, Conteúdos): a rodinha comum do mouse também anda para os lados.
 *  - em cima de uma coluna que ainda rola na vertical, a coluna rola primeiro;
 *  - Shift + rodinha, trackpad de lado e Ctrl + rodinha (zoom) seguem o navegador;
 *  - no fim do quadro a rodinha volta a rolar a página (nada fica preso).
 * O ouvinte não passivo fica só no contêiner do quadro.
 */
export function useWheelScrollX(ref: React.RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const board = ref.current
    if (!board || !enabled) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.shiftKey || e.defaultPrevented) return
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return // gesto já é de lado (trackpad)
      const dy = e.deltaY * (e.deltaMode === 1 ? LINE : e.deltaMode === 2 ? board.clientWidth : 1)
      if (!dy || board.scrollWidth <= board.clientWidth + 1) return
      if (innerCanScrollY(e.target, board, dy)) return
      const room = dy > 0 ? board.scrollLeft + board.clientWidth < board.scrollWidth - 1 : board.scrollLeft > 0
      if (!room) return
      e.preventDefault()
      board.scrollLeft += dy
    }
    board.addEventListener("wheel", onWheel, { passive: false })
    return () => board.removeEventListener("wheel", onWheel)
  }, [ref, enabled])
}
