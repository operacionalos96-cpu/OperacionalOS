import { describe, expect, it } from "vitest"
import {
  CAPTURE_SCHEMA,
  buildCaptureUserMessage,
  buildTaskTitle,
  dateKeyIn,
  draftToTaskInput,
  draftsToCreate,
  matchLabel,
  matchLead,
  matchMember,
  matchProject,
  normalizeArea,
  normalizeCapture,
  parseCaptureOutput,
  parseTaskTitle,
  resolveDue,
  sanitizeContext,
  validateCaptureRequest,
  withTitleArea,
  type CaptureContext,
  type CaptureDraft,
  type CapturedTask,
  type DueKind,
  type DueSpec,
  type Weekday,
} from "./smart-capture"

/** Quinta-feira, 05/11/2026. */
const REF = "2026-11-05"

const CTX: CaptureContext = {
  projects: ["HZK Company", "Afrodite-se", "Site da Clínica"],
  members: [
    { id: "u1", name: "Gabriel" },
    { id: "u2", name: "Igor" },
  ],
  leads: [
    { id: "l1", name: "Fernanda Souza", company: "Escola Crescer" },
    { id: "l2", name: "Bruno Alves", company: "AgroSul Insumos" },
    { id: "l3", name: "Bruno Lima", company: "Lima Contábil" },
  ],
  labels: ["Prospecção", "bug"],
}

/** Uma tarefa como o modelo devolve (o schema exige todos os campos). */
function raw(over: Record<string, unknown>): Record<string, unknown> {
  return {
    area: "DESENVOLVIMENTO",
    delivery: "Vídeo do funil",
    action: "Corrigir bug",
    project_hint: null,
    due: { kind: "none", weekday: null, days: null, day: null, month: null, year: null, text: null },
    assignees: [],
    mentioned_people: [],
    lead_hint: null,
    priority_explicit: null,
    priority_suggested: null,
    priority_reason: null,
    tags: [],
    recurrence: "none",
    description: "",
    source_excerpt: "",
    ...over,
  }
}
const due = (kind: DueKind, extra: Partial<DueSpec> = {}): DueSpec => ({ kind, weekday: null, days: null, day: null, month: null, year: null, text: null, ...extra })

describe("captura inteligente — datas no fuso de São Paulo", () => {
  it("usa o dia de São Paulo, não o do servidor (UTC)", () => {
    // 02:30 UTC do dia 6 = 23:30 do dia 5 em São Paulo.
    expect(dateKeyIn(new Date("2026-11-06T02:30:00Z"))).toBe("2026-11-05")
    expect(dateKeyIn(new Date("2026-11-06T03:30:00Z"))).toBe("2026-11-06")
  })

  it("resolve hoje, amanhã, dias da semana e próxima semana a partir da quinta 05/11", () => {
    expect(resolveDue(due("today"), REF)).toEqual({ dueDate: "2026-11-05", unclear: false })
    expect(resolveDue(due("tomorrow"), REF).dueDate).toBe("2026-11-06")
    expect(resolveDue(due("day_after_tomorrow"), REF).dueDate).toBe("2026-11-07")
    expect(resolveDue(due("in_days", { days: 3 }), REF).dueDate).toBe("2026-11-08")
    expect(resolveDue(due("weekday", { weekday: "sexta" }), REF).dueDate).toBe("2026-11-06")
    expect(resolveDue(due("weekday", { weekday: "quinta" }), REF).dueDate).toBe("2026-11-05")
    expect(resolveDue(due("weekday", { weekday: "segunda" }), REF).dueDate).toBe("2026-11-09")
    expect(resolveDue(due("next_week"), REF).dueDate).toBe("2026-11-09")
    expect(resolveDue(due("next_week_weekday", { weekday: "sexta" }), REF).dueDate).toBe("2026-11-13")
    expect(resolveDue(due("next_week_weekday", { weekday: "domingo" }), REF).dueDate).toBe("2026-11-15")
  })

  it("próxima semana vista de uma segunda: a segunda seguinte, não hoje", () => {
    expect(resolveDue(due("next_week"), "2026-11-09").dueDate).toBe("2026-11-16")
  })

  it("datas explícitas: sem ano vai para o próximo se já passou; data impossível fica para revisão", () => {
    expect(resolveDue(due("date", { day: 10, month: 12 }), REF).dueDate).toBe("2026-12-10")
    expect(resolveDue(due("date", { day: 1, month: 3 }), REF).dueDate).toBe("2027-03-01")
    expect(resolveDue(due("date", { day: 1, month: 3, year: 2026 }), REF).dueDate).toBe("2026-03-01")
    expect(resolveDue(due("date", { day: 31, month: 2 }), REF)).toEqual({ unclear: true })
    expect(resolveDue(due("weekday", { weekday: "feriado" as Weekday }), REF)).toEqual({ unclear: true })
    expect(resolveDue(due("unclear"), REF)).toEqual({ unclear: true })
    expect(resolveDue(due("none"), REF)).toEqual({ unclear: false })
  })
})

