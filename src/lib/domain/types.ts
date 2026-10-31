/** Datas são sempre strings ISO. Dinheiro é sempre em centavos (inteiro). */
export type ISODate = string

export interface User {
  id: string
  name: string
  initials: string
  color: string
}

export type Stage = "novo" | "contato" | "proposta" | "negociacao" | "ganho" | "perdido"
export type Temperature = "quente" | "morno" | "frio"

export interface NextAction {
  text: string
  dueDate: ISODate
}

export interface Lead {
  id: string
  name: string
  company?: string
  contact?: string
  stage: Stage
  ownerId: string
  valueCents: number
  temperature?: Temperature
  nextAction: NextAction
  lastActivityAt: ISODate
  createdAt: ISODate
  closedAt?: ISODate
  lostReason?: string
  /** Produto de interesse (rastreio de leads por produto). */
  productId?: string
  /** Site atual do lead (só http/https). */
  website?: string
  // ---- AI Office / prospecção (todos opcionais: leads antigos continuam válidos) ----
  segment?: string
  city?: string
  /** De onde veio: "planilha", "prospector", "indicacao"… */
  source?: string
  /** O que a análise (IA ou planilha) concluiu. NUNCA é sobrescrito pela decisão humana. */
  analysis?: LeadAnalysis
  /** Decisão humana sobre o lead (separada da análise, para comparar depois). */
  review?: LeadReview
  contactStatus?: "pending" | "contacted"
  firstContactAt?: ISODate
  firstContactMessage?: string
  firstContactChannel?: "whatsapp" | "email" | "telefone" | "outro"
  /** Segmento e cidade lidos no site da empresa (não sobrescreve segment/city, que são correções humanas). */
  siteInfo?: SiteInfo
  /** Funil de WhatsApp (1ª mensagem + follow-ups). Ver src/lib/domain/funnel.ts. */
  funnel?: { step: number; lastSentAt?: string; history: { step: number; at: string; by?: string }[]; repliedAt?: string; stopped?: boolean }
  /** Vídeo de análise personalizado (gerado só quando o lead chega nessa parte do funil). Ver src/lib/domain/prospect-video.ts. */
  video?: import("./prospect-video").LeadVideo
}

export interface SiteInfo {
  segment?: string
  city?: string
  uf?: string
  confidence?: "alta" | "media" | "baixa"
  evidence?: string
  checkedAt: ISODate
  /** Por que não deu para ler (site fora do ar, sem site…). */
  error?: string
}

export interface LeadAnalysis {
  /** 0–10 (nota do site). */
  siteScore?: number
  summary?: string
  problems?: string[]
  opportunity?: string
  /** 0–10 (vale a pena prospectar?). */
  qualificationScore?: number
  analyzedAt?: ISODate
  /** Quem analisou: "planilha", id do agente ("web-analyst"), id de pessoa… */
  analyzedBy?: string
}

export type ReviewStatus = "pending" | "approved" | "rejected"

export interface LeadReview {
  status: ReviewStatus
  approvedAt?: ISODate
  approvedBy?: string
  rejectedAt?: ISODate
  rejectedBy?: string
  rejectionReason?: string
  rejectionNotes?: string
}

export type ActivityKind = "nota" | "ligacao" | "reuniao" | "mensagem" | "estagio" | "acao_concluida" | "criado"

export interface Activity {
  id: string
  leadId: string
  kind: ActivityKind
  text: string
  authorId: string
  createdAt: ISODate
}

