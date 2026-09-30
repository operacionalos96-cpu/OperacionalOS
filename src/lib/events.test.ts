import { describe, expect, it } from "vitest"
import { emit, on } from "./events"

describe("eventos", () => {
  it("entrega só para quem se inscreveu no tipo, e desinscrever funciona", () => {
    const got: string[] = []
    const off = on("lead.ganho", (e) => got.push(e.leadId))
    on("tarefa.concluida", (e) => got.push(`t:${e.taskId}`))
    emit({ type: "lead.ganho", leadId: "a" })
    off()
    emit({ type: "lead.ganho", leadId: "b" })
    emit({ type: "tarefa.concluida", taskId: "x" })
    expect(got).toEqual(["a", "t:x"])
  })
  it("uma reação com erro não impede as outras", () => {
    const got: string[] = []
    on("entrada.lancada", () => {
      throw new Error("falhou")
    })
    on("entrada.lancada", (e) => got.push(e.transactionId))
    const log = console.error
    console.error = () => {}
    emit({ type: "entrada.lancada", transactionId: "t1", amountCents: 100 })
    console.error = log
    expect(got).toEqual(["t1"])
  })
})
