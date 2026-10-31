/**
 * Áreas da HZK (docs/hzk-os-blueprint.md › "Pessoas, áreas e decisões").
 * Cada área tem um dono; quem cria um item escolhe a área e o dono vem dela.
 * Regras puras (sem tela nem banco), testadas em areas.test.ts.
 */

/** Referência a uma pessoa: um membro (team_id) ou um cargo resolvido na hora (ex.: a CEO). */
export type PersonRef = { memberId: string } | { role: "ceo" }

export interface Area {
  id: string
  name: string
  description?: string
  owner?: PersonRef
  supportIds?: string[]
  approver?: PersonRef
  /** Observação de aprovação ("contrato vai para CEO"). */
  approvalNote?: string
  order: number
}

/** Quem é quem agora: a CEO é quem tem o cargo "ceo" (Equipe › Cargos); founders têm o cargo "founder". */
export interface PeopleContext {
  ceoId?: string
  founderIds: string[]
}

/** Cargos atribuídos (member_roles) → quem é CEO e quem é founder. */
export function peopleFrom(memberRoles: { memberId: string; roleId: string }[]): PeopleContext {
  return {
    ceoId: memberRoles.find((r) => r.roleId === "ceo")?.memberId,
    founderIds: [...new Set(memberRoles.filter((r) => r.roleId === "founder").map((r) => r.memberId))],
  }
}

export function resolvePerson(ref: PersonRef | undefined, people: PeopleContext): string | undefined {
  if (!ref) return undefined
  return "memberId" in ref ? ref.memberId : people.ceoId
}

/** Dono da área agora. Área da CEO sem CEO definida = sem dono (o item fica na caixa de entrada). */
export function ownerOfArea(area: Area | undefined, people: PeopleContext): string | undefined {
  return resolvePerson(area?.owner, people)
}

/**
 * Proposta inicial do blueprint, com as respostas de 31/10/2026:
 * Founder A = Gabriel (u1): conteúdo, marca e roteiros. Founder B = Igor (u2): comercial, lançamentos e tráfego.
 * Editável em Configurações. O mesmo conjunto é semeado no banco pela migration 0021.
 */
const CEO: PersonRef = { role: "ceo" }
const FOUNDER_A: PersonRef = { memberId: "u1" }
const FOUNDER_B: PersonRef = { memberId: "u2" }

export const DEFAULT_AREAS: Area[] = [
  { id: "financeiro", name: "Financeiro", description: "Caixa, pagamentos, repasses de coprodução", owner: CEO, approver: CEO, order: 1 },
  { id: "contratos", name: "Contratos e jurídico", description: "Contratos com parceiros e coprodutores", owner: CEO, approver: CEO, approvalNote: "Apoio do founder do parceiro", order: 2 },
  { id: "estrategia", name: "Estratégia e metas", description: "Metas e prioridades do trimestre", owner: CEO, supportIds: ["u1", "u2"], approver: CEO, order: 3 },
  { id: "pessoas", name: "Pessoas", description: "Contratação e rotina do time", owner: CEO, supportIds: ["u1", "u2"], approver: CEO, order: 4 },
  { id: "conteudo", name: "Conteúdo HZK e marca", description: "Instagram e marca da HZK", owner: FOUNDER_A, approver: FOUNDER_A, order: 5 },
  { id: "roteiros", name: "Roteiros e posicionamento", description: "Roteiros, falas e posicionamento", owner: FOUNDER_A, supportIds: ["u2"], approver: FOUNDER_A, approvalNote: "Com revisão do outro founder", order: 6 },
  { id: "comercial", name: "Comercial e coprodutores", description: "Vendas e novos coprodutores", owner: FOUNDER_B, supportIds: ["u1"], approver: FOUNDER_B, approvalNote: "Contrato vai para a CEO", order: 7 },
  { id: "lancamentos", name: "Lançamentos e coproduzidos", description: "Operação dos produtos coproduzidos", owner: FOUNDER_B, approver: FOUNDER_B, order: 8 },
  { id: "trafego", name: "Tráfego, funis e dados", description: "Anúncios, funis e métricas", owner: FOUNDER_B, approver: FOUNDER_B, approvalNote: "Verba vai para a CEO", order: 9 },
]
