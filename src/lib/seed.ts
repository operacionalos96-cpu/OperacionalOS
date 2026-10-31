import { addDays, setHours, startOfMonth, subMonths } from "date-fns"
import { toDateKey } from "@/lib/format"
import { monthKey } from "@/lib/domain/rules"
import { templateMap } from "@/lib/mindmap-templates"
import type { Activity, FinanceSettings, Lead, MindMap, Note, Stage, Task, Temperature, Transaction } from "@/lib/domain/types"

/**
 * Dados de exemplo de uma pequena consultoria/agência B2B.
 * Todas as datas são relativas a `now`, então a demo sempre parece atual.
 */
export function createSeed(now: Date) {
  // Ids fixos dos fundadores: o exemplo não pode depender de quem já carregou do banco
  // (no modo demo só existe um membro e metade das tarefas ficaria sem dono).
  const a = "u1"
  const b = "u2"
  const day = (offset: number) => toDateKey(addDays(now, offset))
  const at = (offset: number, hour = 10) => setHours(addDays(now, offset), hour).toISOString()

  type LeadSeed = [
    name: string,
    company: string,
    stage: Stage,
    owner: string,
    value: number,
    temp: Temperature | undefined,
    action: string,
    due: number,
    lastActivity: number,
    created: number,
  ]
  const leadSeeds: LeadSeed[] = [
    ["Mariana Costa", "Clínica Vida Plena", "novo", a, 4800, "morno", "Primeira ligação de apresentação", 0, -1, -1],
    ["Rafael Nunes", "Nunes Engenharia", "novo", b, 12000, "frio", "Enviar mensagem no LinkedIn", 2, -2, -2],
    ["Patrícia Lima", "Studio Lima Arquitetura", "novo", a, 6500, undefined, "Pesquisar site e redes antes do contato", 1, -3, -3],
    ["Bruno Alves", "AgroSul Insumos", "contato", b, 18000, "quente", "Agendar reunião de diagnóstico", -2, -4, -10],
    ["Camila Rocha", "Rocha & Filhos Contabilidade", "contato", a, 7200, "morno", "Retornar sobre dúvidas de escopo", 3, -1, -8],
    ["Diego Martins", "Pet Center Martins", "contato", b, 3900, "frio", "Tentar novo contato por WhatsApp", -5, -12, -20],
    ["Fernanda Souza", "Escola Crescer", "proposta", a, 22000, "quente", "Ligar para tirar dúvidas da proposta", 0, -2, -15],
    ["Gustavo Pereira", "Pereira Logística", "proposta", b, 35000, "morno", "Follow-up da proposta enviada", -1, -9, -25],
    ["Helena Duarte", "Duarte Advogados", "proposta", a, 9800, "morno", "Ajustar proposta com novo escopo", 4, -3, -18],
    ["Igor Tavares", "Tavares Móveis", "negociacao", b, 27000, "quente", "Enviar contrato para assinatura", 1, -1, -30],
    ["Juliana Ramos", "Ramos Odontologia", "negociacao", a, 14500, "quente", "Negociar condição de pagamento", 0, -3, -22],
    ["Lucas Ferreira", "Ferreira Tech", "ganho", a, 16000, "quente", "Kickoff do projeto", 2, -6, -40],
    ["Marcos Silva", "Padaria Pão Nosso", "perdido", b, 4200, "frio", "—", 0, -14, -35],
  ]

  const leads: Lead[] = leadSeeds.map(([name, company, stage, ownerId, value, temperature, text, due, last, created], i) => ({
    id: `lead-${i + 1}`,
    name,
    company,
    stage,
    ownerId,
    valueCents: value * 100,
    temperature,
    nextAction: { text, dueDate: day(due) },
    lastActivityAt: at(last, 15),
    createdAt: at(created, 9),
    ...(stage === "ganho" ? { closedAt: at(-6, 16) } : {}),
    ...(stage === "perdido" ? { closedAt: at(-14, 11), lostReason: "Optou por fazer internamente" } : {}),
  }))

  const activities: Activity[] = []
  leads.forEach((l, i) => {
    const created = leadSeeds[i][9]
    const last = leadSeeds[i][8]
    activities.push({ id: `act-${l.id}-0`, leadId: l.id, kind: "criado", text: "Lead criado", authorId: l.ownerId, createdAt: l.createdAt })
    if (last - created > 1) {
      activities.push({
        id: `act-${l.id}-1`,
        leadId: l.id,
        kind: "ligacao",
        text: "Conversa inicial. Entendeu a proposta de valor e pediu mais detalhes.",
        authorId: l.ownerId,
        createdAt: at(Math.round((created + last) / 2), 14),
      })
    }
    activities.push({
      id: `act-${l.id}-2`,
      leadId: l.id,
      kind: l.stage === "novo" ? "nota" : "mensagem",
      text: l.stage === "novo" ? "Indicação de um cliente atual." : "Mandou mensagem confirmando interesse.",
      authorId: l.ownerId,
      createdAt: l.lastActivityAt,
    })
  })

  const task = (id: number, title: string, ownerId: string, due?: number, leadId?: string, done = false): Task => ({
    id: `task-${id}`,
    title,
    ownerId,
    dueDate: due === undefined ? undefined : day(due),
    done,
    doneAt: done ? at(-1, 17) : undefined,
    leadId,
    createdAt: at(-7),
  })
  const tasks: Task[] = [
    task(1, "Preparar apresentação para Escola Crescer", a, 0, "lead-7"),
    task(2, "Emitir nota fiscal Ferreira Tech", b, -2, "lead-12"),
    task(3, "Atualizar modelo de proposta comercial", a, 2),
    task(4, "Revisar custos com ferramentas", b, 4),
    task(5, "Gravar case de sucesso com cliente", a, 9),
    task(6, "Organizar pasta de contratos", b),
    task(7, "Pagar DAS do mês", b, -1),
    task(8, "Montar lista de 20 prospects da região", a, 1),
    task(9, "Responder e-mail da contabilidade", a, -3, undefined, true),
  ]

  let n = 1
  const tx = (type: Transaction["type"], value: number, category: string, description: string, date: string, leadId?: string): Transaction => ({
    id: `tx-${n}`,
    type,
    amountCents: Math.round(value * 100),
    category,
    description,
    date,
    leadId,
    createdById: n++ % 2 ? a : b,
  })
  const transactions: Transaction[] = []
  // Três meses de recorrência (mensalidades + custos fixos) em dias fixos do mês.
  for (const monthsBack of [2, 1, 0]) {
    const start = startOfMonth(subMonths(now, monthsBack))
    const on = (dayOfMonth: number) => toDateKey(addDays(start, dayOfMonth - 1))
    transactions.push(
      tx("entrada", 8500, "Serviços", "Mensalidade — Clínica Aurora", on(5)),
      tx("entrada", 6200, "Serviços", "Mensalidade — Grupo Solar", on(10)),
      tx("saida", 890, "Ferramentas", "Softwares e assinaturas", on(3)),
      tx("saida", 1500, "Marketing", "Anúncios", on(12)),
      tx("saida", 7000, "Pessoal", "Pró-labore", on(5)),
      tx("saida", 1240, "Impostos", "DAS Simples Nacional", on(20)),
    )
  }
  transactions.push(
    tx("entrada", 12000, "Serviços", "Projeto site — Construtora Base", day(-70)),
    tx("entrada", 9500, "Serviços", "Consultoria — Mercado Bom Preço", day(-45)),
    tx("saida", 2300, "Operacional", "Notebook (parcela)", day(-40)),
    tx("entrada", 16000, "Serviços", "Ferreira Tech — entrada do projeto", day(-6), "lead-12"),
    tx("saida", 320, "Operacional", "Coworking — diárias", day(-3)),
  )
  // mantém só lançamentos até hoje
  const txs = transactions.filter((t) => t.date <= day(0))

  const notes: Note[] = [
    {
      id: "note-1",
      title: "Roteiro da ligação de descoberta",
      body: "1. Contexto: como funciona hoje?\n2. Dor principal e quanto custa\n3. Quem decide e quando\n4. Orçamento aproximado\n5. Próximo passo combinado (sempre sair com data!)",
      authorId: a,
      updatedAt: at(-5),
    },
    {
      id: "note-2",
      title: "Objeções comuns e respostas",
      body: "\"Está caro\" → mostrar retorno em 3 meses com o case da Ferreira Tech.\n\"Vou pensar\" → perguntar o que falta para decidir e marcar retorno.",
      authorId: b,
      updatedAt: at(-2),
    },
    {
      id: "note-3",
      title: "Reunião de segunda — pauta fixa",
      body: "- Olhar o Dashboard juntos (5 min)\n- Leads parados: decidir avançar ou arquivar\n- Caixa e meta do mês\n- Prioridades da semana de cada um",
      authorId: a,
      updatedAt: at(-7),
    },
  ]

  const monthStart = startOfMonth(now)
  const financeSettings: FinanceSettings = {
    openingBalanceCents: 18_000_00,
    monthlyGoals: {
      [monthKey(monthStart)]: 45_000_00,
      [monthKey(addDays(monthStart, -1))]: 40_000_00,
    },
  }

  const mindMaps: MindMap[] = [{ ...templateMap("estrategia"), id: "map-1", updatedAt: at(-3) }]

  return { leads, activities, tasks, notes, transactions: txs, financeSettings, mindMaps }
}
