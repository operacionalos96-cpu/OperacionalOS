"use client"

import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { InfoIcon } from "lucide-react"
import { PAGES } from "@/config/pages"
import { METRICS, type MetricId } from "@/lib/domain/metrics"
import { PageHelp } from "./page-help"
import { useTilt } from "@/lib/use-tilt"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Caminho acima do título ("Produtos / Curso X"): o jeito único de voltar de uma tela de detalhe. */
export function Breadcrumb({ href, label, current }: { href: string; label: string; current?: string }) {
  return (
    <nav aria-label="Caminho" className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Link href={href} className="action-link">
        {label}
      </Link>
      {current && (
        <>
          <span aria-hidden>/</span>
          <span className="truncate text-foreground">{current}</span>
        </>
      )}
    </nav>
  )
}

/**
 * Cabeçalho padrão de página. Use `page="/rota"`: título, descrição e o botão "Como usar" vêm de
 * src/config/pages.ts (fonte única). `title`/`description` só para telas fora do menu (ex.: detalhe).
 *
 * Anatomia de toda página (nesta ordem): cabeçalho → filtros/abas → conteúdo → estado vazio que
 * ensina o próximo passo (EmptyState). Explicações longas vão para o "Como usar", não para a tela.
 */
export function PageHeader({
  page,
  title,
  description,
  actions,
  back,
  children,
}: {
  page?: (typeof PAGES)[number]["href"]
  title?: string
  description?: string
  actions?: React.ReactNode
  /** Caminho de volta (breadcrumb acima do título), ex.: { href: "/equipe", label: "Equipe" }. */
  back?: { href: string; label: string }
  children?: React.ReactNode
}) {
  const info = page ? PAGES.find((p) => p.href === page) : undefined
  // Cabeçalho fixo que encolhe ao rolar (72 → 52 px; o subtítulo some): as ações ficam sempre à mão.
  const sentinel = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      <header
        data-compact={compact ? "" : undefined}
        className="sticky top-0 z-20 border-b border-transparent bg-background/80 backdrop-blur transition-[border-color,box-shadow] duration-(--dur-3) data-compact:border-border data-compact:shadow-[0_8px_24px_-20px_rgb(0_0_0/0.25)]"
      >
        <div className={cn("page-container flex flex-col gap-3 transition-[padding] duration-(--dur-3) ease-(--ease-std)", compact ? "py-2" : "pt-6 pb-3")}>
          {back && !compact && <Breadcrumb href={back.href} label={back.label} current={title ?? info?.title} />}
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className={cn("truncate font-semibold tracking-tight transition-[font-size] duration-(--dur-3)", compact ? "text-lg" : "text-2xl")}>{title ?? info?.title}</h1>
              {(description ?? info?.purpose) && !compact && <p className="t-desc mt-0.5 text-sm">{description ?? info?.purpose}</p>}
            </div>
            {(info || actions) && (
              <div className="flex flex-wrap items-center gap-2">
                {info && <PageHelp page={info} />}
                {actions}
              </div>
            )}
          </div>
          {children}
        </div>
      </header>
    </>
  )
}

