/** Extrai o ID do vídeo do link colado na publicação. Função pura (testada). */
export function videoIdFromUrl(platform: "youtube" | "tiktok", raw: string | undefined): string | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, "")

  if (platform === "youtube") {
    const valid = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null)
    if (host === "youtu.be") return valid(url.pathname.split("/")[1])
    if (host === "youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") return valid(url.searchParams.get("v"))
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([^/?#]+)/)
      return valid(m?.[2])
    }
    return null
  }

  // TikTok: https://www.tiktok.com/@perfil/video/7234567890123456789
  if (host === "tiktok.com") {
    const m = url.pathname.match(/\/video\/(\d{8,25})/)
    return m?.[1] ?? null
  }
  return null
}