export type Priority = "urgente" | "alta" | "media" | "baixa"
export type Recurrence = "diaria" | "semanal" | "mensal"

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  ownerId: string
  dueDate?: ISODate
  done: boolean
  doneAt?: ISODate
  leadId?: string
  createdAt: ISODate
  /** Campos opcionais: tarefas antigas continuam válidas sem migração. */
  priority?: Priority
  labels?: string[]
  description?: string
  checklist?: ChecklistItem[]
  /** Ao concluir, cria a próxima ocorrência automaticamente. */
  recurrence?: Recurrence
  /** Tarefa colaborativa: outras pessoas também responsáveis (além de ownerId). */
  collaborators?: string[]
  /** Em andamento (sem valor = a fazer; concluída usa `done`). */
  status?: "andamento"
  /** Tarefas recorrentes: id da primeira da série (as próximas nascem com ele). */
  seriesId?: string
  /** Nome do projeto para agrupamento transversal sem exigir cadastro de projeto novo. */
  projectName?: string

  // ---- HZK OS: item único (docs/hzk-os-blueprint.md, src/lib/domain/items.ts) ----
  // A tabela de tarefas guarda todos os tipos de item. Sem `kind` = tarefa (dados antigos valem).
  /** Tipo do item: tarefa, ideia, decisão ou nota rápida. */
  kind?: "task" | "idea" | "decision" | "note"
  /** Área da empresa (src/lib/domain/areas.ts); define o dono automaticamente. */
  areaId?: string
  /** Na caixa de entrada: capturado e ainda não triado. */
  inbox?: boolean
  /** Quem capturou/criou (o dono pode ser outra pessoa). */
  createdById?: string
  /** Dia em que a pessoa planejou fazer (rituais, fase 2). */
  plannedFor?: ISODate
  /** Tempo estimado, em minutos. */
  estimateMin?: number
  /** Posição no plano do dia. */
  order?: number
  /** De onde veio: captura rápida, triagem, automação… */
  origin?: "captura" | "triagem" | "automacao" | "manual"
  /** Arquivado na triagem (sai das listas, fica no histórico). */
  archivedAt?: ISODate
  /** Quando foi triado (saiu da caixa de entrada). */
  triagedAt?: ISODate
  /** Só para kind = "decision". */
  decision?: DecisionData
}

/** Decisão (tarefa = algo a fazer; decisão = algo a escolher). Regras em src/lib/domain/items.ts. */
export interface DecisionData {
  context?: string
  options: { id: string; label: string }[]
  /** Opção recomendada por quem propõe. */
  recommendation?: string
  /** Porta de mão dupla (reversível) ou de mão única (irreversível). */
  door: "reversivel" | "irreversivel"
  /** O que a decisão envolve — define se vai para a CEO. */
  involves: ("dinheiro" | "contrato" | "contratacao" | "estrategia")[]
  amountCents?: number
  /** Áreas de outros donos que a decisão afeta (precisam dar ok). */
  affectsAreaIds?: string[]
  /** Quem decide (o primeiro, para exibir). */
  deciderId?: string
  /** Todos que podem decidir (ex.: os dois founders enquanto não há CEO). */
  deciderIds?: string[]
  deciderReason?: string
  status: "pendente" | "decidida" | "recusada" | "mais_contexto"
  /** Opção escolhida (id) ou texto livre. */
  outcome?: string
  reason?: string
  decidedAt?: ISODate
  decidedBy?: string
}

export interface Note {
  id: string
  title: string
  body: string
  authorId: string
  updatedAt: ISODate
  /** Vínculos opcionais para manter notas de reunião junto das atividades. */
  taskId?: string
  /** Várias tarefas relacionadas (união com taskId, mantido por compatibilidade). */
  taskIds?: string[]
  projectName?: string
}

export type TransactionType = "entrada" | "saida"

export interface Transaction {
  id: string
  type: TransactionType
  amountCents: number
  category: string
  description: string
  date: ISODate
  leadId?: string
  /** Produto a que a entrada/saída pertence (rastreio financeiro por produto). */
  productId?: string
  createdById: string
  /** Veio sozinho de uma integração ("hotmart", "kiwify"…). Sem valor = lançado à mão. */
  source?: string
  /** undefined/realizado = movimento efetivo; previsto = compromisso futuro. */
  status?: "previsto" | "realizado"
  dueDate?: ISODate
  /** Valor original do compromisso quando houve pagamento/recebimento parcial (o restante fica em amountCents). */
  originalCents?: number
  projectName?: string
}

export interface FinanceSettings {
  openingBalanceCents: number
  /** chave "YYYY-MM" → meta de faturamento (entradas) em centavos */
  monthlyGoals: Record<string, number>
  /** Gasto acima deste valor vai para a CEO decidir. Vazio = valor não define (só a natureza da decisão). */
  ceoApprovalLimitCents?: number | null
}