describe("captura inteligente — título ÁREA / Entrega - Ação", () => {
  it("monta no padrão com capitalização natural", () => {
    expect(buildTaskTitle("DESENVOLVIMENTO", "vídeo do funil", "corrigir bug")).toBe("DESENVOLVIMENTO / Vídeo do funil - Corrigir bug")
    expect(buildTaskTitle("DESIGN", "MVP da Lotofácil", "Refinar design.")).toBe("DESIGN / MVP da Lotofácil - Refinar design")
    expect(buildTaskTitle("GESTÃO", "Prospecção", "")).toBe("GESTÃO / Prospecção")
  })

  it("tira separadores de dentro das partes e corta título longo", () => {
    expect(buildTaskTitle("CONTEÚDO", "Posts / stories - semana", "Criar")).toBe("CONTEÚDO / Posts e stories, semana - Criar")
    const t = buildTaskTitle("COMERCIAL", "a".repeat(200), "Revisar")
    expect(t.length).toBeLessThanOrEqual(100)
    expect(t.endsWith("… - Revisar")).toBe(true)
  })

  it("lê o título, troca a área e reconhece área com ou sem acento", () => {
    expect(parseTaskTitle("DESENVOLVIMENTO / Vídeo do funil - Corrigir bug")).toEqual({ area: "DESENVOLVIMENTO", delivery: "Vídeo do funil", action: "Corrigir bug" })
    expect(parseTaskTitle("Corrigir o bug")).toBeNull()
    expect(parseTaskTitle("Desenvolvimento / x - y")).toBeNull()
    expect(withTitleArea("DESENVOLVIMENTO / Vídeo do funil - Corrigir bug", "OPERAÇÃO")).toBe("OPERAÇÃO / Vídeo do funil - Corrigir bug")
    expect(withTitleArea("Corrigir o bug", "GESTÃO")).toBe("GESTÃO / Corrigir o bug")
    expect(normalizeArea("conteudo")).toBe("CONTEÚDO")
    expect(normalizeArea("MARKETING")).toBeUndefined()
  })
})

describe("captura inteligente — só registros reais e sem ambiguidade", () => {
  it("projeto: palavra inteira e correspondência única", () => {
    expect(matchProject("HZK", CTX.projects)).toEqual({ status: "ok", value: "HZK Company" })
    expect(matchProject("afrodite-se", CTX.projects)).toEqual({ status: "ok", value: "Afrodite-se" })
    expect(matchProject("HZK", ["HZK Company", "HZK Labs"])).toEqual({ status: "ambiguous", candidates: ["HZK Company", "HZK Labs"] })
    expect(matchProject("HZ", CTX.projects)).toEqual({ status: "none" })
    expect(matchProject("Celso", CTX.projects)).toEqual({ status: "none" })
    expect(matchProject(null, CTX.projects)).toEqual({ status: "none" })
  })

  it("pessoa e lead: nome único; dois iguais = não escolhe", () => {
    expect(matchMember("igor", CTX.members)).toEqual({ status: "ok", value: { id: "u2", name: "Igor" } })
    expect(matchMember("Iole", CTX.members)).toEqual({ status: "none" })
    expect(matchMember("Ana", [{ id: "a", name: "Ana Souza" }, { id: "b", name: "Ana Lima" }]).status).toBe("ambiguous")
    expect(matchLead("Escola Crescer", CTX.leads)).toMatchObject({ status: "ok", value: { id: "l1" } })
    expect(matchLead("Bruno", CTX.leads).status).toBe("ambiguous")
    expect(matchLead("Bo", CTX.leads).status).toBe("none")
  })

  it("etiqueta: reaproveita a grafia existente ou marca como nova", () => {
    expect(matchLabel("prospeccao", CTX.labels)).toEqual({ label: "Prospecção", isNew: false })
    expect(matchLabel("#Funil", CTX.labels)).toEqual({ label: "funil", isNew: true })
  })
})

