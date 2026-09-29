"use client"

import Link from "next/link"
import { InfoIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function PageHeader({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 border-b bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description && <p className="t-desc mt-0.5">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

/** Empty state que ensina o que fazer, não só "sem dados". */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex animate-enter flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      {Icon && (
        <div className="mb-1 flex size-11 items-center justify-center rounded-xl border bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Panel({
  title,
  description,
  aside,
  children,
  className,
  style,
}: {
  title?: React.ReactNode
  /** Uma linha explicando o que o bloco mostra. */
  description?: React.ReactNode
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-card", className)} style={style}>
      {(title || aside) && (
        <div className="flex items-start gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="t-title">{title}</h2>}
            {description && <p className="t-desc mt-0.5 text-xs">{description}</p>}
          </div>
          {aside && <div className="ml-auto flex items-center gap-2 self-center">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** "?" discreto que explica o que um número significa e como é calculado. */
export function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.preventDefault()}
          className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground"
          aria-label="O que é isto?"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{children}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Card de indicador: rótulo em caixa-alta, valor grande e uma linha de contexto.
 * Neutro por padrão; `accent` só quando a cor significa algo (ex.: meta batida).
 * Com `href`, o card inteiro navega.
 */
export function StatCard({
  label,
  info,
  icon: Icon,
  accent,
  href,
  aside,
  children,
  className,
  style,
}: {
  label: string
  info?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  accent?: string
  href?: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon && (
          <span className="flex size-6 items-center justify-center text-muted-foreground" style={accent ? { color: accent } : undefined}>
            <Icon className="size-4" />
          </span>
        )}
        <p className="t-label">{label}</p>
        {info && <InfoTip>{info}</InfoTip>}
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </>
  )
  const cls = cn("relative flex flex-col rounded-xl border bg-card p-5 shadow-card stagger", className)
  return href ? (
    <Link href={href} className={cn(cls, "lift")} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  )
}

/** Título de grupo em lista (Atrasadas · 3). */
export function GroupLabel({ children, tone, className }: { children: React.ReactNode; tone?: "danger"; className?: string }) {
  return (
    <h3
      className={cn(
        "t-label flex items-center gap-2",
        tone === "danger" && "text-danger",
        className,
      )}
    >
      {children}
    </h3>
  )
}
