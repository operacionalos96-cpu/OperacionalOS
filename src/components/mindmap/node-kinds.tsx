"use client"

import {
  BadgeDollarSignIcon,
  FolderKanbanIcon,
  LightbulbIcon,
  ListCollapseIcon,
  PackageIcon,
  SignpostIcon,
  SquareCheckIcon,
  TargetIcon,
  UserRoundCheckIcon,
  type LucideIcon,
} from "lucide-react"
import type { NodeKind } from "@/lib/domain/mindmap"

export const NODE_KIND_ICON: Record<NodeKind, LucideIcon> = {
  ideia: LightbulbIcon,
  projeto: FolderKanbanIcon,
  tarefa: SquareCheckIcon,
  venda: BadgeDollarSignIcon,
  cliente: UserRoundCheckIcon,
  produto: PackageIcon,
  meta: TargetIcon,
  decisao: SignpostIcon,
  resumo: ListCollapseIcon,
}