describe("captura inteligente — resposta do modelo", () => {
  it("aceita ```json e texto em volta; recusa o ilegível", () => {
    expect(parseCaptureOutput('```json\n{"tasks":[{"area":"DESIGN"}]}\n```')).toEqual([{ area: "DESIGN" }])
    expect(parseCaptureOutput('Aqui está: {"tasks": []} fim')).toEqual([])
    expect(parseCaptureOutput("não é json")).toBeNull()
    expect(parseCaptureOutput({ itens: [] })).toBeNull()
    expect(parseCaptureOutput({ tasks: [1, null, { area: "x" }] })).toEqual([{ area: "x" }])
  })

  it("exemplo da seção 8: duas tarefas, projeto HZK, prazo hoje, sem responsável e sem prioridade automática", () => {
    // "Hoje preciso corrigir o bug do vídeo do funil de prospecção da HZK e organizar a estrutura da prospecção."
    const out = normalizeCapture(
      [
        raw({ project_hint: "HZK", due: due("today", { text: "Hoje" }), priority_suggested: "alta", priority_reason: "Bug em funil ativo", tags: ["bug", "funil"], description: "Corrigir o problema no vídeo do funil de prospecção.", source_excerpt: "corrigir o bug do vídeo do funil de prospecção da HZK" }),
        raw({ area: "GESTÃO", delivery: "Prospecção", action: "Estruturar operação", project_hint: "HZK", due: due("today", { text: "Hoje" }), tags: ["prospecção"], description: "Organizar a estrutura da operação de prospecção." }),
      ],
      CTX,
      REF,
    )
    expect(out.map((t) => t.title)).toEqual(["DESENVOLVIMENTO / Vídeo do funil - Corrigir bug", "GESTÃO / Prospecção - Estruturar operação"])
    for (const t of out) {
      expect(t.projectName).toBe("HZK Company")
      expect(t.dueDate).toBe("2026-11-05")
      expect(t.assigneeIds).toEqual([])
      expect(t.priority).toBeUndefined()
      expect(t.review).toEqual([])
    }
    expect(out[0].prioritySuggested).toBe("alta")
    expect(out[0].labels).toEqual(["bug", "funil"])
    expect(out[0].newLabels).toEqual(["funil"])
    expect(out[1].labels).toEqual(["Prospecção"])
  })

  it("texto da seção 5: blocos por projeto, prazo por tarefa e pessoa citada não vira responsável", () => {
    const out = normalizeCapture(
      [
        raw({ project_hint: "HZK", due: due("today", { text: "Hoje" }) }),
        raw({ delivery: "Agente de prospecção", project_hint: "HZK", due: due("today", { text: "Hoje" }) }),
        raw({ area: "COMERCIAL", delivery: "Reunião com Iole", action: "Realizar reunião", project_hint: "HZK", due: due("weekday", { weekday: "sexta", text: "Sexta" }), mentioned_people: ["Iole"] }),
        raw({ area: "DESENVOLVIMENTO", delivery: "Páginas de vendas do mapa gratuito e pago", action: "Criar", project_hint: "Afrodite-se" }),
        raw({ area: "DESIGN", delivery: "MVP da Lotofácil", action: "Refinar design", project_hint: "Celso", description: "Refinar o design do MVP da Lotofácil e entregar para avaliação." }),
      ],
      CTX,
      REF,
    )
    expect(out).toHaveLength(5)
    expect(out.slice(0, 2).map((t) => t.dueDate)).toEqual(["2026-11-05", "2026-11-05"])
    expect(out[2]).toMatchObject({ dueDate: "2026-11-06", dueText: "Sexta", assigneeIds: [], mentionedPeople: ["Iole"], projectName: "HZK Company" })
    expect(out[3]).toMatchObject({ projectName: "Afrodite-se" })
    expect(out[3].dueDate).toBeUndefined()
    // "Celso" não é projeto cadastrado: fica sem projeto e pede escolha.
    expect(out[4]).toMatchObject({ projectHint: "Celso", review: ["project"] })
    expect(out[4].projectName).toBeUndefined()
  })

  it("responsável só se designado e existente; lead só se inequívoco; prioridade explícita preenche", () => {
    const [a, b] = normalizeCapture(
      [
        raw({ assignees: ["Igor", "Pedro"], lead_hint: "Escola Crescer", priority_explicit: "urgente", priority_suggested: "baixa", recurrence: "semanal" }),
        raw({ delivery: "Proposta", action: "Revisar", lead_hint: "Bruno" }),
      ],
      CTX,
      REF,
    )
    expect(a).toMatchObject({ assigneeIds: ["u2"], unresolvedAssignees: ["Pedro"], leadId: "l1", priority: "urgente", recurrence: "semanal" })
    expect(a.prioritySuggested).toBeUndefined()
    expect(a.review).toEqual(["assignee"])
    expect(b.leadId).toBeUndefined()
    expect(b.leadCandidates?.map((c) => c.id)).toEqual(["l2", "l3"])
    expect(b.review).toEqual(["lead"])
  })

  it("área inválida vai para revisão; proposta vazia e repetida some; prazo confuso pede revisão", () => {
    const out = normalizeCapture(
      [
        raw({ area: "MARKETING", delivery: "Campanha", action: "Criar", due: due("unclear", { text: "logo" }) }),
        raw({ delivery: "", action: "" }),
        raw({}),
        raw({}),
      ],
      CTX,
      REF,
    )
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ title: "GESTÃO / Campanha - Criar", dueText: "logo" })
    expect(out[0].dueDate).toBeUndefined()
    expect(out[0].review.sort()).toEqual(["due", "title"])
  })
})

