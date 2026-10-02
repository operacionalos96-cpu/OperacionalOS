"use client"

import { supabaseBrowser } from "@/lib/supabase/client"
import { safeFileName, type AssetKind } from "@/lib/domain/content"
import { uid } from "@/lib/format"

/** Bucket privado criado em supabase/migrations/0002. Nada nele é público. */
const BUCKET = "conteudos"
/** Limite do plano Free do Supabase por arquivo. Acima disso, use link (Drive etc.). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const ALLOWED = /^(video|audio|image)\/|^application\/pdf$|^text\/plain$/

export function uploadProblem(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return `Arquivo com ${(file.size / 1024 / 1024).toFixed(0)} MB. O limite é 50 MB: para brutos grandes, cole o link do Drive.`
  if (!ALLOWED.test(file.type)) return "Tipo de arquivo não permitido (só vídeo, áudio, imagem, PDF ou texto)."
  return null
}

/** Erro do Storage em linguagem de gente (a cota diária vem da regra do banco, SQL 0009). */
function uploadError(error: { message?: string }) {
  if (/row-level security|violates/i.test(error.message ?? "")) return new Error("Limite diário de envio atingido (2 GB ou 300 arquivos por pessoa). Tente amanhã ou use um link.")
  return error
}

/** Sobe o arquivo e devolve o caminho no Storage. */
export async function uploadContentFile(itemId: string, kind: AssetKind, file: File) {
  const path = `itens/${itemId}/${kind}/${uid()}-${safeFileName(file.name)}`
  const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw uploadError(error)
  return path
}

/** Link temporário (1h) para ver/baixar. Expira sozinho: não adianta repassar. */
export async function signedContentUrl(path: string) {
  const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteContentFile(path: string) {
  const { error } = await supabaseBrowser().storage.from(BUCKET).remove([path])
  if (error) throw error
}

/** Anexo de QUALQUER entidade (contexto comum). Mesmo bucket privado, pasta própria. */
export async function uploadAttachment(entityType: string, entityId: string, file: File) {
  const path = `anexos/${entityType}/${entityId.replace(/[^A-Za-z0-9-]/g, "_")}/${uid()}-${safeFileName(file.name)}`
  const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw uploadError(error)
  return path
}
