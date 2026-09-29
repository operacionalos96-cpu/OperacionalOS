import { cn } from "@/lib/utils"
import { getUser } from "@/config/team"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type Size = "xs" | "sm" | "md"

/** Só o círculo com as iniciais, sem tooltip (para usar dentro de outros gatilhos). */
export function AvatarDot({ userId, size = "sm", className }: { userId: string; size?: Size; className?: string }) {
  const user = getUser(userId)
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        size === "xs" && "size-4 text-[8px]",
        size === "sm" && "size-5 text-[9px]",
        size === "md" && "size-7 text-[11px]",
        className,
      )}
      style={{ backgroundColor: user.color }}
      aria-label={user.name}
    >
      {user.initials}
    </span>
  )
}

/** Avatar de responsável com o nome no hover. Ownership sempre visível. */
export function UserAvatar({
  userId,
  size = "sm",
  withName = false,
  className,
}: {
  userId: string
  size?: Size
  withName?: boolean
  className?: string
}) {
  if (withName) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
        <AvatarDot userId={userId} size={size} />
        {getUser(userId).name}
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)}>
          <AvatarDot userId={userId} size={size} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{getUser(userId).name}</TooltipContent>
    </Tooltip>
  )
}
