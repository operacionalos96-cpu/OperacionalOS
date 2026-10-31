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
  /** Captura rápida (HZK OS): aberta pelo "+" ou pelo Ctrl+K, com o tipo já escolhido. */
  capture: { kind?: "task" | "idea" | "decision" | "note"; title?: string } | null
  leadForm: { prefill?: Partial<NewLeadInput>; onCreated?: (lead: Lead) => void } | null
  taskForm: { prefill?: Partial<NewTaskInput>; onCreated?: (task: Task) => void } | null
  txForm: { prefill?: Partial<NewTransactionInput>; onCreated?: (tx: Transaction) => void } | null
  /** Lead cuja próxima ação foi concluída e precisa de uma nova. */
  nextActionFor: string | null
  /** Lead recém-ganho: oferecer registrar a entrada no financeiro. */
  wonFor: string | null
  /** Lead indo para perdido: pedir motivo (opcional). */
  lostFor: string | null
  /** Tarefa aberta no painel de detalhes. */
  taskDetail: string | null
  /** Modo foco (mapas): esconde a barra lateral para dar a tela toda ao quadro. */
  focusMode: boolean

  set(patch: Partial<Omit<UIState, "set">>): void
}

export const useUI = create<UIState>((set) => ({
  paletteOpen: false,
  capture: null,
  leadForm: null,
  taskForm: null,
  txForm: null,
  nextActionFor: null,
  wonFor: null,
  lostFor: null,
  taskDetail: null,
  focusMode: false,
  set: (patch) => set(patch),
}))

export const openTaskDetail = (id: string) => useUI.getState().set({ taskDetail: id })
export const openCapture = (opts: NonNullable<UIState["capture"]> = {}) => useUI.getState().set({ capture: opts })

export const openLeadForm = (opts: UIState["leadForm"] = {}) => useUI.getState().set({ leadForm: opts })
export const openTaskForm = (opts: UIState["taskForm"] = {}) => useUI.getState().set({ taskForm: opts })
export const openTxForm = (opts: UIState["txForm"] = {}) => useUI.getState().set({ txForm: opts })