describe("captura inteligente — pedido, contexto e criação", () => {
  it("valida o texto do pedido", () => {
    expect(validateCaptureRequest({ text: "  oi \r\n" })).toEqual({ text: "oi" })
    expect(validateCaptureRequest({ text: "   " })).toBeNull()
    expect(validateCaptureRequest({ text: "a".repeat(6001) })).toBeNull()
    expect(validateCaptureRequest(null)).toBeNull()
  })

  it("contexto do modo demonstração: só campos conhecidos e tipos certos", () => {
    const ctx = sanitizeContext({ projects: ["HZK", 3], members: [{ id: "u1", name: "Gabriel", email: "x" }, { id: 2 }], leads: [{ id: "l", name: "A", company: "" }], extra: 1 })
    expect(ctx).toEqual({ projects: ["HZK"], labels: [], members: [{ id: "u1", name: "Gabriel" }], leads: [{ id: "l", name: "A", company: undefined }] })
  })

  it("mensagem para o modelo leva data com dia da semana, listas e o texto delimitado", () => {
    const msg = buildCaptureUserMessage("Sexta reunião com Iole", CTX, REF)
    expect(msg).toContain("2026-11-05 (quinta-feira)")
    expect(msg).toContain("- HZK Company")
    expect(msg).toContain("- Fernanda Souza · Escola Crescer")
    expect(msg).toContain("<texto>\nSexta reunião com Iole\n</texto>")
  })

  it("schema aceito pela saída estruturada: todo objeto fechado e com todos os campos obrigatórios", () => {
    const check = (node: unknown): void => {
      if (!node || typeof node !== "object") return
      const n = node as Record<string, unknown>
      if (n.type === "object") {
        expect(n.additionalProperties).toBe(false)
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort())
      }
      Object.values(n).forEach((v) => (Array.isArray(v) ? v.forEach(check) : check(v)))
    }
    check(CAPTURE_SCHEMA)
  })

  const base: CapturedTask = { title: "GESTÃO / A - B", area: "GESTÃO", assigneeIds: [], unresolvedAssignees: [], mentionedPeople: [], labels: [], newLabels: [], description: "", sourceExcerpt: "", review: [] }
  const draft = (key: string, over: Partial<CaptureDraft> = {}): CaptureDraft => ({ ...base, key, selected: true, status: "idle", ...over })

  it("sem responsável informado fica com quem cria; vários = dono + colaboradores", () => {
    expect(draftToTaskInput(base, "u1")).toMatchObject({ ownerId: "u1", collaborators: undefined, createdById: "u1" })
    expect(draftToTaskInput({ ...base, assigneeIds: ["u2", "u1", "u2"] }, "u1")).toMatchObject({ ownerId: "u2", collaborators: ["u1"] })
  })

  it("criar de novo pula as já criadas e as que estão gravando (não duplica)", () => {
    const drafts = [draft("a", { status: "created" }), draft("b", { status: "error" }), draft("c", { selected: false }), draft("d", { status: "saving" }), draft("e", { title: "  " })]
    expect(draftsToCreate(drafts, true).map((d) => d.key)).toEqual(["b"])
    expect(draftsToCreate(drafts, false).map((d) => d.key)).toEqual(["b", "c"])
  })
})
