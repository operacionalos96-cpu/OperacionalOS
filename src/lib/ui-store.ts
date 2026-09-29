"use client"

import { create } from "zustand"
import type { Lead, Task, Transaction } from "@/lib/domain/types"
import type { NewLeadInput, NewTaskInput, NewTransactionInput } from "@/lib/store"

/**
 * Diálogos globais. Qualquer tela (Ctrl+K, Dashboard, Mapa) abre o mesmo
 * formulário — um único jeito de fazer cada coisa.
 */
interface UIState {
  paletteOpen: boolean
  leadForm: { prefill?: Partial<NewLeadInput>; onCreated?: (lead: Lead) => void } | null
  taskForm: { prefill?: Partial<NewTaskInput>; onCreated?: (task: Task) => void } | null
  txForm: { prefill?: Partial<NewTransactionInput>; onCreated?: (tx: Transaction) => void } | null
  /** Lead cuja próxima ação foi concluída e precisa de uma nova. */
  nextActionFor: string | null
  /** Lead recém-ganho: oferecer registrar a entrada no financeiro. */
  wonFor: string | null
  /** Lead indo para perdido: pedir motivo (opcional). */
  lostFor: string | null

  set(patch: Partial<Omit<UIState, "set">>): void
}

export const useUI = create<UIState>((set) => ({
  paletteOpen: false,
  leadForm: null,
  taskForm: null,
  txForm: null,
  nextActionFor: null,
  wonFor: null,
  lostFor: null,
  set: (patch) => set(patch),
}))

export const openLeadForm = (opts: UIState["leadForm"] = {}) => useUI.getState().set({ leadForm: opts })
export const openTaskForm = (opts: UIState["taskForm"] = {}) => useUI.getState().set({ taskForm: opts })
export const openTxForm = (opts: UIState["txForm"] = {}) => useUI.getState().set({ txForm: opts })
