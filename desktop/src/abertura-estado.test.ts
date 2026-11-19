import { describe, expect, it } from "vitest"
import { classificarPc, codigoCurto, faltaParaMinimo } from "./abertura-estado"
import { sanitize } from "./settings"

describe("abertura: estado do PC", () => {
  it("sem credencial abre o app para parear", () => {
    expect(classificarPc({ temToken: false, online: true, jaAprovado: true })).toBe("sem-pc")
  })
  it("sem internet não confunde com PC desligado", () => {
    expect(classificarPc({ temToken: true, online: false, sonda: "401", jaAprovado: true })).toBe("offline")
  })
  it("401 antes de ser aceito = aguardando; depois = desligado", () => {
    expect(classificarPc({ temToken: true, online: true, sonda: "401", jaAprovado: false })).toBe("aguardando")
    expect(classificarPc({ temToken: true, online: true, sonda: "401", jaAprovado: true })).toBe("desligado")
  })
  it("resposta boa = aprovado; falha do servidor não bloqueia", () => {
    expect(classificarPc({ temToken: true, online: true, sonda: "ok", jaAprovado: false })).toBe("aprovado")
    expect(classificarPc({ temToken: true, online: true, sonda: "falha", jaAprovado: true })).toBe("incerto")
  })
  it("o código curto é só a dica de 4 caracteres", () => {
    expect(codigoCurto("oos_" + "a".repeat(39) + "K7q2")).toBe("K7q2")
  })
  it("mínimo de 1,2 s na tela, nunca negativo", () => {
    expect(faltaParaMinimo(1000, 1500)).toBe(700)
    expect(faltaParaMinimo(1000, 5000)).toBe(0)
  })
  it("a marca de 'já aceito' só vale true de verdade", () => {
    expect(sanitize({ pcSeenApproved: "sim" }).pcSeenApproved).toBe(false)
    expect(sanitize({ pcSeenApproved: true }).pcSeenApproved).toBe(true)
  })
})