/** "Não encontrado" padrão das páginas de detalhe (o item pode ter sido apagado). */
export function NotFound({ title, backHref, backLabel }: { title: string; backHref: string; backLabel: string }) {
  return (
    <EmptyState
      title={title}
      description="Pode ter sido apagado, ou o link está incompleto."
      action={
        <Link href={backHref} className="inline-flex h-10 items-center rounded-full border bg-card px-4 text-sm font-medium shadow-card hover:bg-accent">
          {backLabel}
        </Link>
      }
    />
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

/**
 * Vazio de destaque (mock do AI Office): card grande com o ícone laranja e o traço de luz. Para
 * a tela inteira de uma seção sem itens; dentro de listas e colunas, use EmptyState.
 */
export function BigEmpty({ icon: Icon, title, text, action }: { icon: React.ComponentType<{ className?: string }>; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="relative flex animate-enter flex-col items-center gap-3 overflow-hidden rounded-2xl border bg-card px-6 py-16 text-center shadow-card">
      <Led />
      <span className="relative mb-2 flex size-20 items-center justify-center rounded-2xl border border-highlight/40 bg-highlight-soft text-highlight shadow-[0_0_20px_-12px_var(--highlight)]">
        <Icon className="size-9" />
      </span>
      <p className="relative text-xl font-semibold">{title}</p>
      {text && <p className="relative text-sm text-muted-foreground">{text}</p>}
      {action && <div className="relative mt-3">{action}</div>}
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

/**
 * Traço de luz laranja (efeito "LED"/neon da identidade): uma curva que acende no canto do card.
 * Só decoração, pequena e fraca: nunca chama mais atenção que o número. O card precisa de `relative overflow-hidden`. Use em 1 card por grupo, no máximo,
 * para a luz apontar para o que importa (meta, ticket, fila do dia).
 */
export function Led({ corner = "bottom", className }: { corner?: "bottom" | "top"; className?: string }) {
  const id = useId()
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 120"
      preserveAspectRatio="none"
      className={cn(
        "led pointer-events-none absolute right-0 h-[min(50%,4.5rem)] w-[42%] max-w-56 opacity-70",
        corner === "bottom" ? "bottom-0" : "top-0 -scale-y-100",
        className,
      )}
    >
      <defs>
        <linearGradient id={`${id}-s`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--highlight)" stopOpacity="0" />
          <stop offset="0.6" stopColor="var(--highlight)" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb48a" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--highlight)" stopOpacity="0.1" />
          <stop offset="1" stopColor="var(--highlight)" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-g`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {/* Brilho sob a curva, halo borrado e o fio de luz. */}
      <path d="M0 112 C 90 112, 150 70, 205 64 S 285 20, 320 4 L 320 120 L 0 120 Z" fill={`url(#${id}-f)`} />
      <path d="M0 112 C 90 112, 150 70, 205 64 S 285 20, 320 4" fill="none" stroke={`url(#${id}-s)`} strokeWidth="4" opacity="0.6" filter={`url(#${id}-g)`} />
      <path d="M0 112 C 90 112, 150 70, 205 64 S 285 20, 320 4" fill="none" stroke={`url(#${id}-s)`} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
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
 *
 * Use `metric`: o nome e a explicação ("?") vêm de src/lib/domain/metrics.ts, a fonte única de
 * cada número. `label` só para dar contexto ao mesmo número (ex.: "Resultado de outubro").
 */
export function StatCard({
  metric,
  label: labelOverride,
  info: infoOverride,
  icon: Icon,
  accent,
  href,
  aside,
  led,
  children,
  className,
  style,
}: {
  metric?: MetricId
  label?: string
  /** Só para indicadores que não são números do negócio (ex.: contagem local). Prefira `metric`. */
  info?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  accent?: string
  href?: string
  aside?: React.ReactNode
  /** Traço de luz no canto (efeito LED): no máximo um card por faixa. */
  led?: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const label = labelOverride ?? (metric ? METRICS[metric].label : "")
  const info = metric ? METRICS[metric].help : infoOverride
  // Mock da identidade: ícone num quadrado laranja à esquerda; rótulo, valor e contexto à direita.
  const body = (
    <>
      {led && <Led />}
      <div className="relative flex gap-4">
        {Icon && (
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-highlight/20 bg-highlight-soft text-highlight shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]"
            style={accent ? { color: accent, backgroundColor: `color-mix(in oklch, ${accent} 14%, transparent)`, borderColor: `color-mix(in oklch, ${accent} 24%, transparent)` } : undefined}
          >
            <Icon className="size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Label de KPI em 1 linha (reticências + dica): os valores ficam na mesma linha de base. */}
            <p className="truncate text-sm font-medium text-muted-foreground" title={label}>
              {label}
            </p>
            {info && <InfoTip>{info}</InfoTip>}
            {aside && <div className="ml-auto">{aside}</div>}
          </div>
          {children}
        </div>
      </div>
    </>
  )
  // Profundidade: inclina levemente na direção do mouse (desligado no toque e com "reduzir movimento").
  const tiltRef = useTilt<HTMLDivElement>()
  const cls = cn("tilt relative flex flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-card stagger", className)
  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2" style={style}>
      <div ref={tiltRef} className={cn(cls, "h-full")}>
        {body}
      </div>
    </Link>
  ) : (
    <div ref={tiltRef} className={cls} style={style}>
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
