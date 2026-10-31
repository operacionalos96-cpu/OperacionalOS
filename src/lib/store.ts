"use client"

import { create } from "zustand"
import { toast } from "sonner"
import { TEAM, syncTeamMembers } from "@/config/team"
import { isOpenStage, stageLabel } from "@/lib/domain/constants"
import { isWorkTask } from "@/lib/domain/items"
import { isRealizedTransaction, nextOccurrence, planSettlement } from "@/lib/domain/rules"
import type { OrgMember, RoleLevel } from "@/lib/domain/org"
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
import { boardTemplate, type BoardTemplateId } from "@/lib/board-templates"
import type { BoardMode } from "@/lib/domain/board"
import { getRepositories } from "@/lib/repositories"
import { TABLES, subscribeToChanges } from "@/lib/repositories/supabase"
import { supabaseBrowser } from "@/lib/supabase/client"
import { registeredCollections } from "@/lib/collection-store"
import { canonicalProjectName } from "@/lib/domain/project-names"
import { emit } from "@/lib/events"
import { recordEvent } from "@/lib/event-service"
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
  segment?: string
  city?: string
  source?: string
  analysis?: Lead["analysis"]
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
  seriesId?: string
  projectName?: string
  /** HZK OS (src/lib/domain/items.ts): área, estimativa e quem criou. */
  areaId?: string
  estimateMin?: number
  plannedFor?: string
  createdById?: string
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
  meRoleLevel: RoleLevel
  orgMembers: OrgMember[]
  leads: Lead[]
  activities: Activity[]
  /** Tarefas de trabalho já triadas (o que as telas de tarefas, a Início e as metas usam). */
  tasks: Task[]
  /**
   * Demais itens da mesma tabela (HZK OS): caixa de entrada, ideias, decisões, notas rápidas e
   * arquivados. Separados para que nenhuma tela de tarefas mude de comportamento.
   */
  items: Task[]
  notes: Note[]
  transactions: Transaction[]
  mindMaps: MindMap[]
  financeSettings: FinanceSettings

  hydrate(): Promise<void>
  refreshOrgMembers(): Promise<void>
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

  /** Captura rápida e itens de qualquer tipo (ideia, decisão, nota). */
  createItem(item: Task): Task
  /** Atualiza qualquer item; se mudar de tipo (triagem), ele troca de lista sozinho. */
  updateItem(id: string, patch: Partial<Omit<Task, "id">>): void

  createNote(): Note
  updateNote(id: string, patch: Partial<Pick<Note, "title" | "body" | "taskId" | "taskIds" | "projectName">>): void
  deleteNote(id: string): void
  restoreNote(note: Note): void

  createTransaction(input: NewTransactionInput): Transaction
  updateTransaction(id: string, patch: Partial<Omit<Transaction, "id" | "createdById">>): void
  /** Baixa um compromisso previsto na data real; se o valor for menor, registra pagamento parcial e mantém o restante em aberto. */
  settleTransaction(id: string, input: { date: string; amountCents?: number }): void
  deleteTransaction(id: string): void
  restoreTransaction(tx: Transaction): void
  setMonthlyGoal(monthKey: string, cents: number): void
  setOpeningBalance(cents: number): void
  /** HZK OS: gasto acima deste valor vai para a CEO (null = sem limite definido). */
  setCeoLimit(cents: number | null): void

  createMap(template: TemplateId | BoardTemplateId): MindMap
  /** Mapa novo a partir de elementos prontos (importar arquivo, duplicar). Ids dos elementos são mantidos. */
  createMapFrom(input: { title: string; mode: BoardMode; nodes: MindMap["nodes"]; edges: MindMap["edges"] }): MindMap
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

  /** Projetos já usados em tarefas, notas e lançamentos — base para não duplicar "Site"/"site". */
  const knownProjects = () => [
    ...get().tasks.map((t) => t.projectName),
    ...get().notes.map((n) => n.projectName),
    ...get().transactions.map((t) => t.projectName),
  ]
  const canon = (name: string | undefined | null) => canonicalProjectName(name, knownProjects())

  const saveTask = (task: Task) => {
    task = { ...task, projectName: canon(task.projectName) }
    set((s) => placeItem(s, task))
    persist(repos().tasks.upsert(task))
  }

  return {
    hydrated: false,
    access: "verificando",
    meId: TEAM[0].id,
    meEmail: "",
    meRoleLevel: "owner",
    orgMembers: [],
    leads: [],
    activities: [],
    tasks: [],
    items: [],
    notes: [],
    transactions: [],
    mindMaps: [],
    financeSettings: { openingBalanceCents: 0, monthlyGoals: {} },

    async refreshOrgMembers() {
      const sb = supabaseBrowser()
      const { data: rawMembers } = await sb.from("members").select("*")
      if (rawMembers) {
        const orgMembers: OrgMember[] = rawMembers.map((m: Record<string, unknown>) => ({
          email: String(m.email ?? ""),
          teamId: String(m.team_id ?? ""),
          displayName: m.display_name ? String(m.display_name) : undefined,
          avatarUrl: m.avatar_url ? String(m.avatar_url) : undefined,
          roleLevel: (m.role_level as RoleLevel) || "operator",
          active: m.active !== false,
          joinedAt: String(m.joined_at ?? m.created_at ?? nowIso()),
        }))
        syncTeamMembers(orgMembers)
        set({ orgMembers })
      }
    },

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
      // Resolve o membro autenticado explicitamente. Sem o filtro, `maybeSingle()` falha
      // quando a política RLS permite enxergar mais de um membro da equipe.
      const authenticatedEmail = auth.user.email?.trim()
      if (!authenticatedEmail) {
        set({ access: "negado", meEmail: "" })
        await sb.auth.signOut()
        return
      }
      const { data: member, error: memberError } = await sb
        .from("members")
        .select("*")
        .ilike("email", authenticatedEmail)
        .maybeSingle()
      if (memberError) {
        set({ access: "erro" })
        return
      }
      if (!member || member.active === false) {
        set({ access: "negado", meEmail: auth.user.email ?? "" })
        await sb.auth.signOut()
        return
      }

      // Buscar todos os membros visíveis da equipe
      let orgMembers: OrgMember[] = []
      const { data: rawMembers } = await sb.from("members").select("*")
      if (rawMembers && rawMembers.length > 0) {
        orgMembers = rawMembers.map((m: Record<string, unknown>) => ({
          email: String(m.email ?? ""),
          teamId: String(m.team_id ?? ""),
          displayName: m.display_name ? String(m.display_name) : undefined,
          avatarUrl: m.avatar_url ? String(m.avatar_url) : undefined,
          roleLevel: (m.role_level as RoleLevel) || "operator",
          active: m.active !== false,
          joinedAt: String(m.joined_at ?? m.created_at ?? nowIso()),
        }))
        syncTeamMembers(orgMembers)
      } else {
        // Fallback para os membros locais
        syncTeamMembers([
          { teamId: member.team_id, displayName: member.display_name, email: member.email },
        ])
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
          meRoleLevel: (member.role_level as RoleLevel) || "owner",
          orgMembers,
          leads,
          activities,
          tasks: tasks.filter(isWorkTask),
          items: tasks.filter((t) => !isWorkTask(t)),
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
        segment: input.segment?.trim() || undefined,
        city: input.city?.trim() || undefined,
        source: input.source?.trim() || undefined,
        analysis: input.analysis,
        review: { status: "pending" },
        nextAction: { text: input.nextAction.text.trim(), dueDate: input.nextAction.dueDate },
        lastActivityAt: now,
        createdAt: now,
      }
      set((s) => ({ leads: [...s.leads, lead] }))
      persist(repos().leads.upsert(lead))
      addActivity(lead.id, "criado", "Lead criado")
      const actor = { type: "human" as const, id: get().meId }
      recordEvent({ type: "lead.created", entity: { type: "lead", id: lead.id }, actor, metadata: { name: lead.name, source: lead.source, segment: lead.segment, city: lead.city, website: lead.website, hasAnalysis: !!lead.analysis } })
      if (lead.analysis)
        recordEvent({ type: "lead.analyzed", entity: { type: "lead", id: lead.id }, actor: { type: lead.analysis.analyzedBy === "planilha" ? "system" : "agent", id: lead.analysis.analyzedBy ?? "planilha" }, metadata: { name: lead.name, ...lead.analysis } })
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
      if (stage === "ganho") emit({ type: "lead.ganho", leadId: id })
      if (stage === "perdido") emit({ type: "lead.perdido", leadId: id })
      // Histórico gravado (AI Office): etapas que importam para o aprendizado.
      const stageEvent = ({ proposta: "lead.proposal", negociacao: "lead.interested", ganho: "lead.converted", perdido: "lead.lost" } as const)[stage as "proposta"]
      if (stageEvent)
        recordEvent({ type: stageEvent, entity: { type: "lead", id }, actor: { type: "human", id: get().meId }, metadata: { name: lead.name, from: lead.stage, to: stage, valueCents: lead.valueCents, lostReason: extra?.lostReason } })
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
        seriesId: input.seriesId,
        projectName: canon(input.projectName),
        areaId: input.areaId,
        estimateMin: input.estimateMin,
        plannedFor: input.plannedFor,
        createdById: input.createdById,
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
      // Concluir tira o "em andamento"; reabrir volta para "a fazer".
      saveTask({ ...task, done, doneAt: done ? nowIso() : undefined, status: undefined })
      if (done && task.leadId) addActivity(task.leadId, "acao_concluida", `Tarefa: ${task.title}`)
      if (done) emit({ type: "tarefa.concluida", taskId: id })
      if (!done || !task.recurrence) return
      // Recorrente: a próxima nasce com o checklist zerado e o mesmo resto.
      return get().createTask({
        ...task,
        seriesId: task.seriesId ?? task.id,
        dueDate: nextOccurrence(task.dueDate, task.recurrence, new Date()),
        checklist: task.checklist?.map((i) => ({ ...i, id: uid(), done: false })),
      })
    },

    deleteTask(id) {
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), items: s.items.filter((t) => t.id !== id) }))
      persist(repos().tasks.remove(id))
    },

    createItem(item) {
      set((s) => placeItem(s, item))
      persist(repos().tasks.upsert(item))
      return item
    },

    updateItem(id, patch) {
      const item = get().items.find((t) => t.id === id) ?? get().tasks.find((t) => t.id === id)
      if (item) saveTask({ ...item, ...patch })
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
      if ("projectName" in patch) updated.projectName = canon(patch.projectName)
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
      const tx: Transaction = { ...input, projectName: canon(input.projectName), id: uid(), createdById: get().meId }
      set((s) => ({ transactions: [...s.transactions, tx] }))
      persist(repos().transactions.upsert(tx))
      if (tx.type === "entrada" && isRealizedTransaction(tx)) emit({ type: "entrada.lancada", transactionId: tx.id, amountCents: tx.amountCents })
      return tx
    },

    updateTransaction(id, patch) {
      const current = get().transactions.find((t) => t.id === id)
      if (!current) return
      const updated = { ...current, ...patch }
      if ("projectName" in patch) updated.projectName = canon(patch.projectName)
      set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? updated : t)) }))
      persist(repos().transactions.upsert(updated))
      if (current.type === "entrada" && current.status === "previsto" && isRealizedTransaction(updated)) {
        emit({ type: "entrada.lancada", transactionId: id, amountCents: updated.amountCents })
      }
    },

    settleTransaction(id, { date, amountCents }) {
      const current = get().transactions.find((t) => t.id === id)
      if (!current || current.status !== "previsto") return
      const plan = planSettlement(current, date, amountCents)
      if (plan.full) {
        get().updateTransaction(id, { status: "realizado", date })
        return
      }
      // Parcial: nasce um movimento realizado com o valor pago; o compromisso segue em aberto com o restante.
      get().createTransaction({
        type: current.type, amountCents: plan.paid, category: current.category, description: `${current.description} (parcial)`,
        date, status: "realizado", dueDate: current.dueDate, leadId: current.leadId, productId: current.productId,
        projectName: current.projectName, source: current.source,
      })
      get().updateTransaction(id, { amountCents: plan.remaining, originalCents: plan.originalCents })
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

    setCeoLimit(cents) {
      const financeSettings = { ...get().financeSettings, ceoApprovalLimitCents: cents }
      set({ financeSettings })
      persist(repos().financeSettings.save(financeSettings))
    },

    // ---------- mapas ----------

    createMap(template) {
      const map = template.startsWith("lousa-") ? boardTemplate(template as BoardTemplateId) : { ...templateMap(template as TemplateId), mode: "estruturado" as const }
      set((s) => ({ mindMaps: [...s.mindMaps, map] }))
      persist(repos().mindMaps.upsert(map))
      return map
    },

    createMapFrom({ title, mode, nodes, edges }) {
      const map: MindMap = { id: uid(), title, mode, nodes, edges, updatedAt: nowIso() }
      set((s) => ({ mindMaps: [...s.mindMaps, map] }))
      persist(repos().mindMaps.upsert(map))
      return map
    },

    saveMap(map) {
      // Mapa já em 1 registro por balão: aqui só muda título/marcação. Os balões
      // antigos (backup) nunca são sobrescritos pelos que vêm das linhas.
      const stored = get().mindMaps.find((m) => m.id === map.id)
      const backup = stored?.storage === "rows" ? { nodes: stored.nodes, edges: stored.edges } : {}
      const updated = { ...map, ...backup, updatedAt: nowIso() }
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

// ---------- item único (HZK OS) ----------

/**
 * Coloca o item na lista certa: tarefa de trabalho em `tasks`, o resto em `items`
 * (src/lib/domain/items.ts › isWorkTask). Se mudou de tipo na triagem, sai da outra lista.
 */
function placeItem(s: Pick<State, "tasks" | "items">, item: Task): Pick<State, "tasks" | "items"> {
  const without = (list: Task[]) => list.filter((t) => t.id !== item.id)
  const upsert = (list: Task[]) => (list.some((t) => t.id === item.id) ? list.map((t) => (t.id === item.id ? item : t)) : [...list, item])
  return isWorkTask(item) ? { tasks: upsert(s.tasks), items: without(s.items) } : { tasks: without(s.tasks), items: upsert(s.items) }
}

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
    if (table === "members") {
      // Quando um membro é adicionado, editado ou removido, atualiza a lista de membros
      useStore.getState().refreshOrgMembers()
      return
    }
    if (table === "tasks") {
      // Mesma tabela, duas listas (tarefas de trabalho × demais itens).
      useStore.setState((s) => {
        if (eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id
          return { tasks: s.tasks.filter((t) => t.id !== id), items: s.items.filter((t) => t.id !== id) }
        }
        const item = (payload.new as { data?: Task }).data
        return item ? placeItem(s, item) : {}
      })
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

/** Atalho para o nível de acesso do usuário atual. */
export function useMeRoleLevel() {
  return useStore((s) => s.meRoleLevel)
}
