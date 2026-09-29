import "server-only"
import type { ContentAccount, ContentItem } from "@/lib/domain/content"
import { videoIdFromUrl } from "@/lib/integrations/video-id"
import { decrypt, encrypt } from "./crypto"
import { fetchVideoStats, refreshTokens, type Provider, type TokenSet } from "./providers"
import { supabaseAdmin } from "./supabase-admin"

/** Salva/atualiza a conexão de uma conta de conteúdo. Tokens vão criptografados. */
export async function saveConnection(input: {
  accountId: string
  platform: Provider
  externalId: string
  displayName: string
  tokens: TokenSet
  userId: string
}) {
  const db = supabaseAdmin()
  const { error } = await db.from("integration_accounts").upsert({
    id: input.accountId,
    platform: input.platform,
    external_id: input.externalId,
    display_name: input.displayName,
    scopes: input.tokens.scopes ?? null,
    status: "ativo",
    connected_by: input.userId,
    connected_at: new Date().toISOString(),
    last_sync_error: null,
  })
  if (error) throw error
  const { error: secretError } = await db.from("integration_secrets").upsert({
    account_id: input.accountId,
    access_token_enc: encrypt(input.tokens.accessToken),
    refresh_token_enc: input.tokens.refreshToken ? encrypt(input.tokens.refreshToken) : null,
    expires_at: input.tokens.expiresAt?.toISOString() ?? null,
    updated_at: new Date().toISOString(),
  })
  if (secretError) throw secretError
}

export async function removeConnection(accountId: string) {
  const { error } = await supabaseAdmin().from("integration_accounts").delete().eq("id", accountId)
  if (error) throw error
}

/** Token válido para a conta; renova sozinho se venceu (e grava o novo). */
async function validToken(accountId: string, platform: Provider) {
  const db = supabaseAdmin()
  const { data, error } = await db.from("integration_secrets").select("*").eq("account_id", accountId).maybeSingle()
  if (error || !data) throw new Error("Conexão sem token. Conecte a conta de novo.")
  const expired = data.expires_at && new Date(data.expires_at).getTime() < Date.now()
  if (!expired) return decrypt(data.access_token_enc)
  if (!data.refresh_token_enc) throw new Error("Acesso expirou. Conecte a conta de novo.")
  const fresh = await refreshTokens(platform, decrypt(data.refresh_token_enc))
  await db
    .from("integration_secrets")
    .update({
      access_token_enc: encrypt(fresh.accessToken),
      refresh_token_enc: fresh.refreshToken ? encrypt(fresh.refreshToken) : data.refresh_token_enc,
      expires_at: fresh.expiresAt?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId)
  return fresh.accessToken
}

/**
 * Atualiza as métricas de todas as publicações com link, em contas conectadas.
 * Só mexe em views/curtidas/comentários (e compartilhamentos no TikTok); salvos
 * e o resto digitado à mão são preservados.
 */
export async function syncAllMetrics() {
  const db = supabaseAdmin()
  const [{ data: connections }, { data: accountRows }, { data: itemRows }] = await Promise.all([
    db.from("integration_accounts").select("id, platform"),
    db.from("content_accounts").select("data"),
    db.from("content_items").select("data"),
  ])
  const accounts = new Map((accountRows ?? []).map((r) => [(r.data as ContentAccount).id, r.data as ContentAccount]))
  const items = (itemRows ?? []).map((r) => r.data as ContentItem)
  const result = { updated: 0, accounts: 0, errors: [] as string[] }
  const changed = new Set<ContentItem>()

  for (const conn of connections ?? []) {
    const platform = conn.platform as Provider
    const account = accounts.get(conn.id)
    // Posts desta conta com link de vídeo reconhecível.
    const targets: { item: ContentItem; postId: string; videoId: string }[] = []
    for (const item of items)
      for (const post of item.posts)
        if (post.accountId === conn.id && post.status === "publicado") {
          const videoId = post.externalId ?? videoIdFromUrl(platform, post.url)
          if (videoId) targets.push({ item, postId: post.id, videoId })
        }
    if (!targets.length) continue

    try {
      const token = await validToken(conn.id, platform)
      const stats = await fetchVideoStats(platform, token, [...new Set(targets.map((t) => t.videoId))])
      const now = new Date().toISOString()
      for (const t of targets) {
        const s = stats.get(t.videoId)
        if (!s) continue
        t.item.posts = t.item.posts.map((p) =>
          p.id === t.postId
            ? {
                ...p,
                source: "api",
                externalId: t.videoId,
                metricsAt: now,
                metrics: {
                  views: s.views,
                  likes: s.likes,
                  comments: s.comments,
                  shares: s.shares ?? p.metrics?.shares ?? 0,
                  saves: p.metrics?.saves ?? 0,
                },
              }
            : p,
        )
        changed.add(t.item)
        result.updated++
      }
      await db.from("integration_accounts").update({ last_sync_at: now, last_sync_error: null, status: "ativo" }).eq("id", conn.id)
      result.accounts++
    } catch (e) {
      const message = e instanceof Error ? e.message : "erro"
      result.errors.push(`${account?.name ?? conn.id}: ${message}`)
      await db
        .from("integration_accounts")
        .update({ last_sync_error: message.slice(0, 300), status: /expir|Conecte/i.test(message) ? "expirado" : "ativo" })
        .eq("id", conn.id)
    }
  }

  // Grava cada conteúdo alterado uma vez (o tempo real avisa as telas abertas).
  for (const item of changed) {
    await db.from("content_items").upsert({ id: item.id, data: { ...item, updatedAt: new Date().toISOString() } })
  }
  return result
}
