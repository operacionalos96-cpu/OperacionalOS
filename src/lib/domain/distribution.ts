/**
 * Distribuição de leads entre os vendedores: metade para cada um.
 * Conta só leads ABERTOS (ganho/perdido já saíram da fila de abordagem).
 * Com produto, equilibra dentro daquele produto (cada campanha fica meio a meio).
 * Funções puras, testadas em distribution.test.ts.
 */
import type { Lead } from "./types"

const isOpen = (l: Lead) => l.stage !== "ganho" && l.stage !== "perdido"

export function openCounts(leads: Lead[], teamIds: string[], productId?: string) {
  const counts = new Map(teamIds.map((id) => [id, 0]))
  for (const l of leads) {
    if (!isOpen(l) || (productId !== undefined && l.productId !== productId)) continue
    if (counts.has(l.ownerId)) counts.set(l.ownerId, counts.get(l.ownerId)! + 1)
  }
  return counts
}

/** Próximo dono: quem tem menos leads abertos (empate → ordem da equipe). */
export function nextOwner(leads: Lead[], teamIds: string[], productId?: string) {
  const counts = openCounts(leads, teamIds, productId)
  return teamIds.reduce((best, id) => (counts.get(id)! < counts.get(best)! ? id : best), teamIds[0])
}

/**
 * Donos para N leads novos, continuando o equilíbrio atual.
 * Ex.: Igor 30, Gabriel 0, chegam 20 → os 20 vão para o Gabriel.
 */
export function distributeOwners(count: number, leads: Lead[], teamIds: string[], productId?: string) {
  const counts = openCounts(leads, teamIds, productId)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const id = teamIds.reduce((best, t) => (counts.get(t)! < counts.get(best)! ? t : best), teamIds[0])
    out.push(id)
    counts.set(id, counts.get(id)! + 1)
  }
  return out
}

/**
 * Reequilibra os leads abertos que ainda estão em "Novo" (ninguém abordou):
 * move de quem tem mais para quem tem menos até ficar meio a meio (diferença ≤ 1).
 * Leads já trabalhados (outros estágios) nunca trocam de dono.
 */
export function rebalance(leads: Lead[], teamIds: string[], productId?: string): { leadId: string; ownerId: string }[] {
  const counts = openCounts(leads, teamIds, productId)
  const movable = leads
    .filter((l) => l.stage === "novo" && (productId === undefined || l.productId === productId) && counts.has(l.ownerId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // mais novos primeiro
  const moves: { leadId: string; ownerId: string }[] = []
  for (;;) {
    const ids = [...counts.keys()]
    const max = ids.reduce((a, b) => (counts.get(b)! > counts.get(a)! ? b : a))
    const min = ids.reduce((a, b) => (counts.get(b)! < counts.get(a)! ? b : a))
    if (counts.get(max)! - counts.get(min)! <= 1) break
    const idx = movable.findIndex((l) => l.ownerId === max)
    if (idx < 0) break
    const [lead] = movable.splice(idx, 1)
    moves.push({ leadId: lead.id, ownerId: min })
    counts.set(max, counts.get(max)! - 1)
    counts.set(min, counts.get(min)! + 1)
  }
  return moves
}
