import { ELEMENT_SIZE } from "@/lib/domain/board"
import type { MindMap, MindMapEdge, MindMapNode } from "@/lib/domain/types"
import { uid } from "@/lib/format"

/** Modelos de lousa: já nascem com elementos legíveis e ligados. */
export type BoardTemplateId = "lousa-branca" | "lousa-brainstorm" | "lousa-retro" | "lousa-fluxo"

export const BOARD_TEMPLATES: { id: BoardTemplateId; title: string; description: string }[] = [
  { id: "lousa-branca", title: "Lousa em branco", description: "Espaço livre: desenhe, escreva e ligue" },
  { id: "lousa-brainstorm", title: "Brainstorm", description: "Pergunta no centro e notas para soltar ideias" },
  { id: "lousa-retro", title: "Retrospectiva", description: "Três molduras: foi bem, melhorar e ações" },
  { id: "lousa-fluxo", title: "Fluxo livre", description: "Início, etapas e decisão ligados por setas" },
]

const shape = (label: string, x: number, y: number, s: NonNullable<MindMapNode["shape"]> = "rect", extra: Partial<MindMapNode> = {}): MindMapNode => ({
  id: uid(),
  type: "shape",
  shape: s,
  label,
  x,
  y,
  ...ELEMENT_SIZE[s],
  ...extra,
})
const sticky = (label: string, x: number, y: number, hue?: number): MindMapNode => ({ id: uid(), type: "sticky", label, x, y, ...ELEMENT_SIZE.sticky, ...(hue !== undefined ? { hue } : {}) })
const frame = (label: string, x: number, y: number, width: number, height: number, hue?: number): MindMapNode => ({ id: uid(), type: "group", label, x, y, width, height, z: -2, ...(hue !== undefined ? { hue } : {}) })
const link = (a: MindMapNode, b: MindMapNode, sourceHandle: string, targetHandle: string, extra: Partial<MindMapEdge> = {}): MindMapEdge => ({
  id: uid(),
  source: a.id,
  target: b.id,
  sourceHandle,
  targetHandle,
  kind: "relacao",
  arrow: "fim",
  ...extra,
})

export function boardTemplate(id: BoardTemplateId): MindMap {
  const base = { id: uid(), updatedAt: new Date().toISOString(), mode: "lousa" as const }
  switch (id) {
    case "lousa-brainstorm": {
      const center = shape("Qual é a pergunta?", 0, 0, "ellipse", { hue: 150, fontSize: 24, width: 300, height: 160 })
      const notes = [sticky("Ideia 1", -420, -260, 75), sticky("Ideia 2", 440, -260, 210), sticky("Ideia 3", -420, 230, 310), sticky("Ideia 4", 440, 230, 25)]
      const sides: [string, string][] = [["l", "r"], ["r", "l"], ["l", "r"], ["r", "l"]]
      return { ...base, title: "Brainstorm", nodes: [center, ...notes], edges: notes.map((n, i) => link(center, n, sides[i][0], sides[i][1], { kind: undefined, arrow: "nenhuma", route: "curva" })) }
    }
    case "lousa-retro": {
      const cols: [string, number, number][] = [["O que foi bem", 150, 0], ["O que melhorar", 25, 560], ["Ações", 210, 1120]]
      const frames = cols.map(([t, h, x]) => frame(t, x, 0, 520, 560, h))
      const notes = [sticky("Escreva aqui", 30, 70, 150), sticky("Escreva aqui", 590, 70, 25), sticky("Escreva aqui", 1150, 70, 210)]
      return { ...base, title: "Retrospectiva", nodes: [...frames, ...notes], edges: [] }
    }
    case "lousa-fluxo": {
      const start = shape("Início", 0, 0, "ellipse", { hue: 150 })
      const step = shape("Primeira etapa", 340, 0)
      const decision = shape("Deu certo?", 680, -10, "diamond", { hue: 75 })
      const yes = shape("Concluir", 1040, -90, "rect", { hue: 150 })
      const no = shape("Ajustar e repetir", 1040, 120, "rect", { hue: 25 })
      return {
        ...base,
        title: "Fluxo",
        nodes: [start, step, decision, yes, no],
        edges: [
          link(start, step, "r", "l", { route: "angulo" }),
          link(step, decision, "r", "l", { route: "angulo" }),
          link(decision, yes, "r", "l", { route: "angulo", label: "Sim" }),
          link(decision, no, "r", "l", { route: "angulo", label: "Não" }),
        ],
      }
    }
    default:
      return { ...base, title: "Nova lousa", nodes: [], edges: [] }
  }
}
