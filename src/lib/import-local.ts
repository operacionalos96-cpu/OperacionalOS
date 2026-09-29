"use client"

import { getRepositories } from "@/lib/repositories"
import { readLocalSnapshot } from "@/lib/repositories/local"

/** Quantos itens antigos existem neste navegador (null = nenhum). */
export function localSnapshotCounts() {
  const snap = readLocalSnapshot()
  if (!snap) return null
  return {
    leads: snap.leads.length,
    tasks: snap.tasks.length,
    transactions: snap.transactions.length,
    notes: snap.notes.length,
    mindMaps: snap.mindMaps.length,
  }
}

/** Envia os dados locais para o banco (upsert: não apaga nada). Retorna quantos itens foram enviados. */
export async function importLocalData() {
  const snap = readLocalSnapshot()
  if (!snap) return 0
  const r = getRepositories()
  const jobs: Promise<unknown>[] = [
    ...snap.leads.map((x) => r.leads.upsert(x)),
    ...snap.activities.map((x) => r.activities.upsert(x)),
    ...snap.tasks.map((x) => r.tasks.upsert(x)),
    ...snap.notes.map((x) => r.notes.upsert(x)),
    ...snap.transactions.map((x) => r.transactions.upsert(x)),
    ...snap.mindMaps.map((x) => r.mindMaps.upsert(x)),
  ]
  if (snap.financeSettings) jobs.push(r.financeSettings.save(snap.financeSettings))
  await Promise.all(jobs)
  return jobs.length
}
