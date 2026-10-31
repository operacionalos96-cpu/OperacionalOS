"use client"

import { createCollection } from "@/lib/collection-store"
import type { Product } from "@/lib/domain/products"
import type { ContentAccount, ContentItem } from "@/lib/domain/content"
import type { EntityContext, Relation } from "@/lib/entities/types"
import type { MapEdgeRow, MapNodeRow } from "@/lib/domain/map-rows"
import type { Goal } from "@/lib/domain/insights"
import type { Agent, Hypothesis, Learning } from "@/lib/domain/ai-office"
import type { MemberRole, OrgRole } from "@/lib/domain/org"
import type { Area } from "@/lib/domain/areas"
import type { CalendarEvent } from "@/lib/domain/calendar"
import type { DailyPlan } from "@/lib/domain/presence"

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

// Metas (SQL 0006): entidade própria, progresso automático por receita, vendas ou tarefas ligadas.
export const useGoals = createCollection<Goal>("goals")

// AI Office (SQL 0010): funcionários IA (cadastro/status), aprendizados e hipóteses.
export const useAgents = createCollection<Agent>("agents")
export const useLearnings = createCollection<Learning>("learnings")
export const useHypotheses = createCollection<Hypothesis>("hypotheses")

// HZK OS (SQL 0021): áreas da empresa, cada uma com dono (src/lib/domain/areas.ts).
export const useAreas = createCollection<Area & { updatedAt?: string }>("areas")

// HZK OS (SQL 0022): agenda do time e check-in do dia (ADR 0009).
export const useCalendarEvents = createCollection<CalendarEvent>("calendar_events")
export const useDailyPlans = createCollection<DailyPlan>("daily_plans")

// Estrutura Organizacional e Cargos (SQL 0017 - HZK V1)
export const useOrgRoles = createCollection<OrgRole>("org_roles")
export const useMemberRoles = createCollection<MemberRole>("member_roles")
