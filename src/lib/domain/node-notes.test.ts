import { describe, expect, it } from "vitest"
import { addNote, makeNote, noteKind, notesSummary, removeNote } from "./node-notes"

describe("anotações do balão", () => {
  const now = new Date("2026-10-02T12:00:00Z")

  it("limpa o texto; citação guarda o app; link só http(s)", () => {
    expect(makeNote({ kind: "comentario", text: "   " }, "u1", "n1", now)).toBeNull()
    const c = makeNote({ kind: "citacao", text: " usar nos reels ", app: " Instagram ", url: "javascript:alert(1)" }, "u1", "n2", now)!
    expect(c).toMatchObject({ kind: "citacao", text: "usar nos reels", app: "Instagram", url: undefined, authorId: "u1" })
    // Só o app (sem texto) já vale como citação.
    expect(makeNote({ kind: "citacao", text: "", app: "Canva" }, "u1", "n3", now)?.app).toBe("Canva")
    // Comentário não leva app.
    expect(makeNote({ kind: "comentario", text: "oi", app: "X" }, "u1", "n4", now)?.app).toBeUndefined()
  })

  it("tipo desconhecido (versão futura) aparece como comentário", () => {
    expect(noteKind("pergunta").id).toBe("comentario")
  })

  it("adicionar, remover e resumo por tipo", () => {
    const a = makeNote({ kind: "comentario", text: "a" }, "u1", "a", now)!
    const b = makeNote({ kind: "citacao", text: "", app: "Hotmart" }, "u1", "b", now)!
    const c = makeNote({ kind: "comentario", text: "c" }, "u1", "c", now)!
    const notes = addNote(addNote(addNote(undefined, a), b), c)
    expect(notesSummary(notes)).toBe("2 comentários · 1 citação")
    expect(removeNote(notes, "b")).toHaveLength(2)
    expect(removeNote([a], "a")).toBeUndefined()
    expect(notesSummary(undefined)).toBe("")
  })
})
