import type { OrgRole } from "@/lib/domain/org"

export function RoleBadge({
  role,
  isPrimary,
  className = "",
}: {
  role: OrgRole
  isPrimary?: boolean
  className?: string
}) {
  const customColor = role.color || "#64748b"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
        isPrimary ? "ring-1 ring-inset ring-foreground/20" : "opacity-90"
      } ${className}`}
      style={{
        backgroundColor: `${customColor}18`,
        color: customColor,
        borderColor: `${customColor}40`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: customColor }}
      />
      {role.title}
      {isPrimary && (
        <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
          (Principal)
        </span>
      )}
    </span>
  )
}
