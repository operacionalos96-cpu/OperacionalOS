"use client"

import { useMemo, useState } from "react"
import { addDays, format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react"
import { eventsOfDay, timeRange } from "@/lib/domain/calendar"
import { planCandidates, type MyDay } from "@/lib/domain/my-day"
import { stopTask } from "@/lib/domain/work-sessions"
import { useCalendarEvents, useDailyPlans } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { dayRow, useDoing } from "@/lib/use-my-day"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Step = "concluido" | "monte" | "foco" | "nota"

/**
 * Fechar o dia + Planejar amanhã (blueprint, 4 telas, ~5 min) — ou "Planejar hoje" para quem não
 * fechou ontem (as 2 primeiras telas, mirando hoje). O foco e a nota vão para a linha de amanhã
 * (daily_plans): o check-in de amanhã já vem com o foco e a Início mostra a nota.
 */
export function CloseDay({ day, target, onDone }: { day: MyDay; target: "amanha" | "hoje"; onDone: () => void }) {
  const meId = useStore((s) => s.meId)
  const tasks = useStore((s) => s.tasks)
  const updateTask = useStore((s) => s.updateTask)
  const events = useCalendarEvents((s) => s.items)
  const save = useDailyPlans((s) => s.save)
  const { complete } = useDoing()
  const now = new Date()
  const targetDay = target === "amanha" ? addDays(now, 1) : now
  const targetKey = format(targetDay, "yyyy-MM-dd")
  const steps: Step[] = target === "amanha" ? ["concluido", "monte", "foco", "nota"] : ["concluido", "monte"]
  const [i, setI] = useState(0)
  const step = steps[i]
  const nextRow = dayRow(useDailyPlans.getState().items, meId, targetDay)
  const [focus, setFocus] = useState(nextRow.focus ?? "")
  const [note, setNote] = useState(nextRow.noteFromYesterday ?? "")
  const [other, setOther] = useState<Record<string, string>>({})

  // O que ficou aberto hoje (atrasadas e de hoje) e não foi mandado para outro dia.
  const leftovers = day.planItems.filter((x) => (x.group === "atrasado" || x.group === "hoje") && x.task.plannedFor !== targetKey && (target === "hoje" || x.task.plannedFor !== format(addDays(now, 1), "yyyy-MM-dd")))
  const doneToday = tasks.filter((t) => t.ownerId === meId && t.done && t.doneAt?.slice(0, 10) === format(now, "yyyy-MM-dd"))
  const candidates = useMemo(() => planCandidates(meId, targetDay, tasks), [meId, targetKey, tasks]) // eslint-disable-line react-hooks/exhaustive-deps
  const agenda = eventsOfDay(meId, events, targetDay)
  const targetLabel = target === "amanha" ? "amanhã" : "hoje"

  function finish() {
    if (target === "amanha") {
      const today = dayRow(useDailyPlans.getState().items, meId, now)
      save({ ...stopTask(today, now), closedAt: now.toISOString() })
      save({ ...dayRow(useDailyPlans.getState().items, meId, targetDay), focus: focus.trim() || undefined, noteFromYesterday: note.trim() || undefined })
      toast.success("Dia fechado", { description: "Amanhã o seu foco e a sua nota estarão na Início. Bom descanso!" })
    } else toast.success("Dia planejado")
    onDone()
  }

  const title: Record<Step, string> = {
    concluido: target === "amanha" ? "O que você concluiu hoje" : "O que ficou de ontem",
    monte: `Monte o ${target === "amanha" ? "amanhã" : "hoje"}`,
    foco: "Foco de amanhã",
    nota: "Nota para amanhã",
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        {steps.map((s, k) => (
          <span key={s} className={cn("h-1.5 flex-1 rounded-full", k <= i ? "bg-highlight" : "bg-muted")} />
        ))}
      </div>
      <p className="font-semibold">
        {i + 1}. {title[step]}
      </p>

      {step === "concluido" && (
        <div className="grid gap-2">
          {doneToday.length > 0 && (
            <ul className="grid grid-cols-1 gap-1 text-sm">
              {doneToday.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-muted-foreground">
                  <CheckIcon className="size-4 text-success" /> <span className="truncate line-through">{t.title}</span>
                </li>
              ))}
            </ul>
          )}
          {leftovers.length ? (
            <>
              <p className="t-desc text-xs">O que ficou aberto: conclua, mande para {targetLabel}, para outro dia, ou solte.</p>
              <ul className="grid grid-cols-1 gap-1.5">
                {leftovers.map(({ task }) => (
                  <li key={task.id} className="grid gap-1.5 rounded-xl border bg-background p-2">
                    <span className="truncate text-sm font-medium">{task.title}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button size="xs" variant="outline" onClick={() => complete(task)}>
                        <CheckIcon /> Concluí
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => updateTask(task.id, { plannedFor: targetKey })}>
                        {target === "amanha" ? "Amanhã" : "Hoje"}
                      </Button>
                      <input
                        type="date"
                        aria-label="Outro dia"
                        value={other[task.id] ?? ""}
                        min={format(addDays(now, 1), "yyyy-MM-dd")}
                        onChange={(e) => {
                          setOther({ ...other, [task.id]: e.target.value })
                          if (e.target.value) updateTask(task.id, { plannedFor: e.target.value })
                        }}
                        className="h-6 rounded-md border bg-background px-1 text-xs"
                      />
                      <Button size="xs" variant="ghost" onClick={() => updateTask(task.id, { plannedFor: undefined, status: undefined })}>
                        Soltar
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="t-desc text-sm">Nada ficou aberto. Mandou bem!</p>
          )}
        </div>
      )}

      {step === "monte" && (
        <div className="grid gap-2">
          <p className="t-desc text-xs">
            Agenda de {format(targetDay, "EEEE", { locale: ptBR })}:{" "}
            {agenda.length ? agenda.map((e) => `${e.kind === "ausencia" ? "dia todo" : timeRange(e)} ${e.title}`).join(" · ") : "livre"}
          </p>
          <ul className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto">
            {candidates.slice(0, 15).map(({ task, planned }) => {
              const on = planned
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => updateTask(task.id, { plannedFor: on && task.plannedFor === targetKey ? undefined : targetKey })}
                    disabled={on && task.plannedFor !== targetKey}
                    className={cn("flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm", on ? "border-highlight/60 bg-highlight-soft" : "bg-background hover:bg-accent")}
                  >
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on && "border-highlight bg-highlight text-white")}>{on && <CheckIcon className="size-3" />}</span>
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.dueDate && <span className="text-xs text-muted-foreground">{format(new Date(`${task.dueDate.slice(0, 10)}T12:00:00`), "dd/MM")}</span>}
                  </button>
                </li>
              )
            })}
            {!candidates.length && <li className="t-desc text-sm">Nenhuma tarefa aberta. Anote o que vem pela captura (+).</li>}
          </ul>
        </div>
      )}

      {step === "foco" && (
        <div className="grid gap-1.5">
          <p className="t-desc text-xs">Uma frase. Ela vira o cabeçalho da sua Início amanhã.</p>
          <Input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ex.: fechar o roteiro do lançamento" maxLength={140} autoFocus />
        </div>
      )}

      {step === "nota" && (
        <div className="grid gap-1.5">
          <p className="t-desc text-xs">O que você precisa lembrar amanhã? Aparece no topo da Início de manhã.</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: começar pelo e-mail do coprodutor; a senha nova está no Cofre." rows={3} maxLength={600} autoFocus />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => (i ? setI(i - 1) : onDone())}>
          <ArrowLeftIcon /> {i ? "Voltar" : "Cancelar"}
        </Button>
        {i < steps.length - 1 ? (
          <Button size="sm" onClick={() => setI(i + 1)}>
            Próximo <ArrowRightIcon />
          </Button>
        ) : (
          <Button size="sm" onClick={finish}>
            <CheckIcon /> {target === "amanha" ? "Fechar o dia" : "Pronto"}
          </Button>
        )}
      </div>
    </div>
  )
}
