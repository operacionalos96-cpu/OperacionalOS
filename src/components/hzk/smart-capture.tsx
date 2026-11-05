"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangleIcon, CheckCircle2Icon, ChevronDownIcon, Loader2Icon, PencilIcon, PlusIcon, RotateCcwIcon, SparklesIcon, Trash2Icon, XCircleIcon } from "lucide-react"
import { priorityMeta } from "@/lib/domain/constants"
import { uniqueProjects } from "@/lib/domain/project-names"
import {
  CAPTURE_AREAS,
  MAX_CAPTURE_CHARS,
  draftToTaskInput,
  draftsToCreate,
  parseTaskTitle,
  withTitleArea,
  type CaptureArea,
  type CaptureContext,
  type CaptureDraft,
  type CapturedTask,
  type ReviewFlag,
} from "@/lib/domain/smart-capture"
import { dueLabel, uid } from "@/lib/format"
import { useStore } from "@/lib/store"
import { SANDBOX } from "@/lib/supabase/env"
import { openTaskDetail } from "@/lib/ui-store"
import { useTeam } from "@/lib/use-team"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Chip, DueDateField, Field, LeadSelect } from "@/components/shared/fields"
import { LabelEditor, PeoplePicker, PriorityPicker, RecurrencePicker } from "@/components/tasks/task-bits"

/**
 * Captura inteligente (ADR 0019): texto informal → prévia editável → só cria o que a pessoa confirmar.
 * O rascunho (texto + prévia + o que já foi criado) fica guardado neste navegador até concluir ou
 * descartar: fechar sem querer, erro de rede ou recarregar a página não perdem o trabalho.
 */
const STORAGE_KEY = "captura-ia:rascunho:v1"

interface Saved {
  text: string
  phase: "texto" | "previa"
  drafts: CaptureDraft[]
  referenceDate?: string
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Saved
    // Uma gravação interrompida no meio volta como "a criar" (o id fixo impede duplicar).
    return { ...s, drafts: (s.drafts ?? []).map((d) => (d.status === "saving" ? { ...d, status: "idle" } : d)) }
  } catch {
    return null
  }
}

function save(s: Saved | null) {
  try {
    if (s && (s.text.trim() || s.drafts.length)) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Navegador sem armazenamento: segue só em memória.
  }
}

const REVIEW_LABEL: Record<ReviewFlag, string> = {
  project: "projeto",
  lead: "lead",
  assignee: "responsável",
  due: "prazo",
  title: "título",
}

const EXAMPLE = `HZK
Hoje corrigir bug do vídeo do funil e agente de prospecção.
Sexta reunião com Iole.

Afrodite-se
Criar páginas de vendas do mapa gratuito e pago.`

function blankDraft(): CaptureDraft {
  return {
    key: uid(),
    selected: true,
    status: "idle",
    title: "GESTÃO / ",
    area: "GESTÃO",
    assigneeIds: [],
    unresolvedAssignees: [],
    mentionedPeople: [],
    labels: [],
    newLabels: [],
    description: "",
    sourceExcerpt: "",
    review: [],
  }
}

