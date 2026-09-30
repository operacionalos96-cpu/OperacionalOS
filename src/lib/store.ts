"use client"

import { create } from "zustand"
import { toast } from "sonner"
import { TEAM } from "@/config/team"
import { isOpenStage, stageLabel } from "@/lib/domain/constants"
import { nextOccurrence } from "@/lib/domain/rules"
import type {
  Activity,
  ActivityKind,
  ChecklistItem,
  FinanceSettings,
  Lead,
  MindMap,
  NextAction,
  Note,
  Priority,
  Recurrence,
  Stage,
  Task,
  Temperature,
  Transaction,
} from "@/lib/domain/types"
import { uid } from "@/lib/format"
import { templateMap, type TemplateId } from "@/lib/mindmap-templates"
import { getRepositories } from "@/lib/repositories"
import { TABLES, subscribeToChanges } from "@/lib/repositories/supabase"
import { supabaseBrowser } from "@/lib/supabase/client"
import { registeredCollections } from "@/lib/collection-store"
import "@/lib/modules"

/** Falhas de persistência não travam a UI, mas o usuário é avisado. */
function persist(p: Promise<unknown>) {
  p.catch(() => toast.error("Não foi possível salvar. Tente de novo."))
}

const nowIso = () => new Date().toISOString()

export interface NewLeadInput {
  name: string
  company?: string
  contact?: string
  valueCents: number
  ownerId: string
  stage?: Stage
  temperature?: Temperature
  nextAction: NextAction
  productId?: string
  website?: string
}

export interface NewTaskInput {
  title: string
  ownerId: string
  dueDate?: string
  leadId?: string
  priority?: Priority
  labels?: string[]
  description?: string
  checklist?: ChecklistItem[]
  recurrence?: Recurrence
  collaborators?: string[]
}

export type NewTransactionInput = Omit<Transaction, "id" | "createdById">

/** "negado" = logou, mas o e-mail não está na lista de membros do banco. */
export type Access = "verificando" | "ok" | "negado" | "erro"

interface State {
  hydrated: boolean
  access: Access
  /** Vem do login (tabela members), nunca de escolha na tela. */
  meId: string
  meEmail: string
  leads: Lead[]
  activities: Activity[]
  tasks: Task[]
  notes: Note[]
  transactions: Transaction[]
  mindMaps: MindMap[]
  financeSettings: FinanceSettings

  hydrate(): Promise<void>
  signOut(): Promise<void>

  createLead(input: NewLeadInput): Lead
  updateLead(id: string, patch: Partial<Omit<Lead, "id">>): void
  moveLead(id: string, stage: Stage, extra?: { lostReason?: string }): void
  completeNextAction(id: string, next?: NextAction): void
  logInteraction(leadId: string, kind: ActivityKind, text: string): void
  deleteLead(id: string): void
  restoreLead(lead: Lead, activities: Activity[]): void

  createTask(input: NewTaskInput): Task
  updateTask(id: string, patch: Partial<Omit<Task, "id">>): void
  /** Retorna a próxima ocorrência criada, se a tarefa for recorrente. */
  toggleTask(id: string): Task | undefined
  deleteTask(id: string): void
  restoreTask(task: Task): void

  createNote(): Note
  updateNote(id: string, patch: Partial<Pick<Note, "title" | "body">>): void
  deleteNote(id: string): void
  restoreNote(note: Note): void

  createTransaction(input: NewTransactionInput): Transaction
  deleteTransaction(id: string): void
  restoreTransaction(tx: Transaction): void
  setMonthlyGoal(monthKey: string, cents: number): void
  setOpeningBalance(cents: number): void

  createMap(template: TemplateId): MindMap
  saveMap(map: MindMap): void
  renameMap(id: string, title: string): void
  deleteMap(id: string): void
  restoreMap(map: MindMap): void
}

