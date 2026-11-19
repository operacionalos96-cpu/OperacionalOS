/**
 * Regras da bolinha flutuante (a esfera da Órbita que fica na área de trabalho quando o app é minimizado).
 * Sem Electron: testadas em bolinha-regras.test.ts.
 */

/** Lado da janela da bolinha, em pixels independentes de DPI. */
export const BOLINHA_LADO = 72
/** Distância da borda da área de trabalho quando a bolinha volta ao canto. */
export const BOLINHA_MARGEM = 24
/** Até quantos pixels de movimento um aperto ainda conta como clique (e não arraste). */
export const LIMITE_ARRASTE = 4

export interface Retangulo {
  x: number
  y: number
  width: number
  height: number
}
export interface Ponto {
  x: number
  y: number
}

/** Canto inferior direito da área de trabalho (sem a barra de tarefas). */
export function cantoPadrao(area: Retangulo, lado = BOLINHA_LADO, margem = BOLINHA_MARGEM): Ponto {
  return { x: Math.round(area.x + area.width - lado - margem), y: Math.round(area.y + area.height - lado - margem) }
}

/**
 * Onde a bolinha aparece. A posição salva vale se o centro dela ainda cai em algum monitor ligado
 * (e é empurrada para dentro da área de trabalho desse monitor). Se o monitor sumiu ou nada foi salvo,
 * volta ao canto inferior direito do monitor principal.
 */
export function posicaoBolinha(salva: Ponto | null | undefined, areas: Retangulo[], principal: Retangulo, lado = BOLINHA_LADO): Ponto {
  if (salva && Number.isFinite(salva.x) && Number.isFinite(salva.y)) {
    const cx = salva.x + lado / 2
    const cy = salva.y + lado / 2
    const area = areas.find((a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height)
    if (area) {
      const x = Math.min(Math.max(salva.x, area.x), area.x + area.width - lado)
      const y = Math.min(Math.max(salva.y, area.y), area.y + area.height - lado)
      return { x: Math.round(x), y: Math.round(y) }
    }
  }
  return cantoPadrao(principal, lado)
}

/** A bolinha aparece só com a opção ligada, com a janela principal minimizada ou escondida na bandeja, e fora do encerramento. */
export function deveMostrarBolinha(i: { ligada: boolean; janelaExiste: boolean; minimizada: boolean; visivel: boolean; saindo: boolean }) {
  if (!i.ligada || !i.janelaExiste || i.saindo) return false
  return i.minimizada || !i.visivel
}

/** Moveu além do limite: foi arraste, não clique. */
export function foiArraste(inicio: Ponto, fim: Ponto, limite = LIMITE_ARRASTE) {
  return Math.abs(fim.x - inicio.x) > limite || Math.abs(fim.y - inicio.y) > limite
}

export type VisualBolinha = "quieta" | "lenta" | "girando" | "alerta"

/** Estado do motor para o movimento da bolinha: parado fica quieta; esperando gira devagar; trabalhando gira; precisa de você acende o laranja. */
export function visualDoMotor(estado: string | null | undefined): VisualBolinha {
  if (estado === "esperando") return "lenta"
  if (estado === "trabalhando") return "girando"
  if (estado === "erro" || estado === "desligado") return "alerta"
  return "quieta"
}

const TEXTO: Record<VisualBolinha, string> = {
  quieta: "motor parado",
  lenta: "motor ligado, esperando trabalho",
  girando: "motor trabalhando",
  alerta: "precisa de você",
}
export const textoBolinha = (v: VisualBolinha) => `OperacionalOS: ${TEXTO[v]}. Clique para abrir.`
