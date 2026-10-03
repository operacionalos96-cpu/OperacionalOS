"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CheckIcon, MessageSquareReplyIcon, RadarIcon, Undo2Icon, XIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { rejectionLabel, reviewStatus } from "@/lib/domain/prospecting"
import type { Lead } from "@/lib/domain/types"
import { relative } from "@/lib/format"
import { approveLead, markReplied, undoReview } from "@/lib/services/ai-office"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/layout"
import { RejectLeadDialog } from "./reject-dialog"

/** Análise (o que a IA/planilha pensou) ao lado da decisão humana — os dois ficam guardados. */
export function AnalysisBlock({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const a = lead.analysis
  if (!a) return <p className="t-desc text-sm">Sem análise ainda. Ela vem da planilha (nota, problemas, oportunidade) ou, no futuro, do Web Analyst.</p>
  return (
    <div className={cn("grid gap-3 text-sm", compact && "gap-2")}>
      {(a.siteScore !== undefined || a.qualificationScore !== undefined) && (
        <div className="flex flex-wrap gap-2">
          {a.siteScore !== undefined && <Score label="Nota do site" value={a.siteScore} invert />}
          {a.qualificationScore !== undefined && <Score label="Qualificação" value={a.qualificationScore} />}
        </div>
      )}
      {!!a.problems?.length && (
        <div>
          <p className="t-label">Problemas detectados</p>
          <ul className="mt-1 grid gap-0.5">
            {a.problems.map((p, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-danger">•</span> {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.opportunity && (
        <div>
          <p className="t-label">Oportunidade</p>
          <p className="mt-1">{a.opportunity}</p>
        </div>
      )}
      {a.summary && (
        <div>
          <p className="t-label">Resumo</p>
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{a.summary}</p>
        </div>
      )}
      {!compact && a.analyzedBy && <p className="text-[11px] text-muted-foreground">Analisado por {a.analyzedBy}{a.analyzedAt ? ` · ${relative(a.analyzedAt)}` : ""}</p>}
    </div>
  )
}

/** Nota 0–10 com cor. `invert`: nota baixa é BOA oportunidade (site ruim). */
function Score({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value <= 5 : value >= 7
  const bad = invert ? value >= 8 : value <= 3
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-xs", good && "border-success/40 text-success", bad && "text-muted-foreground")}>
      {label} <strong className="tabular text-sm">{value}</strong>/10
    </span>
  )
}

/** Painel na página do lead: revisão humana (aprovar/descartar) + análise. */
export function ReviewPanel({ lead }: { lead: Lead }) {
  const [rejecting, setRejecting] = useState(false)
  const st = reviewStatus(lead)
  const r = lead.review

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <RadarIcon className="size-4 text-muted-foreground" /> Revisão e análise
        </span>
      }
      aside={
        <Link href="/prospeccao" className="text-xs text-muted-foreground hover:text-foreground">
          Modo Prospecção
        </Link>
      }
    >
      <div className="grid gap-4 p-4">
        {st === "pending" && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                const previous = lead.review
                approveLead(lead.id)
                toast.success(`${lead.name} aprovado`, { action: { label: "Desfazer", onClick: () => undoReview(lead.id, previous) } })
              }}
            >
              <CheckIcon /> Aprovar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <XIcon /> Descartar
            </Button>
          </div>
        )}
        {st === "approved" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-success-soft px-2 py-1 font-medium text-success">Aprovado</span>
            <span className="text-xs text-muted-foreground">
              por {getUser(r?.approvedBy ?? "").name} {r?.approvedAt ? relative(r.approvedAt) : ""}
              {lead.contactStatus === "contacted" && lead.firstContactAt ? ` · contato ${relative(lead.firstContactAt)}` : " · ainda sem contato"}
            </span>
            {lead.contactStatus === "contacted" && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  markReplied(lead.id)
                  toast.success("Resposta registrada")
                }}
              >
                <MessageSquareReplyIcon /> Respondeu
              </Button>
            )}
          </div>
        )}
        {st === "rejected" && (
          <div className="grid gap-1 rounded-lg border border-dashed px-3 py-2 text-sm">
            <p>
              <span className="font-medium">Descartado:</span> {rejectionLabel(r?.rejectionReason)}
              <span className="text-xs text-muted-foreground"> · {getUser(r?.rejectedBy ?? "").name} {r?.rejectedAt ? relative(r.rejectedAt) : ""}</span>
            </p>
            {r?.rejectionNotes && <p className="text-muted-foreground">“{r.rejectionNotes}”</p>}
            <p className="text-xs text-muted-foreground">Fora do Pipeline. Continua guardado para aprendizado.</p>
            <Button size="xs" variant="ghost" className="w-fit" onClick={() => undoReview(lead.id, { status: "pending" })}>
              <Undo2Icon /> Voltar para revisão
            </Button>
          </div>
        )}
        <AnalysisBlock lead={lead} />
      </div>
      <RejectLeadDialog lead={lead} open={rejecting} onOpenChange={setRejecting} />
    </Panel>
  )
}
