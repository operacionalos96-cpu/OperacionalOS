/**
 * Números do negócio — UMA definição para cada um (nome + explicação + cálculo juntos).
 *
 * Todo card, gráfico ou app que mostra um destes números usa esta definição. Assim o mesmo
 * número nunca aparece com valor ou explicação diferente em duas telas (antes, o saldo da
 * Início e o do Financeiro podiam divergir). Padrão "metrics layer": a métrica é definida uma
 * vez, junto do cálculo, e todos leem daqui.
 *
 * Métrica nova: uma entrada aqui (com `help` em linguagem simples, até ~140 caracteres) e o
 * cálculo numa função pura testada. Mudou a regra? Mude o cálculo e o `help` juntos.
 */
import { productStats } from "./products"
import { balance, goalProgress, monthStats, pipelineSummary } from "./rules"

export interface MetricDef {
  /** Nome curto que aparece no card. */
  label: string
  /** O que é e como é calculado, para qualquer pessoa entender. */
  help: string
}

export const METRICS = {
  "saldo-caixa": {
    label: "Saldo em caixa",
    help: "Dinheiro que já entrou menos o que já saiu, até hoje. Contas previstas (ainda não pagas ou recebidas) não entram.",
  },
  "resultado-mes": {
    label: "Resultado do mês",
    help: "Entradas recebidas menos saídas pagas no mês. Positivo: sobrou dinheiro.",
  },
  "meta-faturamento": {
    label: "Meta de faturamento",
    help: "Quanto já entrou no mês comparado à meta. O traço na barra mostra onde você deveria estar hoje.",
  },
  "pipeline-aberto": {
    label: "Pipeline aberto",
    help: "Soma do valor dos negócios em andamento (nem ganhos, nem perdidos, nem descartados).",
  },
  conversao: {
    label: "Conversão",
    help: "De cada 10 negócios decididos, quantos foram ganhos. Negócios ainda abertos não entram na conta.",
  },
  "leads-produto": {
    label: "Leads",
    help: "Quantas pessoas ou empresas demonstraram interesse neste produto.",
  },
  "entradas-produto": {
    label: "Entradas",
    help: "Dinheiro já recebido ligado a este produto.",
  },
  "resultado-produto": {
    label: "Resultado",
    help: "Dinheiro recebido menos o gasto com este produto (tráfego, ferramentas, equipe…).",
  },
  publicacoes: {
    label: "Publicações",
    help: "Quantas vezes os conteúdos foram publicados nas contas.",
  },
  visualizacoes: {
    label: "Visualizações",
    help: "Quantas vezes os conteúdos foram vistos. Cada rede conta de um jeito: escolha uma rede para comparar.",
  },
  interacoes: {
    label: "Interações",
    help: "Curtidas, comentários, compartilhamentos e salvos. Mostradas por rede, porque cada uma conta diferente.",
  },
  engajamento: {
    label: "Engajamento",
    help: "Interações divididas por visualizações, na rede escolhida. Quanto maior, mais o público reagiu.",
  },
} as const satisfies Record<string, MetricDef>

export type MetricId = keyof typeof METRICS

/**
 * Cálculos dos números que aparecem em MAIS DE UMA tela. Cada tela chama daqui — nunca refaz a conta.
 * (Números de uma tela só usam as funções de domínio do módulo, com o rótulo e a ajuda de METRICS.)
 */
export const compute = {
  "saldo-caixa": balance,
  "resultado-mes": monthStats,
  "meta-faturamento": goalProgress,
  "pipeline-aberto": pipelineSummary,
  produto: productStats,
} as const
