import {
  BotIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  ClapperboardIcon,
  FileSignatureIcon,
  HandshakeIcon,
  HomeIcon,
  KanbanIcon,
  NetworkIcon,
  OrbitIcon,
  PackageIcon,
  RadarIcon,
  ScaleIcon,
  SettingsIcon,
  TargetIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import type { MetricId } from "@/lib/domain/metrics"
import type { TermId } from "./glossary"

/**
 * Páginas do app — fonte ÚNICA de nome, ícone, propósito e "como usar" de cada uma.
 * Daqui saem: o menu lateral, a barra do celular, a busca (Ctrl+K), o título de cada página e o
 * painel "Como usar". Mudou o nome de uma área? Mude só aqui.
 *
 * Página nova = uma entrada aqui (o teste pages.test.ts falha se faltar). Regras de escrita:
 * - `purpose`: uma frase, "para que serve", sem jargão.
 * - `howTo`: 2 a 4 passos curtos, começando por um verbo ("Crie…", "Arraste…").
 * - `terms` / `metrics`: palavras e números que a página usa (definidos em glossary.ts e metrics.ts).
 */
export interface PageInfo {
  href: string
  title: string
  /** Rótulo curto da barra do celular. */
  short?: string
  icon: LucideIcon
  section: string | null
  purpose: string
  howTo: string[]
  terms?: TermId[]
  metrics?: MetricId[]
}

export const PAGES = [
  {
    href: "/",
    title: "Início",
    icon: HomeIcon,
    section: "Dia a dia",
    purpose: "Meu Dia: a Sede 3D, seu plano de hoje, a agenda, o time agora e o próximo passo de cada setor.",
    howTo: [
      "De manhã, faça o check-in pelo \"Planejar meu dia\" (ou pela bolinha do guia).",
      "No Plano do dia, aperte ▶ na tarefa que vai fazer: o time vê o que você está fazendo.",
      "Quando todos fizerem check-in, aperte \"Estou pronto\" na reunião diária.",
      "No fim do expediente, use \"Fechar o dia\" para planejar amanhã.",
    ],
    terms: ["check-in", "fazendo-agora", "daily", "sessao"],
  },
  {
    href: "/agenda",
    title: "Agenda",
    icon: CalendarDaysIcon,
    section: "Dia a dia",
    purpose: "O calendário do time: reuniões, sessões de trabalho, folgas e os prazos de tarefas e conteúdos.",
    howTo: [
      "Escolha Dia, Semana ou Mês e, se quiser, a pessoa.",
      "Clique num horário vazio para agendar uma reunião, um compromisso ou uma sessão.",
      "Marque uma sessão de foco com a área (ex.: comercial): no horário, essas tarefas sobem no seu plano.",
    ],
    terms: ["status", "sessao"],
  },
  {
    href: "/tarefas",
    title: "Tarefas",
    icon: CheckSquareIcon,
    section: "Dia a dia",
    purpose: "Capturar, triar e fazer: a caixa de entrada, as tarefas de cada pessoa e as notas da equipe.",
    howTo: [
      "Capture qualquer coisa em uma linha pelo botão + ou com Ctrl+K: cai na aba Entrada.",
      "Na Entrada, decida o que cada item vira: tarefa (com área e prazo), ideia, decisão ou arquivo.",
      "Em Tarefas, escreva e aperte Enter. Dica: \"!alta\" marca como importante e \"#vendas\" põe uma etiqueta.",
      "Em Notas, escreva e ligue a nota às tarefas relacionadas.",
    ],
    terms: ["caixa-de-entrada", "area"],
  },
  {
    href: "/prospeccao",
    title: "Prospecção",
    icon: RadarIcon,
    section: "Vendas",
    purpose: "Analise empresas novas, uma de cada vez, e decida quem vale a pena chamar.",
    howTo: [
      "Leia a análise da empresa que está na fila.",
      "Aprove para abrir a conversa no WhatsApp, ou descarte dizendo o motivo.",
      "Depois de mandar a mensagem, confirme que enviou: o lead vai para \"Contato feito\".",
    ],
    terms: ["lead", "descartado"],
  },
  {
    href: "/pipeline",
    title: "Pipeline",
    icon: KanbanIcon,
    section: "Vendas",
    purpose: "Seus negócios em andamento, do primeiro contato até o fechamento.",
    howTo: [
      "Crie um lead em \"Novo lead\": nome, valor estimado e a próxima ação.",
      "Arraste o card para a etapa certa conforme a conversa avança.",
      "Fechou? Arraste para \"Ganho\": a tarefa de começo do trabalho e o recebimento são criados sozinhos.",
    ],
    terms: ["lead", "etapa", "proxima-acao", "lead-parado"],
    metrics: ["pipeline-aberto"],
  },
  {
    href: "/clientes",
    title: "Clientes",
    icon: HandshakeIcon,
    section: "Vendas",
    purpose: "Quem já comprou: quanto pagou e quando foi a última compra.",
    howTo: [
      "Marque um lead como ganho no Pipeline e ele aparece aqui.",
      "Clique num cliente para ver todo o histórico.",
    ],
    terms: ["lead"],
  },
  {
    href: "/produtos",
    title: "Produtos",
    icon: PackageIcon,
    section: "Vendas",
    purpose: "O que a empresa vende, com os interessados e o dinheiro de cada produto.",
    howTo: [
      "Cadastre um produto com nome e links.",
      "Ligue leads, lançamentos e conteúdos ao produto para ver os números dele.",
      "Abra o produto para ver conversão, entradas e resultado.",
    ],
    metrics: ["leads-produto", "conversao", "entradas-produto", "resultado-produto"],
  },
  {
    href: "/conteudos",
    title: "Conteúdos",
    short: "Conteúdo",
    icon: ClapperboardIcon,
    section: "Criação",
    purpose: "Do roteiro à publicação: produção, arquivos, contas e resultados de cada conteúdo.",
    howTo: [
      "Crie um conteúdo e avance pelas etapas (roteiro, gravação, edição…).",
      "Anexe os arquivos de cada etapa no próprio conteúdo.",
      "Depois de publicar, acompanhe os números em \"Métricas\".",
    ],
    metrics: ["publicacoes", "visualizacoes", "interacoes", "engajamento"],
  },
  {
    href: "/mapas",
    title: "Mapas",
    icon: NetworkIcon,
    section: "Criação",
    purpose: "Um espaço para pensar e organizar ideias: lousa livre ou mapa em ramos.",
    howTo: [
      "Crie uma lousa para desenhar à vontade, ou um mapa para organizar ideias em ramos.",
      "Ligue um balão a uma tarefa, lead ou produto para conectar a ideia ao trabalho.",
      "Use o modo foco para esconder o resto da tela enquanto pensa.",
    ],
  },
  {
    href: "/ai-office",
    title: "AI Office",
    short: "IA",
    icon: BotIcon,
    section: "Criação",
    purpose: "Os assistentes de IA: o que estão fazendo, o que aprenderam e o que sugerem.",
    howTo: [
      "Veja o que cada assistente está fazendo agora.",
      "Leia as sugestões e aprove ou recuse: nenhuma regra muda sem uma pessoa aprovar.",
      "No monitor, refaça uma tarefa que falhou.",
    ],
    terms: ["hipotese"],
  },
  {
    href: "/dock",
    title: "HZK Dock",
    short: "Dock",
    icon: OrbitIcon,
    section: "Criação",
    purpose: "O seu escritório de IA: seus bots, as IAs que eles usam, os apps e as skills da empresa. Só você vê.",
    howTo: [
      "Crie um bot do zero ou a partir do Kit da sua área; os anéis do avatar mostram quanto ele pode no seu PC.",
      "Converse com ele; cada resposta mostra qual IA respondeu, e dá para trocar a IA só naquela conversa.",
      "Quando um bot quer mexer em algo da empresa, a ação vem para você aprovar, com o rascunho do que será feito.",
    ],
  },
  {
    href: "/financeiro",
    title: "Financeiro",
    short: "Finanças",
    icon: WalletIcon,
    section: "Gestão",
    purpose: "Todo dinheiro que entra e sai, o saldo e a meta do mês.",
    howTo: [
      "Registre o que entrou ou saiu pelos botões \"Entrada\" e \"Saída\".",
      "Em \"Contas a pagar\" e \"Contas a receber\", anote o que ainda vai acontecer.",
      "Quando pagar ou receber, dê baixa: o valor passa a contar no saldo.",
      "Troque o mês no seletor \"Período\" para ver meses anteriores.",
    ],
    terms: ["previsto", "realizado", "baixa"],
    metrics: ["saldo-caixa", "resultado-mes", "meta-faturamento"],
  },
  {
    href: "/metas",
    title: "Metas",
    icon: TargetIcon,
    section: "Gestão",
    purpose: "Onde a empresa quer chegar, com o progresso medido sozinho.",
    howTo: [
      "Crie uma meta de faturamento, de vendas ou ligada a tarefas.",
      "O progresso anda sozinho com as vendas, entradas ou tarefas concluídas.",
      "Abra a meta para ver os detalhes e editar.",
    ],
  },
  {
    href: "/decisoes",
    title: "Decisões",
    icon: ScaleIcon,
    section: "Gestão",
    purpose: "O que precisa ser escolhido, quem decide e o histórico do que já foi decidido.",
    howTo: [
      "Crie uma decisão com a pergunta, as opções e a sua recomendação.",
      "O app mostra quem decide e por quê (área, dinheiro, contrato, estratégia).",
      "Quem decide escolhe uma opção, recusa ou pede mais contexto, direto no card.",
    ],
    terms: ["decisao", "porta"],
  },
  {
    href: "/contratos",
    title: "Contratos",
    icon: FileSignatureIcon,
    section: "Gestão",
    purpose: "O que a empresa assinou: com quem, quanto vale, até quando e o arquivo, com aviso antes de vencer.",
    howTo: [
      "Crie o contrato com o nome, com quem é, o valor e até quando vale.",
      "Depois de salvar, anexe o PDF assinado: ele fica num espaço privado da área de Contratos.",
      "Perto do fim, o contrato pede atenção: crie a tarefa de renovação com um clique.",
      "Acabou antes da hora? Use \"Encerrar contrato\"; o histórico continua guardado.",
    ],
    terms: ["area", "nivel-acesso"],
  },
  {
    href: "/equipe",
    title: "Equipe",
    icon: UsersIcon,
    section: "Gestão",
    purpose: "Quem faz parte da equipe, onde cada um está agora, do que é responsável e o que fez.",
    howTo: [
      "Em Responsabilidades, veja o status de cada um (online, em reunião…), as áreas e o que fez.",
      "Em Semana do time, responda o foco de segunda e a retrospectiva de sexta e veja o que cada um fez.",
      "Em Acesso por área, veja o seu nível em cada área; quem gere uma área chama pessoas para ela.",
      "Clique em \"Ver tudo\" para abrir a página da pessoa com a agenda e a lista completa.",
    ],
    terms: ["status", "check-in", "check-in-semanal", "guia-do-dia", "nivel-acesso"],
  },
  {
    href: "/configuracoes",
    title: "Configurações",
    short: "Ajustes",
    icon: SettingsIcon,
    section: "Sistema",
    purpose: "As áreas e regras da empresa, as pessoas e os cargos, o menu de cada um e o cofre de senhas.",
    howTo: [
      "Em Empresa, confira o dono de cada área e o limite em R$ a partir do qual um gasto vai para a CEO.",
      "Ainda em Empresa, escolha as abas do menu que cada pessoa vê.",
      "Em Pessoas, convide membros, crie cargos e veja a árvore da equipe.",
      "Em Cofre, abra com a senha do cofre: cada senha some em 30 s e ele tranca em 5 min.",
    ],
    terms: ["area", "nivel-acesso"],
  },
] as const satisfies readonly PageInfo[]

/** Informações da página (a mais específica que combina com o endereço). */
export function pageFor(pathname: string): PageInfo | undefined {
  return [...PAGES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((p) => (p.href === "/" ? pathname === "/" : pathname === p.href || pathname.startsWith(`${p.href}/`)))
}
