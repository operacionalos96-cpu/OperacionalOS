import "server-only"
import { appUrl } from "./auth"

/**
 * Conectores das plataformas. Tudo roda no servidor: client secret e tokens
 * nunca vão ao navegador. Docs:
 *  - YouTube: OAuth do Google + YouTube Data API v3 (videos.list statistics)
 *  - TikTok: Login Kit v2 + /v2/video/query (escopo video.list)
 */
export type Provider = "youtube" | "tiktok"

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scopes?: string
}

export interface VideoStats {
  views: number
  likes: number
  comments: number
  /** undefined = a plataforma não informa (mantém o valor manual). */
  shares?: number
}

export function isProvider(p: string): p is Provider {
  return p === "youtube" || p === "tiktok"
}

export function redirectUri(p: Provider) {
  return `${appUrl()}/api/integracoes/${p}/callback`
}

function env(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} não configurada no servidor.`)
  return v
}

export function providerConfigured(p: Provider) {
  return p === "youtube" ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) : !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
}

// Escopos mínimos para esta etapa (ler perfil + estatísticas). Publicar entra depois.
const SCOPES: Record<Provider, string> = {
  youtube: "https://www.googleapis.com/auth/youtube.readonly",
  tiktok: "user.info.basic,video.list",
}

export function authorizeUrl(p: Provider, state: string) {
  if (p === "youtube") {
    const q = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri(p),
      response_type: "code",
      scope: SCOPES.youtube,
      access_type: "offline",
      prompt: "consent select_account",
      include_granted_scopes: "true",
      state,
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
  }
  const q = new URLSearchParams({
    client_key: env("TIKTOK_CLIENT_KEY"),
    redirect_uri: redirectUri(p),
    response_type: "code",
    scope: SCOPES.tiktok,
    state,
    disable_auto_auth: "1",
  })
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`
}

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    cache: "no-store",
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || json.error) throw new Error(`Falha no token (${res.status}): ${String(json.error_description ?? json.error ?? "erro")}`)
  return json
}

function toTokenSet(json: Record<string, unknown>, previousRefresh?: string): TokenSet {
  const expiresIn = Number(json.expires_in ?? 0)
  return {
    accessToken: String(json.access_token),
    // Google só manda refresh_token na primeira autorização; TikTok pode trocar o refresh (usar o novo).
    refreshToken: (json.refresh_token as string | undefined) ?? previousRefresh,
    expiresAt: expiresIn ? new Date(Date.now() + (expiresIn - 60) * 1000) : undefined,
    scopes: (json.scope as string | undefined) ?? undefined,
  }
}

export async function exchangeCode(p: Provider, code: string): Promise<TokenSet> {
  if (p === "youtube") {
    return toTokenSet(
      await postForm("https://oauth2.googleapis.com/token", {
        code,
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        redirect_uri: redirectUri(p),
        grant_type: "authorization_code",
      }),
    )
  }
  return toTokenSet(
    await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: env("TIKTOK_CLIENT_KEY"),
      client_secret: env("TIKTOK_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(p),
    }),
  )
}

export async function refreshTokens(p: Provider, refreshToken: string): Promise<TokenSet> {
  if (p === "youtube") {
    return toTokenSet(
      await postForm("https://oauth2.googleapis.com/token", {
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      refreshToken,
    )
  }
  return toTokenSet(
    await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
      client_key: env("TIKTOK_CLIENT_KEY"),
      client_secret: env("TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    refreshToken,
  )
}

async function getJson(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }, cache: "no-store" })
  const json = (await res.json().catch(() => ({}))) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!res.ok) throw new Error(`API ${res.status}: ${json?.error?.message ?? json?.error?.code ?? "erro"}`)
  return json
}

/** Quem conectou: canal do YouTube / perfil do TikTok. */
export async function fetchProfile(p: Provider, token: string): Promise<{ externalId: string; displayName: string }> {
  if (p === "youtube") {
    const json = await getJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", token)
    const ch = json.items?.[0]
    if (!ch) throw new Error("Esta conta Google não tem canal do YouTube.")
    return { externalId: ch.id, displayName: ch.snippet?.title ?? ch.id }
  }
  const json = await getJson("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", token)
  const user = json.data?.user
  if (!user?.open_id) throw new Error("Não foi possível ler o perfil do TikTok.")
  return { externalId: user.open_id, displayName: user.display_name ?? user.open_id }
}

/** Estatísticas por vídeo. YouTube: até 50 por chamada. TikTok: até 20 (só vídeos do próprio perfil). */
export async function fetchVideoStats(p: Provider, token: string, ids: string[]): Promise<Map<string, VideoStats>> {
  const out = new Map<string, VideoStats>()
  const size = p === "youtube" ? 50 : 20
  for (let i = 0; i < ids.length; i += size) {
    const batch = ids.slice(i, i + size)
    if (p === "youtube") {
      const json = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${batch.map(encodeURIComponent).join(",")}`, token)
      for (const v of json.items ?? []) {
        out.set(v.id, { views: Number(v.statistics?.viewCount ?? 0), likes: Number(v.statistics?.likeCount ?? 0), comments: Number(v.statistics?.commentCount ?? 0) })
      }
    } else {
      const json = await getJson("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: { video_ids: batch } }),
      })
      for (const v of json.data?.videos ?? []) {
        out.set(String(v.id), { views: Number(v.view_count ?? 0), likes: Number(v.like_count ?? 0), comments: Number(v.comment_count ?? 0), shares: Number(v.share_count ?? 0) })
      }
    }
  }
  return out
}
