import type { Note } from "./types"

/** Chave de comparação: sem acento, caixa ou espaços repetidos. "  Lançamento  HZK" ≡ "lancamento hzk". */
export function projectKey(name: string | undefined | null) {
  return (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR")
}

/** Nome limpo; se já existe um projeto equivalente, devolve a grafia existente (evita "Site" e "site" como projetos distintos). */
export function canonicalProjectName(name: string | undefined | null, existing: Iterable<string | undefined | null>): string | undefined {
  const clean = (name ?? "").replace(/\s+/g, " ").trim()
  if (!clean) return undefined
  const key = projectKey(clean)
  for (const e of existing) if (e && projectKey(e) === key) return e.replace(/\s+/g, " ").trim()
  return clean
}

/** Lista única (por chave), na grafia mais comum de entrada, ordenada em pt-BR. */
export function uniqueProjects(names: Iterable<string | undefined | null>) {
  const map = new Map<string, string>()
  for (const n of names) {
    const clean = (n ?? "").replace(/\s+/g, " ").trim()
    if (clean && !map.has(projectKey(clean))) map.set(projectKey(clean), clean)
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"))
}

/** Todas as tarefas ligadas a uma nota (campo antigo `taskId` + lista `taskIds`). */
export function noteTaskIds(n: Pick<Note, "taskId" | "taskIds">) {
  return [...new Set([...(n.taskIds ?? []), ...(n.taskId ? [n.taskId] : [])])]
}