export const useStore = create<State>((set, get) => {
  const repos = () => getRepositories()

  /** Registra atividade no lead e marca o lead como "mexido" agora. */
  const addActivity = (leadId: string, kind: ActivityKind, text: string) => {
    const activity: Activity = { id: uid(), leadId, kind, text, authorId: get().meId, createdAt: nowIso() }
    set((s) => ({ activities: [...s.activities, activity] }))
    persist(repos().activities.upsert(activity))
    touchLead(leadId)
  }

  const touchLead = (leadId: string) => {
    const lead = get().leads.find((l) => l.id === leadId)
    if (lead) saveLead({ ...lead, lastActivityAt: nowIso() })
  }

  const saveLead = (lead: Lead) => {
    set((s) => ({ leads: s.leads.map((l) => (l.id === lead.id ? lead : l)) }))
    persist(repos().leads.upsert(lead))
  }

  const saveTask = (task: Task) => {
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) }))
    persist(repos().tasks.upsert(task))
  }

  return {
    hydrated: false,
    access: "verificando",
    meId: TEAM[0].id,
    meEmail: "",
    leads: [],
    activities: [],
    tasks: [],
    notes: [],
    transactions: [],
    mindMaps: [],
    financeSettings: { openingBalanceCents: 0, monthlyGoals: {} },

    async hydrate() {
      if (get().hydrated) return
      const sb = supabaseBrowser()
      const { data: auth, error: authError } = await sb.auth.getUser()
      if (!auth.user) {
        // Sem sessão → login. Falha de rede → tela "sem conexão" (não derruba a sessão).
        if (authError && authError.name !== "AuthSessionMissingError" && authError.status !== 401 && authError.status !== 403) {
          set({ access: "erro" })
          return
        }
        window.location.href = "/login"
        return
      }
      // O banco só devolve a linha se o e-mail estiver autorizado (RLS).
      const { data: member, error: memberError } = await sb.from("members").select("team_id").maybeSingle()
      if (memberError) {
        set({ access: "erro" })
        return
      }
      if (!member || !TEAM.some((u) => u.id === member.team_id)) {
        set({ access: "negado", meEmail: auth.user.email ?? "" })
        await sb.auth.signOut()
        return
      }
      try {
        const r = repos()
        const [leads, activities, tasks, notes, transactions, mindMaps, financeSettings] = await Promise.all([
          r.leads.list(),
          r.activities.list(),
          r.tasks.list(),
          r.notes.list(),
          r.transactions.list(),
          r.mindMaps.list(),
          r.financeSettings.get(),
        ])
        // Coleções dos módulos (Produtos, Conteúdos, …) carregam em paralelo. Se a tabela
        // de um módulo ainda não existir no banco, só aquele módulo fica vazio (o resto abre).
        const modules = await Promise.allSettled([...registeredCollections().values()].map((c) => c.getState().load()))
        if (modules.some((r) => r.status === "rejected")) {
          toast.warning("Algum módulo não carregou", { description: "Rode o SQL mais recente de supabase/migrations no Supabase." })
        }
        set({
          hydrated: true,
          access: "ok",
          meId: member.team_id,
          meEmail: auth.user.email ?? "",
          leads,
          activities,
          tasks,
          notes,
          transactions,
          mindMaps,
          financeSettings,
        })
      } catch {
        set({ access: "erro" })
        return
      }
      selfUserId = auth.user.id
      startRealtime()
    },

    async signOut() {
      stopRealtime?.()
      stopRealtime = null
      await supabaseBrowser().auth.signOut()
      window.location.href = "/login"
    },

    // ---------- leads ----------

    createLead(input) {
      const now = nowIso()
      const lead: Lead = {
        id: uid(),
        name: input.name.trim(),
        company: input.company?.trim() || undefined,
        contact: input.contact?.trim() || undefined,
        stage: input.stage ?? "novo",
        ownerId: input.ownerId,
        valueCents: input.valueCents,
        temperature: input.temperature,
        productId: input.productId,
        website: input.website,
        nextAction: { text: input.nextAction.text.trim(), dueDate: input.nextAction.dueDate },
        lastActivityAt: now,
        createdAt: now,
      }
      set((s) => ({ leads: [...s.leads, lead] }))
      persist(repos().leads.upsert(lead))
      addActivity(lead.id, "criado", "Lead criado")
      return lead
    },

    updateLead(id, patch) {
      const lead = get().leads.find((l) => l.id === id)
      if (!lead) return
      if (patch.ownerId && patch.ownerId !== lead.ownerId) {
        const owner = TEAM.find((u) => u.id === patch.ownerId)
        saveLead({ ...lead, ...patch })
        addActivity(id, "nota", `Responsável alterado para ${owner?.name}`)
        return
      }
      saveLead({ ...lead, ...patch })
    },

    moveLead(id, stage, extra) {
      const lead = get().leads.find((l) => l.id === id)
      if (!lead || lead.stage === stage) return
      const closing = !isOpenStage(stage)
      saveLead({
        ...lead,
        stage,
        closedAt: closing ? nowIso() : undefined,
        lostReason: stage === "perdido" ? extra?.lostReason || undefined : undefined,
      })
      const reason = stage === "perdido" && extra?.lostReason ? ` — ${extra.lostReason}` : ""
      addActivity(id, "estagio", `${stageLabel(lead.stage)} → ${stageLabel(stage)}${reason}`)
    },

    completeNextAction(id, next) {
      const lead = get().leads.find((l) => l.id === id)
      if (!lead) return
      addActivity(id, "acao_concluida", lead.nextAction.text)
      if (next) {
        const fresh = get().leads.find((l) => l.id === id)!
        saveLead({ ...fresh, nextAction: { text: next.text.trim(), dueDate: next.dueDate } })
      }
    },

    logInteraction(leadId, kind, text) {
      addActivity(leadId, kind, text.trim())
    },

    // Tarefas vinculadas mantêm o leadId; a UI ignora vínculos para leads inexistentes
    // (assim o "Desfazer" restaura tudo sem perda).
    deleteLead(id) {
      const removed = get().activities.filter((a) => a.leadId === id)
      set((s) => ({
        leads: s.leads.filter((l) => l.id !== id),
        activities: s.activities.filter((a) => a.leadId !== id),
      }))
      persist(Promise.all([repos().leads.remove(id), ...removed.map((a) => repos().activities.remove(a.id))]))
    },

    restoreLead(lead, activities) {
      set((s) => ({ leads: [...s.leads, lead], activities: [...s.activities, ...activities] }))
      persist(Promise.all([repos().leads.upsert(lead), ...activities.map((a) => repos().activities.upsert(a))]))
    },

    // ---------- tarefas ----------

    createTask(input) {
      const task: Task = {
        id: uid(),
        title: input.title.trim(),
        ownerId: input.ownerId,
        dueDate: input.dueDate,
        leadId: input.leadId,
        done: false,
        createdAt: nowIso(),
        priority: input.priority,
        labels: input.labels?.length ? input.labels : undefined,
        description: input.description?.trim() || undefined,
        checklist: input.checklist?.length ? input.checklist : undefined,
        recurrence: input.recurrence,
        collaborators: input.collaborators?.filter((id) => id !== input.ownerId).length ? input.collaborators.filter((id) => id !== input.ownerId) : undefined,
      }
      set((s) => ({ tasks: [...s.tasks, task] }))
      persist(repos().tasks.upsert(task))
      return task
    },

    updateTask(id, patch) {
      const task = get().tasks.find((t) => t.id === id)
      if (task) saveTask({ ...task, ...patch })
    },

    toggleTask(id) {
      const task = get().tasks.find((t) => t.id === id)
      if (!task) return
      const done = !task.done
      saveTask({ ...task, done, doneAt: done ? nowIso() : undefined })
      if (done && task.leadId) addActivity(task.leadId, "acao_concluida", `Tarefa: ${task.title}`)
      if (!done || !task.recurrence) return
      // Recorrente: a próxima nasce com o checklist zerado e o mesmo resto.
      return get().createTask({
        ...task,
        dueDate: nextOccurrence(task.dueDate, task.recurrence, new Date()),
        checklist: task.checklist?.map((i) => ({ ...i, id: uid(), done: false })),
      })
    },

    deleteTask(id) {
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
      persist(repos().tasks.remove(id))
    },

    restoreTask(task) {
      set((s) => ({ tasks: [...s.tasks, task] }))
      persist(repos().tasks.upsert(task))
    },

    // ---------- notas ----------

    createNote() {
      const note: Note = { id: uid(), title: "", body: "", authorId: get().meId, updatedAt: nowIso() }
      set((s) => ({ notes: [...s.notes, note] }))
      persist(repos().notes.upsert(note))
      return note
    },

    updateNote(id, patch) {
      const note = get().notes.find((n) => n.id === id)
      if (!note) return
      const updated = { ...note, ...patch, updatedAt: nowIso() }
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? updated : n)) }))
      persist(repos().notes.upsert(updated))
    },

    deleteNote(id) {
      set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }))
      persist(repos().notes.remove(id))
    },

    restoreNote(note) {
      set((s) => ({ notes: [...s.notes, note] }))
      persist(repos().notes.upsert(note))
    },

    // ---------- financeiro ----------

    createTransaction(input) {
      const tx: Transaction = { ...input, id: uid(), createdById: get().meId }
      set((s) => ({ transactions: [...s.transactions, tx] }))
      persist(repos().transactions.upsert(tx))
      return tx
    },

    deleteTransaction(id) {
      set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) }))
      persist(repos().transactions.remove(id))
    },

    restoreTransaction(tx) {
      set((s) => ({ transactions: [...s.transactions, tx] }))
      persist(repos().transactions.upsert(tx))
    },

    setMonthlyGoal(monthKey, cents) {
      const financeSettings = {
        ...get().financeSettings,
        monthlyGoals: { ...get().financeSettings.monthlyGoals, [monthKey]: cents },
      }
      set({ financeSettings })
      persist(repos().financeSettings.save(financeSettings))
    },

    setOpeningBalance(cents) {
      const financeSettings = { ...get().financeSettings, openingBalanceCents: cents }
      set({ financeSettings })
      persist(repos().financeSettings.save(financeSettings))
    },

    // ---------- mapas ----------

    createMap(template) {
      const map = templateMap(template)
      set((s) => ({ mindMaps: [...s.mindMaps, map] }))
      persist(repos().mindMaps.upsert(map))
      return map
    },

    saveMap(map) {
      const updated = { ...map, updatedAt: nowIso() }
      set((s) => ({ mindMaps: s.mindMaps.map((m) => (m.id === map.id ? updated : m)) }))
      persist(repos().mindMaps.upsert(updated))
    },

    renameMap(id, title) {
      const map = get().mindMaps.find((m) => m.id === id)
      if (map) get().saveMap({ ...map, title })
    },

    deleteMap(id) {
      set((s) => ({ mindMaps: s.mindMaps.filter((m) => m.id !== id) }))
      persist(repos().mindMaps.remove(id))
    },

    restoreMap(map) {
      set((s) => ({ mindMaps: [...s.mindMaps, map] }))
      persist(repos().mindMaps.upsert(map))
    },
  }
})

