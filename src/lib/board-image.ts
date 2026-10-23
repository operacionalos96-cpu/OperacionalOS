"use client"

import { IMAGE_LIMITS, dataUrlBytes, displaySize } from "@/lib/domain/board"

export interface ProcessedImage {
  src: string
  /** Tamanho com que entra no quadro. */
  width: number
  height: number
}

const SIDES = [960, 760, 600, 460, 340, 240, 180]
const QUALITIES = [0.82, 0.66, 0.5]

/**
 * Reduz a imagem até caber no registro do elemento (IMAGE_LIMITS.maxBytes):
 * tenta lados e qualidades decrescentes em WebP (mantém transparência) e cai
 * para JPEG/PNG onde o navegador não codifica WebP. Devolve null se nem a menor couber.
 */
export async function processImage(file: Blob): Promise<ProcessedImage | null> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return null
  }
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  const display = displaySize(bmp.width, bmp.height)
  for (const side of SIDES) {
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height))
    canvas.width = Math.max(1, Math.round(bmp.width * k))
    canvas.height = Math.max(1, Math.round(bmp.height * k))
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    for (const q of QUALITIES) {
      const src = canvas.toDataURL("image/webp", q)
      if (dataUrlBytes(src) <= IMAGE_LIMITS.maxBytes) {
        bmp.close?.()
        return { src, ...display }
      }
    }
  }
  bmp.close?.()
  return null
}
