"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { GOAL_SOURCES, goalValue, linkedTaskIds, type Goal, type GoalSource } from "@/lib/domain/insights"
import { money, uid } from "@/lib/format"
import { useGoals, useProducts, useRelations } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

/** Progresso da meta com os dados de agora (tarefas ligadas pelas Conexões). */
export function useGoalValue(goal: Goal) {
  const transactions = useStore((s) => s.transactions)
  const leads = useStore((s) => s.leads)
  const tasks = useStore((s) => s.tasks)
  const relations = useRelations((s) => s.items)
  return useMemo(() => {
    const ids = linkedTaskIds(goal.id, relations)
    return goalValue(goal, { transactions, leads, linkedTasks: tasks.filter((t) => ids.has(t.id)) })
  }, [goal, transactions, leads, tasks, relations])
}

export const formatGoal = (g: Pick<Goal, "source">, n: number) => (g.source === "receita" ? money(n) : String(n))

export function GoalRow({ goal, className, size = "compact" }: { goal: Goal; className?: string; size?: "compact" | "large" }) {
  const v = useGoalValue(goal)
  const pct = Math.round(v.pct * 100)
  if (size === "large") {
    const ended = goal.end < new Date().toISOString().slice(0, 10)
    // Linha grande da página Metas (mock): nome e situação à esquerda, % em destaque à direita, barra com brilho.
    return (
      <Link href={`/metas/${goal.id}`} className={cn("grid gap-4 rounded-xl px-5 py-4 transition-colors hover:bg-accent/40", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{goal.title}</p>
            {ended && <span className="mt-1.5 inline-flex rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Meta encerrada</span>}
          </div>
          <div className="shrink-0 text-right">
            <p className={cn("tabular text-2xl font-bold tracking-tight", pct >= 100 && "text-success")}>{pct}%</p>
            <p className="tabular text-sm text-muted-foreground">
              {formatGoal(goal, v.value)} de {formatGoal(goal, v.target)}
            </p>
          </div>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-success" : "bg-gradient-to-r from-brand to-[#ff8a57] shadow-[0_0_6px_-1px_var(--brand)]")}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </Link>
    )
  }
  return (
    <Link href={`/metas/${goal.id}`} className={cn("grid gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium">{goal.title}</p>
        <span className="tabular shrink-0 text-xs text-muted-foreground">
          {formatGoal(goal, v.value)} de {formatGoal(goal, v.target)} · <span className={cn("font-semibold", pct >= 100 ? "text-success" : "text-foreground")}>{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 100 ? "bg-success" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
    </Link>
  )
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
function thisMonth() {
  const t = new Date()
  return { start: iso(new Date(t.getFullYear(), t.getMonth(), 1)), end: iso(new Date(t.getFullYear(), t.getMonth() + 1, 0)) }
}

/** Criar/editar meta. Alvo em R$ para receita; quantidade para o resto (tarefas: automático). */
export function GoalDialog({ open, onOpenChange, goal }: { open: boolean; onOpenChange: (v: boolean) => void; goal?: Goal }) {
  const meId = useStore((s) => s.meId)
  const products = useProducts((s) => s.items)
  const [draft, setDraft] = useState<Goal>(() => goal ?? { id: uid(), title: "", source: "receita", target: 0, ...thisMonth(), ownerId: meId, createdAt: new Date().toISOString() })
  const [targetText, setTargetText] = useState(() => (goal ? String(goal.source === "receita" ? goal.target / 100 : goal.target) : ""))
  const set = (p: Partial<Goal>) => setDraft((d) => ({ ...d, ...p }))
  const toNumber = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) return
    const n = toNumber(targetText)
    useGoals.getState().save({ ...draft, title: draft.title.trim(), target: draft.source === "receita" ? Math.round(n * 100) : Math.round(n) })
    onOpenChange(false)
  }

  const field = "grid gap-1 text-xs text-muted-foreground"
  const select = "h-9 rounded-md border bg-background px-2 text-sm text-foreground"
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goal ? "Editar meta" : "Nova meta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-3">
          <label className={field}>
            O que queremos alcançar
            <Input autoFocus value={draft.title} onChange={(e) => set({ title: e.target.value })} placeholder="ex.: Faturar R$ 10 mil em outubro" />
          </label>
          <label className={field}>
            Como medir
            <select value={draft.source} onChange={(e) => set({ source: e.target.value as GoalSource })} className={select}>
              {GOAL_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.hint}
                </option>
              ))}
            </select>
          </label>
          {draft.source !== "tarefas" && (
            <div className="grid grid-cols-2 gap-2">
              <label className={field}>
                Alvo {draft.source === "receita" ? "(R$)" : ""}
                <Input inputMode="decimal" value={targetText} onChange={(e) => setTargetText(e.target.value)} placeholder={draft.source === "receita" ? "10.000" : "10"} />
              </label>
              {draft.source === "manual" && (
                <label className={field}>
                  Atual
                  <Input inputMode="decimal" value={draft.current ?? ""} onChange={(e) => set({ current: toNumber(e.target.value) })} placeholder="0" />
                </label>
              )}
            </div>
          )}
          {(draft.source === "receita" || draft.source === "vendas") && (
            <label className={field}>
              Só do produto (opcional)
              <select value={draft.productId ?? ""} onChange={(e) => set({ productId: e.target.value || undefined })} className={select}>
                <option value="">Todos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              De
              <Input type="date" value={draft.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <label className={field}>
              Até
              <Input type="date" value={draft.end} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>
          {draft.source === "tarefas" && <p className="t-desc text-xs">O progresso anda sozinho: conecte tarefas a esta meta (na página da meta ou da tarefa).</p>}
          <Button type="submit" disabled={!draft.title.trim()}>
            {goal ? "Salvar" : "Criar meta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