// ---------- tempo real ----------

type CollectionKey = "leads" | "activities" | "tasks" | "notes" | "transactions" | "mindMaps"
const TABLE_TO_KEY = Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [t, k])) as Record<string, CollectionKey>

let stopRealtime: (() => void) | null = null
/** Id do usuário logado: eventos com updated_by igual a ele são eco das próprias gravações. */
let selfUserId: string | null = null

/**
 * Aplica no estado local o que o sócio mudou. Aplica item a item (não recarrega
 * tudo), então não atrapalha quem está digitando. Eventos das próprias
 * gravações chegam iguais e não mudam nada.
 */
function startRealtime() {
  if (stopRealtime) return
  stopRealtime = subscribeToChanges((payload) => {
    const { table, eventType } = payload
    // O estado local já é o mais novo; aplicar o eco atrasado desfaria o que acabou de ser digitado.
    if (eventType !== "DELETE" && selfUserId && (payload.new as { updated_by?: string }).updated_by === selfUserId) return
    const moduleCollection = registeredCollections().get(table)
    if (moduleCollection) {
      moduleCollection.getState().applyRemote(eventType, (eventType === "DELETE" ? payload.old : payload.new) as { id?: string })
      return
    }
    if (table === "finance_settings") {
      if (payload.new && "data" in payload.new) useStore.setState({ financeSettings: payload.new.data as FinanceSettings })
      return
    }
    const key = TABLE_TO_KEY[table]
    if (!key) return
    useStore.setState((s) => {
      const list = s[key] as { id: string }[]
      if (eventType === "DELETE") {
        const id = (payload.old as { id?: string }).id
        return { [key]: list.filter((x) => x.id !== id) } as Partial<State>
      }
      const item = (payload.new as { data?: { id: string } }).data
      if (!item) return {}
      const exists = list.some((x) => x.id === item.id)
      return { [key]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] } as Partial<State>
    })
  })
}

/** Atalho para o usuário atual. */
export function useMe() {
  return useStore((s) => s.meId)
}