export interface MindMapNode {
  id: string
  label: string
  x: number
  y: number
  taskId?: string
  leadId?: string
  /** Etiqueta/fase (mesma cor das etiquetas das tarefas). */
  tag?: string
  /** Matiz escolhido à mão (0–360). Sem ele, a cor vem da etiqueta. */
  hue?: number
  /** Explicação do que é esta fase/ideia. */
  description?: string
  /** Tamanho definido pelo usuário (px). Sem ele, o item se ajusta ao texto. */
  width?: number
  height?: number
  /** Andamento do processo. Sem valor = a fazer. */
  status?: "andamento" | "feito"
  /** Tipo do balão (Ideia, Projeto, Decisão…). Sem valor: deduzido do vínculo. */
  kind?: "ideia" | "projeto" | "tarefa" | "venda" | "cliente" | "produto" | "meta" | "decisao" | "resumo"
  /**
   * "group" = área/grupo (retângulo com título). "text" = texto solto no fundo do quadro.
   * "drawing" = traço feito à mão (`path`). Sem valor = balão comum.
   */
  type?: "group" | "text" | "drawing" | "shape" | "sticky" | "image"
  /** Lousa — forma do elemento `type: "shape"`. */
  shape?: "rect" | "ellipse" | "diamond"
  /** Lousa — imagem (`type: "image"`): data URL já reduzida ou URL do Storage. */
  src?: string
  /** Lousa — tamanho da letra (px) de formas e notas. */
  fontSize?: number
  /** Lousa — preenchimento da forma: leve (padrão), cheio ou só contorno. */
  fill?: "soft" | "solid" | "none"
  /**
   * Ampliação do item (zoom infinito): 0.1 = dez vezes menor que o normal. Sem valor = 1.
   * Balão criado com a tela aproximada nasce pequeno, para a ideia continuar "lá dentro".
   */
  scale?: number
  /** Camada (como no Canva): maior fica na frente. Sem valor: balões 0, textos e desenhos atrás (-1). */
  z?: number
  /** Desenho: pontos x,y,x,y… em unidades locais (multiplicar por `scale`), a partir do canto do item. */
  path?: number[]
  /** Desenho e texto: espessura do traço / tamanho da letra em unidades locais. */
  stroke?: number
  /** Anotações que não poluem o mapa: comentário, observação, citação de app/plataforma… */
  notes?: NodeNote[]
  /** Ramo recolhido: filhos escondidos (mostra [n] no balão). */
  collapsed?: boolean
  /** Ligação com outra coisa do OS (produto, conteúdo, nota…). Tarefa e lead usam taskId/leadId. */
  ref?: { type: "product" | "content" | "note" | "transaction" | "map" | "goal"; id: string }
  /** Balão "Decisão": quando, quem, por quê e o que mais foi considerado. */
  decision?: { decidedAt?: string; ownerId?: string; reason?: string; alternatives?: string }
  /** Balão "Resumo": id do grupo (área) que ele resume. */
  summaryOf?: string
}

/**
 * Anotação de um balão. `kind` vem de NOTE_KINDS (src/lib/domain/node-notes.ts): para
 * um tipo novo no futuro (link, número, arquivo…), basta acrescentar lá. Tipo
 * desconhecido continua aparecendo como comentário.
 */
export interface NodeNote {
  id: string
  kind: string
  text: string
  /** Citação: app ou plataforma citada (Instagram, Hotmart, Canva…). */
  app?: string
  url?: string
  authorId: string
  createdAt: ISODate
}

export interface MindMapEdge {
  id: string
  source: string
  target: string
  /** Sem valor = hierarquia (linha sólida, "filho de"). "relacao" = linha tracejada com seta. */
  kind?: "relacao"
  /** Legenda no meio da linha ("depende de", "gera"…). */
  label?: string
  /** Sentido da seta: "fim" (→), "inicio" (←), "ambos" (↔, ida e volta) ou "nenhuma". Sem valor: relação → fim; hierarquia → nenhuma. */
  arrow?: "fim" | "inicio" | "ambos" | "nenhuma"
  /** Curva feita à mão: deslocamento (px) a partir do meio da linha. Sem valor = curva automática. */
  bend?: { dx: number; dy: number }
  /** Ponto escolhido em cada balão ("l", "r", "t", "b"). Sem valor = o lado mais perto. */
  sourceHandle?: string
  targetHandle?: string
  /** Traçado da linha: curva (padrão), reta ou em ângulo (fluxogramas). */
  route?: "curva" | "reta" | "angulo"
  /** Linha tracejada (independente de ser "relação"). */
  dashed?: boolean
  /** Cor da linha (matiz 0–360). Sem valor = cor do texto do tema. */
  hue?: number
}

export interface MindMap {
  id: string
  title: string
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  updatedAt: ISODate
  /**
   * "rows": balões em map_nodes/map_edges (1 registro cada). `nodes/edges` acima
   * ficam como backup do formato antigo. Sem valor: formato antigo (tudo aqui).
   */
  storage?: "rows"
  /**
   * "lousa": quadro livre (desenho, formas, notas, imagens, setas). "estruturado": mapa de ideias
   * em árvore/fluxo com modelos. Sem valor: estruturado (mapas criados antes deste campo).
   */
  mode?: "lousa" | "estruturado"
}
