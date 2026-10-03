"use client"

import { useState } from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import type { AiPlan, MapOp } from "@/lib/domain/ai-map"
import { noteKind } from "@/lib/domain/node-notes"
import { autocorrected, spellProps } from "@/lib/use-autocorrect"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/** Linha da lista que foi para a IA: número ("1.2") → balão. */
export interface ScopeRow {
  number: string
  id: string
  label: string
}

export interface AiScope {
  /** "mapa inteiro" ou "3 balões selecionados". */
  label: string
  mapTitle: string
  outline: string
  rows: ScopeRow[]
}

const EXAMPLES = [
  "Sugira os próximos passos de cada ramo",
  "O que está faltando neste mapa?",
  "Anote quais apps e plataformas usamos em cada etapa",
  "Corrija e padronize os textos dos balões",
  "Organize o mapa pela importância",
]

/**
 * Botão IA da tela: pedido livre sobre o mapa (ou sobre os balões selecionados).
 * A resposta chega como RASCUNHO: a pessoa marca o que aplicar. Apagar nunca vem
 * marcado. Aplicar é um passo só (Ctrl+Z desfaz). Só vai para a IA o texto do mapa.
 */
export function AiCommand({ getScope, onApply }: { getScope: () => AiScope; onApply: (ops: MapOp[], organize: boolean, rows: ScopeRow[]) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: AiPlan; rows: ScopeRow[] } | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [organize, setOrganize] = useState(false)
  const scopeLabel = open ? getScope().label : ""

  async function send(request = text) {
    if (!request.trim() || busy) return
    const scope = getScope()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/ia/mapa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "pedido", request: request.trim(), mapTitle: scope.mapTitle, outline: scope.outline, focus: { label: scope.mapTitle || "Mapa" } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.erro || "Falha na IA.")
      const plan = data.plan as AiPlan
      // Só operações que apontam para balões que existem na lista enviada.
      const known = new Set(scope.rows.map((r) => r.number))
      plan.ops = plan.ops.filter((o) => !("target" in o) || known.has(o.target))
      setResult({ plan, rows: scope.rows })
      setPicked(new Set(plan.ops.map((o, i) => (o.op === "remover" ? -1 : i)).filter((i) => i >= 0)))
      setOrganize(!!plan.organize)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na IA.")
    } finally {
      setBusy(false)
    }
  }

  function apply() {
    if (!result) return
    onApply(
      result.plan.ops.filter((_, i) => picked.has(i)),
      organize,
      result.rows,
    )
    setResult(null)
    setText("")
    setOpen(false)
  }

  const labelOf = (rows: ScopeRow[], ops: MapOp[], ref?: string) => {
    if (!ref) return ""
    const row = rows.find((r) => r.number === ref)
    if (row) return row.label || "(sem texto)"
    const created = ops.find((o) => o.op === "adicionar" && o.ref === ref)
    return created && created.op === "adicionar" ? `${created.label} (novo)` : ""
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setError(null)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Pedir à IA"
              className={cn("flex size-9 items-center justify-center rounded-lg border bg-card text-brand shadow-lift transition-colors hover:bg-brand/10", open && "bg-brand/15")}
            >
              <SparklesIcon className="size-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Pedir à IA: qualquer pedido sobre o mapa</TooltipContent>
      </Tooltip>
      <PopoverContent side="right" align="start" className="grid w-96 gap-2.5 p-3" onKeyDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <SparklesIcon className="size-4 text-brand" /> Pedir à IA
          </p>
          <p className="text-[11px] text-muted-foreground">
            Sobre: <strong className="font-medium text-foreground">{scopeLabel}</strong> · selecione balões antes para pedir só sobre eles
          </p>
        </div>

        {!result && (
          <>
            <textarea
              autoFocus
              value={text}
              rows={3}
              {...spellProps}
              disabled={busy}
              onChange={(e) => setText(autocorrected(text, e.currentTarget))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ex.: crie um ramo de lançamento com as etapas principais"
              className="field-sizing-content max-h-40 min-h-16 resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60"
            />
            <div className="flex flex-wrap gap-1">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setText(ex)
                    send(ex)
                  }}
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-brand/50 hover:text-foreground disabled:opacity-50"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button size="sm" disabled={!text.trim() || busy} onClick={() => send()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />} {busy ? "Pensando…" : "Pedir (Enter)"}
            </Button>
          </>
        )}

        {error && <p className="rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">{error}</p>}

        {result && (
          <>
            {result.plan.answer && <p className="rounded-md bg-muted/60 px-2.5 py-2 text-sm whitespace-pre-wrap">{result.plan.answer}</p>}
            {result.plan.ops.length > 0 && (
              <>
                <p className="t-label">Mudanças sugeridas (rascunho)</p>
                <ul className="grid max-h-72 gap-0.5 overflow-y-auto pr-1">
                  {result.plan.ops.map((o, i) => (
                    <li key={i}>
                      <label className={cn("flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent/60", o.op === "remover" && "text-danger")}>
                        <input
                          type="checkbox"
                          checked={picked.has(i)}
                          onChange={() => setPicked((p) => (p.has(i) ? new Set([...p].filter((x) => x !== i)) : new Set([...p, i])))}
                          className="mt-1 accent-[var(--brand)]"
                        />
                        <span className="min-w-0">{describeOp(o, (ref) => labelOf(result.rows, result.plan.ops, ref))}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={organize} onChange={(e) => setOrganize(e.target.checked)} className="accent-[var(--brand)]" />
              Organizar em árvore depois de aplicar
            </label>
            <div className="flex gap-1.5">
              <Button size="sm" disabled={!picked.size && !organize} onClick={apply}>
                Aplicar {picked.size ? picked.size : ""}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                {result.plan.ops.length ? "Descartar" : "Novo pedido"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">Ctrl+Z desfaz tudo de uma vez. Apagar nunca vem marcado.</p>
          </>
        )}
        <p className="text-[10px] text-muted-foreground">Vai para a IA só o texto do mapa (nada de leads, valores ou contatos).</p>
      </PopoverContent>
    </Popover>
  )
}

/** Uma linha legível para cada mudança sugerida. */
function describeOp(o: MapOp, label: (ref?: string) => string) {
  const q = (s: string) => `“${s}”`
  switch (o.op) {
    case "adicionar":
      return (
        <>
          <strong className="font-medium">+ {o.label}</strong>
          {o.parent ? <span className="text-muted-foreground"> em {q(label(o.parent))}</span> : <span className="text-muted-foreground"> (balão solto)</span>}
          {o.description && <span className="block text-[11px] text-muted-foreground">{o.description}</span>}
        </>
      )
    case "renomear":
      return (
        <>
          <span className="text-muted-foreground">Renomear {q(label(o.target))} →</span> <strong className="font-medium">{o.label}</strong>
        </>
      )
    case "descrever":
      return (
        <>
          <span className="text-muted-foreground">Descrição em {q(label(o.target))}:</span> {o.description}
        </>
      )
    case "anotar":
      return (
        <>
          <span className="text-muted-foreground">
            {noteKind(o.kind).label}
            {o.app ? ` (${o.app})` : ""} em {q(label(o.target))}:
          </span>{" "}
          {o.text}
        </>
      )
    case "remover":
      return <>Apagar {q(label(o.target))}</>
  }
}
