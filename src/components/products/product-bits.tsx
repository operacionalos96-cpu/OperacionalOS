import { PRODUCT_KINDS, PRODUCT_STATUSES, type ProductKind, type ProductStatus } from "@/lib/domain/products"
import { cn } from "@/lib/utils"

export function ProductStatusBadge({ status, className }: { status: ProductStatus; className?: string }) {
  const meta = PRODUCT_STATUSES.find((s) => s.id === status)!
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1.5 py-px text-[11px] font-medium",
        meta.tone === "success" ? "bg-success-soft text-success" : meta.tone === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.tone === "success" ? "bg-success" : meta.tone === "warning" ? "bg-warning" : "bg-muted-foreground")} />
      {meta.label}
    </span>
  )
}

export function productKindLabel(kind: ProductKind) {
  return PRODUCT_KINDS.find((k) => k.id === kind)?.label ?? kind
}
