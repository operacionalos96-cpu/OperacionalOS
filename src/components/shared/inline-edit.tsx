"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

/** Texto que vira input ao clicar. Salva no blur ou Enter; Esc cancela. */
export function InlineText({
  value,
  onSave,
  placeholder,
  className,
  required = false,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  className?: string
  required?: boolean
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  function commit() {
    const v = draft.trim()
    if (required && !v) return setDraft(value)
    if (v !== value) onSave(v)
  }

  return (
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setDraft(value)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
      className={cn(
        "w-full min-w-0 rounded-md bg-transparent px-1.5 py-0.5 -mx-1.5 outline-none hover:bg-accent focus:bg-background focus:ring-2 focus:ring-ring/40",
        className,
      )}
    />
  )
}
