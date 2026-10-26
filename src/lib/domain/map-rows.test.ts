import { describe, expect, it } from "vitest"
import { diffItems, edgeRow, migrationRows, nodeRow, resolveMaps, rowId, signature } from "./map-rows"
import type { MindMap } from "./types"

const legacy: MindMap = {
  id: "m1",
  title: "30/09",
  updatedAt: "2026-09-01T00:00:00.000Z",
  nodes: [
    { id: "a", label: "Raiz", x: 0, y: 0 },
    { id: "b", label: "Filho", x: 240, y: 0, taskId: "t1", tag: "prospecção" },
  ],
  edges: [{ id: "e1", source: "a", target: "b" }],
}

describe("migração do mapa para 1 registro por balão", () => {
  it("copia todos os balões e linhas com os mesmos ids (idempotente)", () => {
    const rows = migrationRows(legacy)
    expect(rows.nodes.map((r) => r.id)).toEqual(["m1~a", "m1~b"])
    expect(rows.edges[0]).toMatchObject({ id: "m1~e1", mapId: "m1", edge: legacy.edges[0] })
    expect(migrationRows(legacy)).toEqual(rows)
  })

  it("depois de migrado, o mapa lido das linhas é igual ao antigo", () => {
    const rows = migrationRows(legacy)
    const [resolved] = resolveMaps([{ ...legacy, storage: "rows" }], rows.nodes, rows.edges)
    expect(resolved.nodes).toEqual(legacy.nodes)
    expect(resolved.edges).toEqual(legacy.edges)
  })

  it("preserva caminho de imagem e tipo de forma na migração e recuperação", () => {
    const withCanvasItems: MindMap = {
      ...legacy,
      nodes: [
        ...legacy.nodes,
        { id: "img", label: "Referência visual", x: 320, y: 180, type: "image", imagePath: "anexos/map-image/m/ref.png" },
        { id: "shape", label: "Decisão", x: 600, y: 180, type: "shape", shapeKind: "diamond" },
      ],
    }
    const rows = migrationRows(withCanvasItems)
    const [resolved] = resolveMaps([{ ...withCanvasItems, storage: "rows" }], rows.nodes, rows.edges)
    expect(resolved.nodes).toEqual(withCanvasItems.nodes)
  })

  it("mapa ainda no formato antigo não muda", () => {
    const rows = migrationRows(legacy)
    expect(resolveMaps([legacy], rows.nodes, rows.edges)[0]).toBe(legacy)
  })

  it("linha que aponta para balão apagado não aparece", () => {
    const rows = migrationRows(legacy)
    const [resolved] = resolveMaps([{ ...legacy, storage: "rows" }], [rows.nodes[0]], rows.edges)
    expect(resolved.edges).toEqual([])
  })

  it("editado há… acompanha a gravação mais recente de um balão", () => {
    const n = { ...nodeRow("m1", legacy.nodes[0]), updatedAt: "2026-09-30T10:00:00.000Z" }
    const [resolved] = resolveMaps([{ ...legacy, storage: "rows" }], [n], [])
    expect(resolved.updatedAt).toBe("2026-09-30T10:00:00.000Z")
  })

  it("não mistura balões de mapas diferentes com o mesmo id", () => {
    expect(rowId("m1", "a")).not.toBe(rowId("m2", "a"))
    const [one, two] = resolveMaps(
      [{ ...legacy, storage: "rows" }, { ...legacy, id: "m2", storage: "rows" }],
      [nodeRow("m1", legacy.nodes[0]), nodeRow("m2", { ...legacy.nodes[0], label: "Outro" })],
      [edgeRow("m1", legacy.edges[0])],
    )
    expect(one.nodes[0].label).toBe("Raiz")
    expect(two.nodes[0].label).toBe("Outro")
  })
})

describe("gravar só o que mudou", () => {
  const saved = new Map(legacy.nodes.map((n) => [n.id, signature(n)]))

  it("nada mudou → nada a gravar", () => {
    expect(diffItems(saved, legacy.nodes)).toEqual({ upsert: [], remove: [] })
  })

  it("campo undefined não conta como mudança", () => {
    expect(diffItems(saved, [{ ...legacy.nodes[0], hue: undefined }, legacy.nodes[1]]).upsert).toEqual([])
  })

  it("só o balão editado, o novo e o apagado", () => {
    const moved = { ...legacy.nodes[0], x: 10 }
    const added = { id: "c", label: "Novo", x: 0, y: 64 }
    const d = diffItems(saved, [moved, added])
    expect(d.upsert.map((n) => n.id)).toEqual(["a", "c"])
    expect(d.remove).toEqual(["b"])
  })
})

describe("assinatura (o que mudou) vê campos dentro de campos", () => {
  it("editar a decisão ou a curva da linha conta como mudança", () => {
    const a = { id: "n", label: "x", x: 0, y: 0, decision: { reason: "barato" } }
    expect(signature(a)).not.toBe(signature({ ...a, decision: { reason: "rápido" } }))
    const e = { id: "e", source: "a", target: "b", bend: { dx: 10, dy: 0 } }
    expect(signature(e)).not.toBe(signature({ ...e, bend: { dx: 10, dy: 40 } }))
  })
  it("ordem das chaves e campos vazios não contam", () => {
    expect(signature({ id: "n", label: "x", x: 0, y: 0, hue: undefined })).toBe(signature({ y: 0, x: 0, label: "x", id: "n" } as never))
  })
})
