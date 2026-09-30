"use client"

import { createCollection } from "@/lib/collection-store"
import type { Product } from "@/lib/domain/products"
import type { ContentAccount, ContentItem } from "@/lib/domain/content"
import type { EntityContext, Relation } from "@/lib/entities/types"
import type { MapEdgeRow, MapNodeRow } from "@/lib/domain/map-rows"

/**
 * Coleções dos módulos. Módulo novo = uma linha aqui + a tabela no SQL
 * (supabase/migrations) + as telas. Login e tempo real já cuidam do resto.
 */
export const useProducts = createCollection<Product>("products")
export const useContentAccounts = createCollection<ContentAccount>("content_accounts")
export const useContentItems = createCollection<ContentItem>("content_items")

// Fundação integrada: relações entre QUALQUER entidade e contexto comum (notas, links, anexos, comentários).
export const useRelations = createCollection<Relation>("relations")
export const useEntityContexts = createCollection<EntityContext>("entity_context")

// Mapa em 1 registro por balão/linha: cada sócio grava só o que mudou.
export const useMapNodes = createCollection<MapNodeRow>("map_nodes")
export const useMapEdges = createCollection<MapEdgeRow>("map_edges")
