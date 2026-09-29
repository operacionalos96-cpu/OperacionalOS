import type { MindMap, MindMapEdge, MindMapNode } from "@/lib/domain/types"
import { uid } from "@/lib/format"

export type TemplateId = "estrategia" | "ideias" | "processos" | "branco"

export const TEMPLATES: { id: TemplateId; title: string; description: string }[] = [
  { id: "estrategia", title: "Estratégia da operação", description: "Clientes, oferta, canais, metas e riscos" },
  { id: "ideias", title: "Ideias", description: "Um tema central e ideias ao redor para priorizar" },
  { id: "processos", title: "Processo", description: "Etapas em sequência, do início ao fim" },
  { id: "branco", title: "Em branco", description: "Só o nó central" },
]

/** Árvore simples: raiz no centro, filhos em leque, netos ao lado de cada filho. */
function radial(root: string, branches: [string, string[]][]) {
  const nodes: MindMapNode[] = [{ id: uid(), label: root, x: 0, y: 0 }]
  const edges: MindMapEdge[] = []
  branches.forEach(([label, children], i) => {
    const angle = (i / branches.length) * Math.PI * 2 - Math.PI / 2
    const bx = Math.cos(angle) * 320
    const by = Math.sin(angle) * 200
    const branch: MindMapNode = { id: uid(), label, x: bx, y: by }
    nodes.push(branch)
    edges.push({ id: uid(), source: nodes[0].id, target: branch.id })
    const dir = bx >= 0 ? 1 : -1
    children.forEach((c, j) => {
      const child: MindMapNode = { id: uid(), label: c, x: bx + dir * 240, y: by + (j - (children.length - 1) / 2) * 56 }
      nodes.push(child)
      edges.push({ id: uid(), source: branch.id, target: child.id })
    })
  })
  return { nodes, edges }
}

function sequence(steps: string[]) {
  const nodes: MindMapNode[] = steps.map((label, i) => ({ id: uid(), label, x: i * 240, y: 0 }))
  const edges: MindMapEdge[] = nodes.slice(1).map((n, i) => ({ id: uid(), source: nodes[i].id, target: n.id }))
  return { nodes, edges }
}

export function templateMap(id: TemplateId): MindMap {
  const now = new Date().toISOString()
  switch (id) {
    case "estrategia":
      return {
        id: uid(),
        title: "Estratégia da operação",
        updatedAt: now,
        ...radial("Nossa operação", [
          ["Clientes ideais", ["Clínicas e consultórios", "Pequenas indústrias"]],
          ["Oferta", ["Pacote mensal", "Projeto pontual"]],
          ["Canais", ["Indicações", "LinkedIn", "Parcerias"]],
          ["Metas do trimestre", ["R$ 45 mil/mês", "3 clientes novos"]],
          ["Riscos", ["Dependência de 2 clientes"]],
        ]),
      }
    case "ideias":
      return {
        id: uid(),
        title: "Ideias",
        updatedAt: now,
        ...radial("Tema central", [
          ["Ideia 1", []],
          ["Ideia 2", []],
          ["Ideia 3", []],
        ]),
      }
    case "processos":
      return {
        id: uid(),
        title: "Processo",
        updatedAt: now,
        ...sequence(["Início", "Etapa 1", "Etapa 2", "Etapa 3", "Resultado"]),
      }
    case "branco":
      return { id: uid(), title: "Novo mapa", updatedAt: now, nodes: [{ id: uid(), label: "Ideia central", x: 0, y: 0 }], edges: [] }
  }
}
