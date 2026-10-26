/**
 * Conteúdos: contas por plataforma (principal + contas de cortes), produção de
 * cada vídeo em etapas, arquivos por etapa e publicações com métricas.
 * Pensado para, depois, publicar e puxar métricas via API de cada plataforma:
 * `ContentPost.externalId` e `source` já existem para isso (ver docs/ARQUITETURA.md).
 */
import type { ISODate } from "./types"

export type Platform = "youtube" | "instagram" | "tiktok" | "kwai" | "facebook" | "x" | "linkedin" | "outro"

export const PLATFORMS: { id: Platform; label: string }[] = [
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "kwai", label: "Kwai" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "outro", label: "Outra" },
]

export type AccountRole = "principal" | "cortes"

export interface ContentAccount {
  id: string
  name: string
  /** Frente/marca organizacional; string livre para permitir novas contas no futuro. */
  brand?: string
  handle?: string
  platform: Platform
  role: AccountRole
  /** Conta de cortes pendurada numa conta principal (subdivisão). */
  parentId?: string
  productId?: string
  url?: string
  active: boolean
  createdAt: ISODate
  updatedAt?: ISODate
}

export type ContentStage = "ideia" | "roteiro" | "gravacao" | "edicao" | "revisao" | "pronto" | "publicado"

export const CONTENT_STAGES: { id: ContentStage; label: string; hint: string }[] = [
  { id: "ideia", label: "Ideia", hint: "Pauta anotada" },
  { id: "roteiro", label: "Roteiro", hint: "Escrevendo o roteiro" },
  { id: "gravacao", label: "Gravação", hint: "Gravar / subir o bruto" },
  { id: "edicao", label: "Edição", hint: "Editando" },
  { id: "revisao", label: "Revisão", hint: "Conferir antes de postar" },
  { id: "pronto", label: "Pronto p/ postar", hint: "Versão final aprovada" },
  { id: "publicado", label: "Publicado", hint: "No ar" },
]

export type ContentFormat = "video_longo" | "short" | "reels" | "carrossel" | "live" | "outro"

export const CONTENT_FORMATS: { id: ContentFormat; label: string }[] = [
  { id: "video_longo", label: "Vídeo longo" },
  { id: "short", label: "Short / vertical" },
  { id: "reels", label: "Reels" },
  { id: "carrossel", label: "Carrossel" },
  { id: "live", label: "Live" },
  { id: "outro", label: "Outro" },
]

/** Uma versão do arquivo por etapa: bruto → editado → revisado → final (para post). */
export type AssetKind = "bruto" | "editado" | "revisado" | "final"

export const ASSET_KINDS: { id: AssetKind; label: string; hint: string }[] = [
  { id: "bruto", label: "Bruto", hint: "Gravação original" },
  { id: "editado", label: "Editado", hint: "Primeira edição" },
  { id: "revisado", label: "Revisado", hint: "Com ajustes da revisão" },
  { id: "final", label: "Final (para post)", hint: "Versão aprovada" },
]

export interface ContentAsset {
  id: string
  kind: AssetKind
  name: string
  /** Arquivo no Storage do Supabase (bucket privado "conteudos"). */
  storagePath?: string
  /** Ou link externo (Drive, Frame.io…), útil para arquivos muito grandes. */
  url?: string
  sizeBytes?: number
  uploadedAt: ISODate
  uploadedBy: string
}

export interface PostMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
}

export interface ContentPost {
  id: string
  accountId: string
  status: "planejado" | "publicado"
  url?: string
  publishedAt?: ISODate
  metrics?: PostMetrics
  metricsAt?: ISODate
  /** "manual" hoje; "api" quando a integração da plataforma estiver ligada. */
  source: "manual" | "api"
  externalId?: string
}

export interface ContentItem {
  id: string
  title: string
  format: ContentFormat
  stage: ContentStage
  productId?: string
  /** Frente responsável pelo conteúdo (ex.: HZK, Gabriel); não fixa a lista de frentes. */
  brand?: string
  /** Conta principal sugerida para publicação. Publicações podem ir a várias contas. */
  accountId?: string
  ownerId: string
  dueDate?: ISODate
  script?: string
  notes?: string
  assets: ContentAsset[]
  posts: ContentPost[]
  createdAt: ISODate
  updatedAt?: ISODate
}

export const EMPTY_METRICS: PostMetrics = { views: 0, likes: 0, comments: 0, shares: 0, saves: 0 }

export function sumMetrics(list: (PostMetrics | undefined)[]): PostMetrics {
  return list.reduce<PostMetrics>(
    (acc, m) =>
      m
        ? { views: acc.views + m.views, likes: acc.likes + m.likes, comments: acc.comments + m.comments, shares: acc.shares + m.shares, saves: acc.saves + m.saves }
        : acc,
    { ...EMPTY_METRICS },
  )
}

/** Engajamento = (curtidas + comentários + compartilhamentos + salvos) ÷ visualizações. */
export function engagementRate(m: PostMetrics) {
  return m.views ? (m.likes + m.comments + m.shares + m.saves) / m.views : null
}

/** Métricas somadas por conta (só publicações com métricas). */
export function metricsByAccount(items: ContentItem[]) {
  const map = new Map<string, { posts: number; metrics: PostMetrics }>()
  for (const item of items) {
    for (const post of item.posts) {
      if (post.status !== "publicado") continue
      const cur = map.get(post.accountId) ?? { posts: 0, metrics: { ...EMPTY_METRICS } }
      map.set(post.accountId, { posts: cur.posts + 1, metrics: sumMetrics([cur.metrics, post.metrics]) })
    }
  }
  return map
}

/** Organiza as contas: cada principal com suas contas de cortes; cortes sem principal ficam soltas. */
export function accountTree(accounts: ContentAccount[]) {
  const principals = accounts.filter((a) => a.role === "principal")
  const ids = new Set(principals.map((p) => p.id))
  return {
    groups: principals.map((p) => ({ principal: p, cuts: accounts.filter((a) => a.role === "cortes" && a.parentId === p.id) })),
    orphanCuts: accounts.filter((a) => a.role === "cortes" && (!a.parentId || !ids.has(a.parentId))),
  }
}

/** Nome de arquivo seguro para o Storage (sem acentos, espaços ou "../"). */
export function safeFileName(name: string) {
  const base = name.normalize("NFD").replace(/[̀-ͯ]/g, "")
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "")
  return (clean || "arquivo").slice(-120)
}
