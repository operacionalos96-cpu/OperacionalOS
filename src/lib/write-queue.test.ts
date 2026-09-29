import { describe, expect, it } from "vitest"
import { queueWrite } from "./write-queue"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("queueWrite", () => {
  it("grava o mesmo registro em ordem, mesmo se a primeira gravação for a mais lenta", async () => {
    const db: string[] = []
    await Promise.all([
      queueWrite("tasks:1", async () => (await wait(30), db.push("v1"))),
      queueWrite("tasks:1", async () => (await wait(5), db.push("v2"))),
      queueWrite("tasks:1", async () => (await wait(1), db.push("v3"))),
    ])
    expect(db).toEqual(["v1", "v2", "v3"])
  })

  it("uma falha não trava a fila", async () => {
    const db: string[] = []
    await queueWrite("x:1", async () => Promise.reject(new Error("rede"))).catch(() => {})
    await queueWrite("x:1", async () => db.push("ok"))
    expect(db).toEqual(["ok"])
  })

  it("registros diferentes gravam em paralelo", async () => {
    const order: string[] = []
    await Promise.all([
      queueWrite("a:1", async () => (await wait(20), order.push("a"))),
      queueWrite("b:1", async () => (await wait(1), order.push("b"))),
    ])
    expect(order).toEqual(["b", "a"])
  })
})
