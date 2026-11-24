"use client"

import { supabaseBrowser } from "@/lib/supabase/client"
import { SANDBOX } from "@/lib/supabase/env"
import { safeFileName } from "@/lib/domain/content"
import { uid } from "@/lib/format"

/**
 * Arquivos dos contratos: bucket PRIVADO próprio (migration 0029), com as regras da área "contratos"
 * — separado do bucket de conteúdos, que todo membro lê.
 */
const BUCKET = "contratos"

/** A demonstração local (sem banco) não tem onde guardar arquivo. */
export const CONTRACT_FILES_AVAILABLE = !SANDBOX

function storageError(error: { message?: string }) {
  if (/row-level security|violates|permission/i.test(error.message ?? "")) return new Error("Você não tem permissão para anexar nesta área (ou atingiu o limite diário de envio).")
  if (/bucket not found/i.test(error.message ?? "")) return new Error("O espaço de arquivos dos contratos ainda não foi criado no banco (migration 0029).")
  return new Error("Não foi possível enviar o arquivo. Tente de novo.")
}

/** Sobe o arquivo e devolve o caminho no Storage. Nunca sobrescreve: versão nova = arquivo novo. */
export async function uploadContractFile(contractId: string, file: File) {
  const path = `${contractId.replace(/[^A-Za-z0-9-]/g, "_")}/${uid()}-${safeFileName(file.name)}`
  const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw storageError(error)
  return path
}

/** Link temporário (10 min) para abrir ou baixar. Expira sozinho: não adianta repassar. */
export async function signedContractUrl(path: string) {
  const { data, error } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(path, 10 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteContractFiles(paths: string[]) {
  if (!paths.length) return
  const { error } = await supabaseBrowser().storage.from(BUCKET).remove(paths)
  if (error) throw error
}