export function SmartCapture({ onClose }: { onClose: () => void }) {
  const meId = useStore((s) => s.meId)
  const tasks = useStore((s) => s.tasks)
  const notes = useStore((s) => s.notes)
  const transactions = useStore((s) => s.transactions)
  const leads = useStore((s) => s.leads)
  const createTaskConfirmed = useStore((s) => s.createTaskConfirmed)
  const team = useTeam()

  // Só monta com o diálogo aberto (nunca no servidor): dá para ler o rascunho guardado já no primeiro render.
  const [saved] = useState(loadSaved)
  const [text, setText] = useState(saved?.text ?? "")
  const [phase, setPhase] = useState<Saved["phase"]>(saved?.phase ?? "texto")
  const [drafts, setDrafts] = useState<CaptureDraft[]>(saved?.drafts ?? [])
  const [referenceDate, setReferenceDate] = useState<string | undefined>(saved?.referenceDate)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Guarda a cada mudança (texto, prévia, edições e o que já foi criado).
  useEffect(() => {
    save({ text, phase, drafts, referenceDate })
  }, [text, phase, drafts, referenceDate])

  const projects = useMemo(() => uniqueProjects([...tasks, ...notes, ...transactions].map((x) => x.projectName)), [tasks, notes, transactions])

  function patch(key: string, p: Partial<CaptureDraft>) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)))
  }

  async function structure() {
    if (!text.trim() || loading) return
    setLoading(true)
    setError(undefined)
    try {
      // No modo demonstração o "banco" é o do navegador: a tela manda o contexto. No real, o servidor lê do banco.
      const context: CaptureContext | undefined = SANDBOX
        ? {
            projects,
            labels: uniqueProjects(tasks.flatMap((t) => t.labels ?? [])),
            members: team.map((u) => ({ id: u.id, name: u.name })),
            leads: leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido").map((l) => ({ id: l.id, name: l.name, company: l.company })),
          }
        : undefined
      const res = await fetch("/api/ia/captura", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, context }) })
      const data = (await res.json().catch(() => ({}))) as { erro?: string; tasks?: CapturedTask[]; referenceDate?: string }
      if (!res.ok || !data.tasks) throw new Error(data.erro ?? `Falha ao estruturar (${res.status}).`)
      if (!data.tasks.length) {
        setError("Não encontrei nenhuma tarefa nesse texto. Escreva o que precisa ser feito.")
        return
      }
      // Refazer mantém o que já foi criado; o resto é substituído pela nova leitura.
      const fresh: CaptureDraft[] = data.tasks.map((t) => ({ ...t, key: uid(), selected: true, status: "idle" }))
      setDrafts((ds) => [...ds.filter((d) => d.status === "created"), ...fresh])
      setReferenceDate(data.referenceDate)
      setOpenKey(null)
      setPhase("previa")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao estruturar. Tente de novo.")
    } finally {
      setLoading(false)
    }
  }

  /** Cria uma a uma pelo fluxo normal de tarefa; o resultado aparece em cada card. */
  async function create(list: CaptureDraft[]) {
    if (!list.length || creating) return
    setCreating(true)
    let ok = 0
    for (const d of list) {
      patch(d.key, { status: "saving", error: undefined })
      try {
        const task = await createTaskConfirmed(draftToTaskInput(d, meId), d.key)
        patch(d.key, { status: "created", taskId: task.id })
        ok++
      } catch (err) {
        patch(d.key, { status: "error", error: err instanceof Error && err.message ? err.message : "Não foi possível salvar." })
      }
    }
    setCreating(false)
    const failed = list.length - ok
    if (failed === 0) toast.success(ok === 1 ? "Tarefa criada" : `${ok} tarefas criadas`)
    else toast.error(`${ok} criada(s), ${failed} com erro`, { description: "As com erro continuam na prévia: corrija ou tente de novo." })
  }

  function discard() {
    const pending = drafts.filter((d) => d.status !== "created").length
    if (pending && !window.confirm(`Descartar ${pending === 1 ? "1 tarefa ainda não criada" : `${pending} tarefas ainda não criadas`}?`)) return
    save(null)
    setText("")
    setDrafts([])
    setPhase("texto")
    onClose()
  }

  function finish() {
    save(null)
    setText("")
    setDrafts([])
    setPhase("texto")
    onClose()
  }

  // ---------- texto ----------
  if (phase === "texto") {
    return (
      <div className="grid gap-3">
        <Textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void structure()
            }
          }}
          placeholder={`Escreva do seu jeito, uma ou várias tarefas. Ex.:\n\n${EXAMPLE}`}
          className="min-h-48 text-sm leading-relaxed"
          maxLength={MAX_CAPTURE_CHARS}
          aria-label="Texto para estruturar"
        />
        <p className="t-desc text-xs">
          A IA separa as tarefas, sugere título, projeto, prazo e o resto. <strong className="font-medium text-foreground">Nada é salvo</strong> antes de você revisar e confirmar.
        </p>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/8 px-3 py-2 text-sm">
            <XCircleIcon className="mt-0.5 size-4 shrink-0 text-[color:var(--danger)]" /> {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <span className="mr-auto text-xs text-muted-foreground tabular">
            {text.length.toLocaleString("pt-BR")}/{MAX_CAPTURE_CHARS.toLocaleString("pt-BR")}
          </span>
          {drafts.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setPhase("previa")}>
              Voltar à prévia
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={drafts.length || text.trim() ? discard : onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" onClick={() => void structure()} disabled={!text.trim() || loading}>
            {loading ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {loading ? "Estruturando…" : "Estruturar tarefas"}
          </Button>
        </div>
      </div>
    )
  }

  // ---------- prévia ----------
  const pending = drafts.filter((d) => d.status !== "created")
  const selected = draftsToCreate(drafts, true).length
  const allDone = drafts.length > 0 && pending.length === 0

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="t-label mr-auto">
          {drafts.length === 1 ? "1 tarefa" : `${drafts.length} tarefas`}
          {referenceDate && <span className="t-desc ml-1.5 text-xs font-normal tracking-normal normal-case">· prazos contados a partir de {dueLabelFull(referenceDate)} (horário de Brasília)</span>}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPhase("texto")} disabled={creating}>
          <PencilIcon /> Editar texto
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => void structure()} disabled={creating || loading || !text.trim()} title="Lê o texto de novo (mantém as já criadas)">
          {loading ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />} Refazer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={creating}
          onClick={() => {
            const d = blankDraft()
            setDrafts((ds) => [...ds, d])
            setOpenKey(d.key)
          }}
        >
          <PlusIcon /> Adicionar
        </Button>
      </div>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-[color:var(--danger)]/30 px-3 py-2 text-sm">
          <XCircleIcon className="mt-0.5 size-4 shrink-0 text-[color:var(--danger)]" /> {error}
        </p>
      )}

      <datalist id="captura-ia-projetos">
        {projects.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <ul className="grid max-h-[min(60vh,560px)] gap-2 overflow-y-auto pr-1">
        {drafts.map((d) => (
          <DraftCard
            key={d.key}
            draft={d}
            meId={meId}
            open={openKey === d.key}
            busy={creating}
            onToggle={() => setOpenKey((k) => (k === d.key ? null : d.key))}
            onChange={(p) => patch(d.key, p)}
            onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
            onRetry={() => void create(draftsToCreate([d], false))}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
        {allDone ? (
          <>
            <span className="mr-auto flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2Icon className="size-4 text-[color:var(--success)]" /> Todas criadas.
            </span>
            <Button type="button" variant="brand" onClick={finish}>
              Concluir
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={discard} disabled={creating}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" onClick={() => void create(draftsToCreate(drafts, true))} disabled={creating || selected === 0}>
              Criar selecionadas ({selected})
            </Button>
            <Button type="button" variant="brand" onClick={() => void create(draftsToCreate(drafts, false))} disabled={creating || draftsToCreate(drafts, false).length === 0}>
              {creating && <Loader2Icon className="animate-spin" />}
              Criar todas ({draftsToCreate(drafts, false).length})
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function dueLabelFull(key: string) {
  const [y, m, d] = key.split("-")
  const wd = new Date(`${key}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "")
  return `${wd}, ${d}/${m}${y !== String(new Date().getFullYear()) ? `/${y}` : ""}`
}

function DraftCard({
  draft: d,
  meId,
  open,
  busy,
  onToggle,
  onChange,
  onRemove,
  onRetry,
}: {
  draft: CaptureDraft
  meId: string
  open: boolean
  busy: boolean
  onToggle: () => void
  onChange: (p: Partial<CaptureDraft>) => void
  onRemove: () => void
  onRetry: () => void
}) {
  const team = useTeam()
  const created = d.status === "created"
  const people = d.assigneeIds.length ? d.assigneeIds : [meId]
  const names = people.map((id) => team.find((u) => u.id === id)?.name ?? id)
  const standard = parseTaskTitle(d.title)
  const prio = priorityMeta(d.priority)
  const sugg = priorityMeta(d.prioritySuggested)

  return (
    <li
      className={cn(
        "rounded-xl border bg-card transition-colors",
        created && "border-[color:var(--success)]/40 bg-[color:var(--success)]/5",
        d.status === "error" && "border-[color:var(--danger)]/40",
      )}
    >
      <div className="flex items-start gap-2.5 p-3">
        {created ? (
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-[color:var(--success)]" aria-label="Criada" />
        ) : (
          <Checkbox className="mt-0.5" checked={d.selected} onCheckedChange={(v) => onChange({ selected: v === true })} aria-label="Selecionar tarefa" disabled={busy} />
        )}
        <button type="button" onClick={onToggle} className="grid min-w-0 flex-1 gap-1 text-left" aria-expanded={open}>
          <span className="truncate text-sm font-medium">{d.title.trim() || "Sem título"}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{d.projectName ?? (d.projectHint ? `“${d.projectHint}”?` : "Sem projeto")}</span>
            <span aria-hidden>·</span>
            <span>{d.dueDate ? dueLabel(d.dueDate) : "Sem prazo"}</span>
            <span aria-hidden>·</span>
            <span>{d.assigneeIds.length ? names.join(", ") : "Responsável não informado"}</span>
            {prio && (
              <>
                <span aria-hidden>·</span>
                <span style={{ color: prio.color }}>{prio.label}</span>
              </>
            )}
            {!prio && sugg && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <SparklesIcon className="size-3" /> sugere {sugg.label.toLowerCase()}
                </span>
              </>
            )}
            {!created && d.review.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-px font-medium text-foreground">
                <AlertTriangleIcon className="size-3 text-[color:var(--warning)]" /> revisar {d.review.map((r) => REVIEW_LABEL[r]).join(", ")}
              </span>
            )}
          </span>
          {d.status === "error" && <span className="text-xs text-[color:var(--danger)]">Não foi salva: {d.error}</span>}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {d.status === "saving" && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Salvando" />}
          {created && d.taskId && (
            <Button type="button" size="sm" variant="ghost" onClick={() => openTaskDetail(d.taskId!)}>
              Abrir
            </Button>
          )}
          {d.status === "error" && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={busy}>
              Tentar de novo
            </Button>
          )}
          {!created && (
            <Button type="button" size="icon" variant="ghost" className="size-7" onClick={onRemove} disabled={busy || d.status === "saving"} aria-label="Excluir da prévia" title="Excluir da prévia">
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={onToggle} aria-label={open ? "Recolher" : "Editar"}>
            <ChevronDownIcon className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
          </Button>
        </div>
      </div>

      {open && (
        <fieldset disabled={created || d.status === "saving"} className="grid animate-enter gap-4 border-t px-3 pt-3 pb-4 disabled:opacity-70">
          <div className="grid gap-2 sm:grid-cols-[11rem_1fr]">
            <Field label="Área">
              <Select value={standard?.area ?? d.area} onValueChange={(v) => onChange({ area: v as CaptureArea, title: withTitleArea(d.title, v as CaptureArea), review: d.review.filter((r) => r !== "title") })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAPTURE_AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Título" hint={standard ? undefined : "fora do padrão ÁREA / Entrega - Ação"}>
              <Input value={d.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={200} />
            </Field>
          </div>

          <Field label="Projeto" hint="opcional">
            <Input
              list="captura-ia-projetos"
              value={d.projectName ?? ""}
              onChange={(e) => onChange({ projectName: e.target.value || undefined, review: d.review.filter((r) => r !== "project") })}
              placeholder="Sem projeto"
            />
            {!d.projectName && d.projectHint && (
              <Pending>
                {d.projectCandidates?.length ? `“${d.projectHint}” combina com mais de um projeto. Escolha:` : `“${d.projectHint}” não está entre os projetos cadastrados. Escolha um ou use o nome como novo:`}
                <span className="flex flex-wrap gap-1.5 pt-1">
                  {(d.projectCandidates ?? []).map((p) => (
                    <Chip key={p} onClick={() => onChange({ projectName: p, review: d.review.filter((r) => r !== "project") })}>
                      {p}
                    </Chip>
                  ))}
                  <Chip onClick={() => onChange({ projectName: d.projectHint, review: d.review.filter((r) => r !== "project") })}>Usar “{d.projectHint}”</Chip>
                </span>
              </Pending>
            )}
          </Field>

          <Field label="Prazo" hint={d.dueText ? `no texto: “${d.dueText}”` : undefined}>
            <DueDateField value={d.dueDate} onChange={(v) => onChange({ dueDate: v, review: d.review.filter((r) => r !== "due") })} allowEmpty />
            {d.review.includes("due") && <Pending>Não deu para entender o prazo. Escolha uma data ou deixe sem prazo.</Pending>}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsáveis" hint={d.assigneeIds.length ? undefined : "nenhum informado · fica com você"}>
              <PeoplePicker value={people} onChange={(ids) => onChange({ assigneeIds: ids, review: d.review.filter((r) => r !== "assignee") })} />
              {d.unresolvedAssignees.length > 0 && d.review.includes("assignee") && (
                <Pending>{d.unresolvedAssignees.map((n) => `“${n}”`).join(", ")} foi indicado como responsável, mas não bate com ninguém da equipe.</Pending>
              )}
              {d.mentionedPeople.length > 0 && <p className="t-desc text-xs">Citados (não viram responsáveis): {d.mentionedPeople.join(", ")}</p>}
            </Field>
            <Field label="Vincular a um lead" hint="opcional">
              <LeadSelect value={d.leadId} onChange={(v) => onChange({ leadId: v, review: d.review.filter((r) => r !== "lead") })} />
              {!d.leadId && d.leadHint && d.review.includes("lead") && (
                <Pending>
                  {d.leadCandidates?.length ? `“${d.leadHint}” pode ser: ${d.leadCandidates.map((c) => c.label).join(" ou ")}. Escolha acima.` : `“${d.leadHint}” não bate com nenhum lead aberto.`}
                </Pending>
              )}
            </Field>
          </div>

          <Field label="Prioridade">
            <PriorityPicker value={d.priority} onChange={(p) => onChange({ priority: p })} />
            {!d.priority && sugg && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <SparklesIcon className="size-3.5" /> Sugestão da IA: <strong className="font-medium text-foreground">{sugg.label}</strong>
                {d.priorityReason && <span>({d.priorityReason})</span>}
                <Chip onClick={() => onChange({ priority: d.prioritySuggested })}>Aplicar</Chip>
              </p>
            )}
          </Field>

          <Field label="Etiquetas" hint={d.newLabels.some((l) => d.labels.includes(l)) ? `novas: ${d.newLabels.filter((l) => d.labels.includes(l)).join(", ")}` : undefined}>
            <div className="rounded-lg border bg-background px-2.5 py-2">
              <LabelEditor value={d.labels} onChange={(labels) => onChange({ labels })} />
            </div>
          </Field>
          <Field label="Repetir">
            <RecurrencePicker value={d.recurrence} onChange={(r) => onChange({ recurrence: r })} />
          </Field>
          <Field label="Descrição">
            <Textarea value={d.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Contexto, links, como fazer…" />
          </Field>
          {d.sourceExcerpt && <p className="t-desc text-xs italic">Do texto: “{d.sourceExcerpt}”</p>}
        </fieldset>
      )}
    </li>
  )
}

/** Campo que a pessoa precisa conferir (ambíguo ou não encontrado). */
function Pending({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1.5 text-xs">
      <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-[color:var(--warning)]" />
      <span className="grid gap-0.5">{children}</span>
    </div>
  )
}
