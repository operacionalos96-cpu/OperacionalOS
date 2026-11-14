"use client"

import { useEffect, useId, useRef } from "react"
import { AVATAR_COLORS, avatarGlyph, type AvatarColor, type AvatarStyle } from "@/lib/domain/dock"
import type { AgentState } from "@/lib/domain/office"
import { avatarSvg } from "./avatar-svg"
import "./dock-avatar.css"

const STYLE_CODE: Record<AvatarStyle, "A" | "B" | "C"> = { saturno: "A", halo: "B", constelacao: "C" }

/**
 * Avatar de um bot do HZK Dock. Os anéis contam o nível de acesso (0–3) e o movimento conta o estado
 * (office-state/v1). `done` faz o momento "concluiu": os anéis se alinham na diagonal do Z por 1,2 s.
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
  const ref = useRef<HTMLSpanElement>(null)
  const hex = AVATAR_COLORS.find((c) => c.id === color)?.hex ?? AVATAR_COLORS[1].hex
  const html = avatarSvg({ v: STYLE_CODE[style], level, state, size, color: hex, glyph: size <= 20 ? "" : avatarGlyph(name, glyph) }, `dav${id}`)

  useEffect(() => {
    if (!done) return
    const svg = ref.current?.querySelector("svg")
    svg?.classList.add("done")
    const t = setTimeout(() => svg?.classList.remove("done"), 1300)
    return () => clearTimeout(t)
  }, [done])

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: "inline-flex", width: size, height: size, flex: "none" }}
      title={`${name} · nível ${level}`}
      // markup gerado aqui mesmo (avatar-svg.ts); o único texto de fora, o glifo, é escapado
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
