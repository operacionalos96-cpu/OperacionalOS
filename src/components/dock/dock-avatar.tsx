"use client"

import { useId } from "react"
import { AVATAR_COLORS, avatarEyes, type AvatarColor, type AvatarStyle } from "@/lib/domain/dock"
import type { AgentState } from "@/lib/domain/office"
import { avatarSvg, type AvatarShape } from "./avatar-svg"
import "./dock-avatar.css"

/** Os três nomes do banco continuam os mesmos; o desenho de cada um é que mudou (sem migration). */
const SHAPE: Record<AvatarStyle, AvatarShape> = { constelacao: "astro", saturno: "modulo", halo: "visor" }

/**
 * Avatar de um bot do HZK Dock: um personagem com rosto. Os olhos contam o estado (office-state/v1)
 * e as luas em órbita contam o nível de acesso (0–3). `done` mostra o rosto de "concluiu" (quem chama controla o tempo).
 * `glyph` guarda o formato dos olhos (cápsula, ponto, largo); valores antigos caem na cápsula.
 */
export function DockAvatar({
  name,
  style = "constelacao",
  color = "aco",
  glyph = "",
  level,
  state = "ocioso",
  size = 40,
  done = false,
  className,
}: {
  name: string
  style?: AvatarStyle
  color?: AvatarColor
  glyph?: string
  level: number
  state?: AgentState | "concluiu"
  size?: number
  done?: boolean
  className?: string
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "")
  const hex = AVATAR_COLORS.find((c) => c.id === color)?.hex ?? AVATAR_COLORS[1].hex
  const html = avatarSvg({ shape: SHAPE[style], level, state: done ? "concluiu" : state, size, color: hex, eyes: avatarEyes(glyph) }, `dav${id}`)

  return (
    <span
      className={className}
      style={{ display: "inline-flex", width: size, height: size, flex: "none" }}
      title={name ? `${name} · nível ${level}` : undefined}
      // markup gerado aqui mesmo (avatar-svg.ts), sem nenhum texto de fora
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
