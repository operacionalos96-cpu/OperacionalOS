"use client"

import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ptBR as dayPickerPtBR } from "react-day-picker/locale"
import { CalendarIcon } from "lucide-react"
import { TEAM } from "@/config/team"
import { TEMPERATURES } from "@/lib/domain/constants"
import type { Temperature } from "@/lib/domain/types"
import { dueShortcuts, parseMoney, toDateKey } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import { useProducts } from "@/lib/modules"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Botões segmentados. Com 2 pessoas, um clique é melhor que um dropdown. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "default",
  className,
}: {
  value: T | undefined
  onChange: (v: T) => void
  options: { value: T; label: React.ReactNode }[]
  size?: "sm" | "default"
  className?: string
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-muted p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 font-medium text-muted-foreground transition-[color,background-color,box-shadow,transform] duration-200 hover:text-foreground active:scale-[0.97]",
            size === "sm" ? "h-6 text-xs" : "h-7 text-sm",
            value === o.value && "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function OwnerToggle({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={TEAM.map((u) => ({
        value: u.id,
        label: (
          <>
            <span className="size-2 rounded-full" style={{ backgroundColor: u.color }} />
            {u.name}
          </>
        ),
      }))}
    />
  )
}

export function TemperatureToggle({
  value,
  onChange,
}: {
  value: Temperature | undefined
  onChange: (t: Temperature | undefined) => void
}) {
  return (
    <Segmented
      value={value ?? ("none" as Temperature)}
      onChange={(v) => onChange((v as string) === "none" ? undefined : v)}
      options={[
        { value: "none" as Temperature, label: "—" },
        ...TEMPERATURES.map((t) => ({
          value: t.id,
          label: (
            <>
              <span className={cn("size-2 rounded-full", t.dot)} />
              {t.label}
            </>
          ),
        })),
      ]}
    />
  )
}

/** Prazo: atalhos de um clique + calendário para o resto. */
export function DueDateField({
  value,
  onChange,
  allowEmpty = false,
}: {
  value: string | undefined
  onChange: (v: string | undefined) => void
  allowEmpty?: boolean
}) {
  const shortcuts = dueShortcuts()
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {allowEmpty && (
        <Chip active={!value} onClick={() => onChange(undefined)}>
          Sem prazo
        </Chip>
      )}
      {shortcuts.map((s) => (
        <Chip key={s.label} active={value === s.value} onClick={() => onChange(s.value)}>
          {s.label}
        </Chip>
      ))}
      <CalendarChip value={value} onChange={onChange} highlight={!!value && !shortcuts.some((s) => s.value === value)} />
    </div>
  )
}

/** Chip que abre um calendário. `highlight` = a data escolhida não está nos atalhos. */
export function CalendarChip({
  value,
  onChange,
  highlight,
}: {
  value: string | undefined
  onChange: (v: string) => void
  highlight: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip active={highlight}>
          <CalendarIcon className="size-3.5" />
          {highlight && value ? format(parseISO(value), "dd MMM", { locale: ptBR }) : "Data"}
        </Chip>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={dayPickerPtBR}
          selected={value ? parseISO(value) : undefined}
          defaultMonth={value ? parseISO(value) : undefined}
          onSelect={(d) => {
            if (d) onChange(toDateKey(d))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export function Chip({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.96]",
        active
          ? "border-foreground/80 bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:-translate-y-px hover:border-foreground/25 hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    />
  )
}

/** Campo de valor em R$. Guarda o texto digitado e devolve centavos. */
export function MoneyInput({
  value,
  onChange,
  autoFocus,
  id,
  placeholder = "0,00",
}: {
  value: string
  onChange: (text: string, cents: number | null) => void
  autoFocus?: boolean
  id?: string
  placeholder?: string
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
      <Input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        className="tabular pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value, parseMoney(e.target.value))}
      />
    </div>
  )
}

/** Seleciona um lead aberto (ou nenhum). */
export function LeadSelect({
  value,
  onChange,
  placeholder = "Nenhum lead",
  includeClosed = false,
}: {
  value: string | undefined
  onChange: (id: string | undefined) => void
  placeholder?: string
  includeClosed?: boolean
}) {
  const leads = useStore((s) => s.leads)
  const options = leads
    .filter((l) => includeClosed || (l.stage !== "perdido" && l.stage !== "ganho") || l.id === value)
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {options.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.name}
            {l.company ? <span className="text-muted-foreground"> · {l.company}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline gap-1.5">
        <span className="t-label">{label}</span>
        {hint && <span className="t-desc text-xs">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

export function SubmitRow({
  onCancel,
  submitLabel,
  disabled,
}: {
  onCancel: () => void
  submitLabel: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <span className="mr-auto hidden text-xs text-muted-foreground sm:block">
        <kbd className="rounded border bg-muted px-1 font-sans">Ctrl</kbd>+<kbd className="rounded border bg-muted px-1 font-sans">Enter</kbd> salva
      </span>
      <Button type="button" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  )
}

/** Ctrl/Cmd+Enter envia o form de qualquer campo (inclusive textarea). */
export function submitOnModEnter(e: React.KeyboardEvent<HTMLFormElement>) {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    e.currentTarget.requestSubmit()
  }
}

/** Seleciona um produto (ou nenhum). Arquivados só aparecem se já estiverem escolhidos. */
export function ProductSelect({
  value,
  onChange,
  placeholder = "Nenhum produto",
}: {
  value: string | undefined
  onChange: (id: string | undefined) => void
  placeholder?: string
}) {
  const products = useProducts((s) => s.items)
  const options = products.filter((p) => p.status !== "arquivado" || p.id === value).sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Select value={value ?? "none"} onValueChange={(v) => onChange(v === "none" ? undefined : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{placeholder}</SelectItem>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
