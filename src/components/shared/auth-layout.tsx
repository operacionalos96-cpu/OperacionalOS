import { ShieldCheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Moldura das telas de acesso (login, nova senha). */
export function AuthLayout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-sidebar p-4">
      <div className={cn("w-full max-w-sm animate-enter", className)}>
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="btn-depth flex size-8 items-center justify-center rounded-lg text-sm font-extrabold">O</div>
          <p className="text-base font-bold tracking-tight">Operacional OS</p>
        </div>
        <div className="rounded-xl border bg-card p-6">{children}</div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5" /> Conexão criptografada · acesso só para membros
        </p>
      </div>
    </div>
  )
}
