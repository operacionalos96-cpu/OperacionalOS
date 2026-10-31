/**
 * Responsabilidades e feitos de cada pessoa (tela Equipe e página da pessoa).
 * Tudo DERIVADO das fontes que já existem — tarefas, decisões (item único), atividades dos leads
 * e áreas —, sem guardar nada à parte. Regras puras, testadas em team-work.test.ts.
 */
import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns"
import { ownerOfArea, type Area, type PeopleContext } from "./areas"
import { decisionsWaitingFor, kindOf } from "./items"
import { isTaskFor } from "./rules"
import type { Activity, Lead, Task } from "./types"

export interface DoneEntry {
  kind: "tarefa" | "decisao" | "lead"
  id: string
  title: string
  /** Data/hora em que aconteceu (ISO). */
  at: string
}

export interface PersonWork {
  areas: Area[]
  /** Tarefas abertas (dono ou colaborador). */
  open: Task[]
  overdue: Task[]
  decisionsWaiting: Task[]
  /** O que a pessoa fez no período, do mais recente para o mais antigo. */
  done: DoneEntry[]
}

const within = (iso: string | undefined, now: Date, days: number) => !!iso && differenceInCalendarDays(now, parseISO(iso)) < days

/**
 * Tarefas concluídas e decisões tomadas por uma pessoa entre dois dias (yyyy-MM-dd, inclusive).
 * Fonte ÚNICA do "o que fez": Equipe (personWork) e Semana do time (weekSummary) usam esta.
 */
export function doneBetween(memberId: string, src: { tasks: Task[]; items: Task[] }, from: string, to: string): { tasks: Task[]; decisions: Task[] } {
  const inRange = (iso?: string) => !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to
  return {
    tasks: src.tasks.filter((t) => t.done && isTaskFor(t, memberId) && inRange(t.doneAt)).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)),
    decisions: src.items.filter(
      (t) => kindOf(t) === "decision" && t.decision?.decidedBy === memberId && (t.decision.status === "decidida" || t.decision.status === "recusada") && inRange(t.decision.decidedAt),
    ),
  }
}

export function personWork(
  memberId: string,
  src: { tasks: Task[]; items: Task[]; activities: Activity[]; areas: Area[]; people: PeopleContext; leads?: Lead[] },
  now: Date,
  days = 7,
): PersonWork {
  const today = now.toISOString().slice(0, 10)
  const open = src.tasks
    .filter((t) => !t.done && isTaskFor(t, memberId))
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))

  const period = doneBetween(memberId, src, format(subDays(now, days - 1), "yyyy-MM-dd"), format(now, "yyyy-MM-dd"))
  const done: DoneEntry[] = [
    ...period.tasks.map((t) => ({ kind: "tarefa" as const, id: t.id, title: t.title, at: t.doneAt! })),
    ...period.decisions.map((t) => ({ kind: "decisao" as const, id: t.id, title: t.title, at: t.decision!.decidedAt! })),
    ...src.activities
      .filter((a) => a.authorId === memberId && within(a.createdAt, now, days))
      // Com o nome do lead: "Mariana Costa — Lead criado" diz de quem se trata.
      .map((a) => {
        const name = src.leads?.find((l) => l.id === a.leadId)?.name
        return { kind: "lead" as const, id: a.id, title: name ? `${name} — ${a.text}` : a.text, at: a.createdAt }
      }),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return {
    areas: src.areas.filter((a) => ownerOfArea(a, src.people) === memberId),
    open,
    overdue: open.filter((t) => !!t.dueDate && t.dueDate < today),
    decisionsWaiting: decisionsWaitingFor(memberId, src.items),
    done,
  }
}
