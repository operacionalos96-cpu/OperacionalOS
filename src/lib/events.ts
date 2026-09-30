/**
 * Eventos do negócio — um lugar só. Toda ação importante avisa aqui ("lead ganho",
 * "tarefa concluída"…) e quem quiser reagir se inscreve (automações, integrações,
 * IA no futuro), sem espalhar regras pelas telas.
 *
 *   emit({ type: "lead.ganho", leadId })      // quem faz
 *   on("lead.ganho", (e) => …)                // quem reage (devolve o "desinscrever")
 *
 * Os eventos saem da store (src/lib/store.ts) e das ações (src/lib/actions.ts), então
 * valem para qualquer tela que usar essas funções.
 */
export type DomainEvent =
  | { type: "lead.ganho"; leadId: string }
  | { type: "lead.perdido"; leadId: string }
  | { type: "tarefa.concluida"; taskId: string }
  | { type: "entrada.lancada"; transactionId: string; amountCents: number }
  | { type: "conteudo.etapa"; contentId: string; stage: string }

export type EventType = DomainEvent["type"]
type Handler<T extends EventType> = (e: Extract<DomainEvent, { type: T }>) => void

type AnyHandler = (e: DomainEvent) => void
const handlers = new Map<EventType, Set<AnyHandler>>()

export function on<T extends EventType>(type: T, handler: Handler<T>): () => void {
  const set = handlers.get(type) ?? new Set()
  const h = handler as unknown as AnyHandler
  set.add(h)
  handlers.set(type, set)
  return () => set.delete(h)
}

/** Avisa quem se inscreveu. Um erro numa reação nunca quebra a ação principal. */
export function emit(e: DomainEvent) {
  for (const h of handlers.get(e.type) ?? []) {
    try {
      h(e)
    } catch (err) {
      console.error(`[evento ${e.type}]`, err)
    }
  }
}
