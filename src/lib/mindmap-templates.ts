import type { MindMap, MindMapEdge, MindMapNode } from "@/lib/domain/types"
import { uid } from "@/lib/format"

export type TemplateId =
  | "estrategia"
  | "ideias"
  | "processos"
  | "projeto"
  | "brainstorm"
  | "reuniao"
  | "funil"
  | "produto"
  | "rotina"
  | "branco"

export const TEMPLATES: { id: TemplateId; title: string; description: string }[] = [
  { id: "estrategia", title: "Estratégia da operação", description: "Clientes, oferta, canais, metas e riscos" },
  { id: "ideias", title: "Ideias", description: "Um tema central e ideias ao redor para priorizar" },
  { id: "processos", title: "Processo", description: "Etapas em sequência, do início ao fim" },
  { id: "projeto", title: "Projeto", description: "Objetivo, entregas, prazos, responsáveis e riscos" },
  { id: "brainstorm", title: "Brainstorm", description: "Problema no centro, ideias soltas, depois as melhores" },
  { id: "reuniao", title: "Reunião", description: "Pauta, decisões, próximos passos e pendências" },
  { id: "funil", title: "Funil de vendas", description: "Atrair, conversar, propor, fechar e manter" },
  { id: "produto", title: "Produto", description: "Para quem, promessa, entrega, preço e divulgação" },
  { id: "rotina", title: "Rotina", description: "O que fazer todo dia, toda semana e todo mês" },
  { id: "branco", title: "Em branco", description: "Só o nó central" },
]

type Kinds = Record<string, MindMapNode["kind"]>

/** Árvore simples: raiz no centro, filhos em leque, netos ao lado de cada filho. `kinds`: tipo por texto. */
function radial(root: string, branches: [string, string[]][], kinds: Kinds = {}) {
  const tree = radialTree(root, branches)
  for (const n of tree.nodes) if (kinds[n.label]) n.kind = kinds[n.label]
  return tree
}

function radialTree(root: string, branches: [string, string[]][]) {
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

function sequence(steps: string[], kind?: MindMapNode["kind"]) {
  const nodes: MindMapNode[] = steps.map((label, i) => ({ id: uid(), label, x: i * 240, y: 0, ...(kind ? { kind } : {}) }))
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
    case "projeto":
      return {
        id: uid(),
        title: "Projeto",
        updatedAt: now,
        ...radial(
          "Nome do projeto",
          [
            ["Objetivo", ["Resultado esperado", "Como saber que deu certo"]],
            ["Entregas", ["Entrega 1", "Entrega 2", "Entrega 3"]],
            ["Prazos", ["Início", "Entrega final"]],
            ["Responsáveis", ["Quem faz o quê"]],
            ["Riscos", ["O que pode atrasar"]],
          ],
          { "Nome do projeto": "projeto", Objetivo: "meta", "Resultado esperado": "meta", "Entrega 1": "tarefa", "Entrega 2": "tarefa", "Entrega 3": "tarefa" },
        ),
      }
    case "brainstorm":
      return {
        id: uid(),
        title: "Brainstorm",
        updatedAt: now,
        ...radial(
          "Qual problema queremos resolver?",
          [
            ["Ideias soltas", ["Ideia", "Ideia", "Ideia"]],
            ["Perguntas", ["O que ainda não sabemos?"]],
            ["As melhores", ["Escolhida 1", "Escolhida 2"]],
            ["Próximo passo", []],
          ],
          { "Próximo passo": "tarefa", "As melhores": "decisao" },
        ),
      }
    case "reuniao":
      return {
        id: uid(),
        title: `Reunião ${now.slice(8, 10)}/${now.slice(5, 7)}`,
        updatedAt: now,
        ...radial(
          "Reunião",
          [
            ["Pauta", ["Assunto 1", "Assunto 2"]],
            ["Decisões", ["Decidimos que…"]],
            ["Próximos passos", ["Quem faz o quê até quando"]],
            ["Pendências", ["Ficou para a próxima"]],
          ],
          { "Decidimos que…": "decisao", "Quem faz o quê até quando": "tarefa", Decisões: "resumo" },
        ),
      }
    case "funil":
      return {
        id: uid(),
        title: "Funil de vendas",
        updatedAt: now,
        ...sequence(["Atrair", "Primeiro contato", "Conversa", "Proposta", "Fechamento", "Pós-venda"], "venda"),
      }
    case "produto":
      return {
        id: uid(),
        title: "Produto",
        updatedAt: now,
        ...radial(
          "Nome do produto",
          [
            ["Para quem", ["Cliente ideal", "Dor principal"]],
            ["Promessa", ["Resultado que entrega"]],
            ["Entrega", ["O que a pessoa recebe", "Em quanto tempo"]],
            ["Preço", ["Valor", "Formas de pagamento"]],
            ["Divulgação", ["Conteúdos", "Anúncios", "Indicações"]],
          ],
          { "Nome do produto": "produto", "Cliente ideal": "cliente", "Resultado que entrega": "meta" },
        ),
      }
    case "rotina":
      return {
        id: uid(),
        title: "Rotina",
        updatedAt: now,
        ...radial(
          "Nossa rotina",
          [
            ["Todo dia", ["Responder leads", "Postar conteúdo"]],
            ["Toda semana", ["Reunião de alinhamento", "Revisar funil"]],
            ["Todo mês", ["Fechar financeiro", "Revisar metas"]],
          ],
          {
            "Responder leads": "tarefa",
            "Postar conteúdo": "tarefa",
            "Reunião de alinhamento": "tarefa",
            "Revisar funil": "tarefa",
            "Fechar financeiro": "tarefa",
            "Revisar metas": "meta",
          },
        ),
      }
    case "branco":
      return { id: uid(), title: "Novo mapa", updatedAt: now, nodes: [{ id: uid(), label: "Ideia central", x: 0, y: 0 }], edges: [] }
  }
}
