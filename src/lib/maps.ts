"use client"

import { useMemo } from "react"
import { edgeRow, isRowMap, migrationRows, nodeRow, resolveMaps, rowId, type MapEdgeRow, type MapNodeRow } from "@/lib/domain/map-rows"
import type { MindMap, MindMapEdge, MindMapNode } from "@/lib/domain/types"
import { useMapEdges, useMapNodes } from "@/lib/modules"
import { useStore } from "@/lib/store"

/** Mapas como as telas enxergam (balões das linhas novas ou do formato antigo). */
export function useMindMaps(): MindMap[] {
  const maps = useStore((s) => s.mindMaps)
  const nodes = useMapNodes((s) => s.items)
  const edges = useMapEdges((s) => s.items)
  return useMemo(() => resolveMaps(maps, nodes, edges), [maps, nodes, edges])
}

export function useMindMap(id: string): MindMap | undefined {
  const maps = useMindMaps()
  return maps.find((m) => m.id === id)
}

/** As tabelas map_nodes/map_edges existem (SQL 0005 rodado) e carregaram. */
export function useRowStorageReady() {
  const a = useMapNodes((s) => s.loaded)
  const b = useMapEdges((s) => s.loaded)
  return a && b
}

const migrating = new Map<string, Promise<void>>()

/**
 * Leva um mapa antigo para 1 registro por balão. Grava as linhas e SÓ DEPOIS de o
 * banco confirmar marca o mapa como "rows". O jsonb antigo não é apagado (backup).
 * Pode rodar duas vezes (ou nos dois computadores ao mesmo tempo): mesmos ids.
 */
export function migrateMap(map: MindMap): Promise<void> {
  if (isRowMap(map)) return Promise.resolve()
  const running = migrating.get(map.id)
  if (running) return running
  const job = (async () => {
    const rows = migrationRows(map)
    await useMapNodes.getState().saveMany(rows.nodes)
    await useMapEdges.getState().saveMany(rows.edges)
    const latest = useStore.getState().mindMaps.find((m) => m.id === map.id) ?? map
    useStore.getState().saveMap({ ...latest, storage: "rows" })
  })().finally(() => migrating.delete(map.id))
  migrating.set(map.id, job)
  return job
}

export interface DeletedMap {
  map: MindMap
  nodes: MapNodeRow[]
  edges: MapEdgeRow[]
}

/** Exclui o mapa e seus balões; devolve tudo para o "Desfazer". */
export function deleteMapWithRows(id: string): DeletedMap | undefined {
  const map = useStore.getState().mindMaps.find((m) => m.id === id)
  if (!map) return
  const nodes = useMapNodes.getState().items.filter((r) => r.mapId === id)
  const edges = useMapEdges.getState().items.filter((r) => r.mapId === id)
  useStore.getState().deleteMap(id)
  for (const r of edges) useMapEdges.getState().remove(r.id)
  for (const r of nodes) useMapNodes.getState().remove(r.id)
  return { map, nodes, edges }
}

export function restoreMapWithRows(d: DeletedMap) {
  useStore.getState().restoreMap(d.map)
  for (const r of d.nodes) useMapNodes.getState().restore(r)
  for (const r of d.edges) useMapEdges.getState().restore(r)
}

// ---------- edição fora do editor visual (modo Lista) ----------

/** Grava um balão (só ele). */
export function saveMapNode(mapId: string, node: MindMapNode) {
  useMapNodes.getState().save(nodeRow(mapId, node))
}

export function saveMapEdge(mapId: string, edge: MindMapEdge) {
  useMapEdges.getState().save(edgeRow(mapId, edge))
}

/** Apaga o balão e as linhas ligadas a ele. */
export function removeMapNode(mapId: string, nodeId: string) {
  for (const r of useMapEdges.getState().items)
    if (r.mapId === mapId && (r.edge.source === nodeId || r.edge.target === nodeId)) useMapEdges.getState().remove(r.id)
  useMapNodes.getState().remove(rowId(mapId, nodeId))
}
