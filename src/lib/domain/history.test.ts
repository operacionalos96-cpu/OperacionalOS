import { describe, expect, it } from "vitest"
import { record, redo, replacePresent, startHistory, undo } from "./history"

describe("desfazer / refazer", () => {
  it("desfaz e refaz na ordem certa", () => {
    let h = startHistory("a")
    h = record(h, "b")
    h = record(h, "c")
    h = undo(h)!
    expect(h.present).toBe("b")
    h = undo(h)!
    expect(h.present).toBe("a")
    expect(undo(h)).toBeNull()
    h = redo(h)!
    expect(h.present).toBe("b")
    h = redo(h)!
    expect(h.present).toBe("c")
    expect(redo(h)).toBeNull()
  })

  it("mudança nova depois de desfazer apaga o refazer", () => {
    let h = record(record(startHistory(1), 2), 3)
    h = undo(h)!
    h = record(h, 9)
    expect(h.future).toEqual([])
    expect(h.past).toEqual([1, 2])
  })

  it("limite de passos e troca sem criar passo", () => {
    let h = startHistory(0)
    for (let i = 1; i <= 5; i++) h = record(h, i, 3)
    expect(h.past).toEqual([2, 3, 4])
    h = replacePresent(h, 50)
    expect(h.present).toBe(50)
    expect(undo(h)!.present).toBe(4)
  })
})
