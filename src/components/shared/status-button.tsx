"use client"

import { CheckIcon } from "lucide-react"
import { NODE_STATUS, type NodeStatus } from "@/lib/domain/mindmap"
import { cn } from "@/lib/utils"

/**
 * Mesmo controle em tarefas e no mapa: ○ a fazer → ◐ em andamento → ✓ feita.
 * Um clique avança para o próximo.
 */
export function StatusButton({ status, onClick, size = "sm", className }: { status: NodeStatus; onClick: () => void; size?: "sm" | "md"; className?: string }) {
  const label = `${NODE_STATUS[status].label} · clique para “${NODE_STATUS[NODE_STATUS[status].next].label}”`
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={label}
      aria-label={label}
      className={cn(
        "nodrag flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-200 hover:scale-110",
        size === "sm" ? "size-[18px]" : "size-6",
        status === "afazer" && "border-muted-foreground/50 hover:border-foreground",
        status === "andamento" && "border-warning",
        status === "feito" && "check-burst border-success bg-success text-brand-foreground",
        className,
      )}
    >
      {status === "andamento" && <span className={cn("rounded-full bg-warning", size === "sm" ? "size-2" : "size-3")} style={{ clipPath: "inset(0 50% 0 0)" }} />}
      {status === "feito" && <CheckIcon className={size === "sm" ? "size-3" : "size-4"} strokeWidth={3} />}
    </button>
  )
}
