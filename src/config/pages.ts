import {
  BotIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  ClapperboardIcon,
  HandshakeIcon,
  HomeIcon,
  InboxIcon,
  KanbanIcon,
  KeyRoundIcon,
  NetworkIcon,
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
    purpose: "Meu Dia: seu plano de hoje, sua agenda, o time agora e o próximo passo de cada setor.",
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
    href: "/caixa-de-entrada",
    title: "Caixa de entrada",
    short: "Entrada",
    icon: InboxIcon,
    section: "Dia a dia",
    purpose: "Tudo o que foi capturado e ainda não tem destino. Triar é decidir o que cada item vira.",
    howTo: [
      "Capture qualquer coisa em uma linha pelo botão + ou com Ctrl+K.",
      "Para cada item, escolha: virar tarefa (com área e prazo), ideia, decisão ou arquivar.",
      "Item parado há mais de 48 h ganha um alerta: tente triar todo dia, leva 5 minutos.",
    ],
    terms: ["caixa-de-entrada", "area"],
  },
  {
    href: "/tarefas",
    title: "Tarefas & Notas",
    short: "Tarefas",
    icon: CheckSquareIcon,
    section: "Dia a dia",
    purpose: "O que cada pessoa precisa fazer, e as anotações da equipe.",
    howTo: [
      "Escreva a tarefa e aperte Enter. Dica: \"!alta\" marca como importante e \"#vendas\" põe uma etiqueta.",
      "Clique na tarefa para escolher prazo, responsáveis e checklist.",
      "Em \"Notas\", escreva e ligue a nota às tarefas relacionadas.",
    ],
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
    href: "/equipe",
    title: "Equipe",
    icon: UsersIcon,
    section: "Gestão",
    purpose: "Quem faz parte da equipe, onde cada um está agora, do que é responsável e o que fez.",
    howTo: [
      "Em Responsabilidades, veja o status de cada um (online, em reunião…), as áreas e o que fez.",
      "Em Semana do time, responda o foco de segunda e a retrospectiva de sexta e veja o que cada um fez.",
      "Faça o check-in no guia do dia (a bolinha no canto): o time vê que você está no expediente.",
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
    purpose: "As áreas da empresa, quem é dono de cada uma e o limite de gasto que vai para a CEO.",
    howTo: [
      "Confira o dono de cada área: é para ele que vão as tarefas daquela área.",
      "Ajuste dono, apoio e quem aprova quando a divisão mudar (só a gestão pode).",
      "Defina o limite em R$ a partir do qual um gasto precisa da CEO.",
    ],
    terms: ["area"],
  },
  {
    href: "/cofre",
    title: "Cofre",
    icon: KeyRoundIcon,
    section: "Sistema",
    purpose: "Senhas e acessos da equipe, guardados com criptografia.",
    howTo: [
      "Abra o cofre com a senha do cofre.",
      "Clique para ver uma senha: ela some sozinha depois de 30 segundos.",
      "O cofre tranca sozinho depois de 5 minutos sem uso.",
    ],
  },
] as const satisfies readonly PageInfo[]

/** Informações da página (a mais específica que combina com o endereço). */
export function pageFor(pathname: string): PageInfo | undefined {
  return [...PAGES]
    .sort((a, b) => b.href.length - a.href.length)
    .find((p) => (p.href === "/" ? pathname === "/" : pathname === p.href || pathname.startsWith(`${p.href}/`)))
}
