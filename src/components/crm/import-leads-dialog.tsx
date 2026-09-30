"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { FileSpreadsheetIcon, Loader2Icon, UploadIcon } from "lucide-react"
import { TEAM } from "@/config/team"
import { normalizeHeader, rowsToLeads } from "@/lib/domain/lead-import"
import { distributeOwners, openCounts } from "@/lib/domain/distribution"
import { dueShortcuts, moneyInputValue, parseMoney } from "@/lib/format"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { DueDateField, Field, MoneyInput, ProductSelect, Segmented } from "@/components/shared/fields"
import { TemperatureDot } from "./lead-card"

type Sheet = { name: string; rows: unknown[][] }

/** Lê .xlsx (todas as abas) ou .csv (separador ; ou ,). */
async function readFile(file: File): Promise<Sheet[]> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text()
    const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ","
    const rows = text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((line) => {
        const out: string[] = []
        let cur = ""
        let quoted = false
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]
          if (ch === '"') {
            if (quoted && line[i + 1] === '"') {
              cur += '"'
              i++
            } else quoted = !quoted
          } else if (ch === sep && !quoted) {
            out.push(cur)
            cur = ""
          } else cur += ch
        }
        out.push(cur)
        return out
      })
    return [{ name: file.name, rows }]
  }
  const { default: readXlsxFile } = await import("read-excel-file/browser")
  const sheets = await readXlsxFile(file)
  return sheets.map((s) => ({ name: s.sheet, rows: s.data as unknown[][] }))
}

/** Aba de roteiro/abordagem (2 colunas: etapa + texto) vira uma nota. */
function scriptSheet(sheets: Sheet[]) {
  return sheets.find((s) => /abordagem|roteiro|script|sdr/i.test(normalizeHeader(s.name)))
}

export function ImportLeadsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const leads = useStore((s) => s.leads)
  const createLead = useStore((s) => s.createLead)
  const updateLead = useStore((s) => s.updateLead)
  const logInteraction = useStore((s) => s.logInteraction)
  const createNote = useStore((s) => s.createNote)
  const updateNote = useStore((s) => s.updateNote)

  const [fileName, setFileName] = useState("")
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [productId, setProductId] = useState<string | undefined>()
  const [valueText, setValueText] = useState("")
  const [owner, setOwner] = useState<string>("dividir")
  const [action, setAction] = useState("Primeiro contato pelo WhatsApp")
  const [dueDate, setDueDate] = useState<string | undefined>(dueShortcuts()[0].value)
  // Desligado por padrão: o roteiro só vira nota se a pessoa marcar.
  const [saveScript, setSaveScript] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fillExisting, setFillExisting] = useState(true)

  const leadSheets = sheets.filter((s) => s !== scriptSheet(sheets))
  const sheet = leadSheets[sheetIdx]
  const script = scriptSheet(sheets)
  const defaultValueCents = parseMoney(valueText) ?? 0

  const preview = useMemo(
    () => (sheet ? rowsToLeads(sheet.rows, { defaultValueCents, existingNames: leads.map((l) => l.name) }) : null),
    [sheet, defaultValueCents, leads],
  )

  function reset() {
    setFileName("")
    setSheets([])
    setSheetIdx(0)
    setBusy(false)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) return toast.error("Planilha muito grande (máx. 5 MB).")
    try {
      const read = await readFile(file)
      setFileName(file.name)
      setSheets(read)
      setSheetIdx(0)
    } catch {
      toast.error("Não consegui ler o arquivo. Use .xlsx ou .csv.")
    }
  }

  /** Só preenche o que está vazio (nunca sobrescreve o que alguém já editou). */
  function completeExisting() {
    let updated = 0
    for (const row of preview?.existing ?? []) {
      const lead = leads.find((l) => normalizeHeader(l.name) === normalizeHeader(row.name))
      if (!lead) continue
      const patch: Parameters<typeof updateLead>[1] = {}
      if (!lead.website && row.website) patch.website = row.website
      // Contato que era só o link do site (importação antiga) dá lugar ao telefone.
      const contactIsUrl = !!lead.contact && /^https?:\/\//.test(lead.contact)
      if ((!lead.contact || contactIsUrl) && row.contact !== lead.contact) patch.contact = row.contact
      if (!lead.productId && productId) patch.productId = productId
      if (Object.keys(patch).length) {
        updateLead(lead.id, patch)
        updated++
      }
    }
    return updated
  }

  function run() {
    const creating = preview?.leads.length ?? 0
    const updating = fillExisting ? (preview?.existing.length ?? 0) : 0
    if (!preview || (!creating && !updating) || (creating && (!action.trim() || !dueDate))) return
    setBusy(true)
    const updated = fillExisting ? completeExisting() : 0
    // "Dividir": continua o meio a meio a partir de quantos leads abertos cada um já tem.
    const owners = owner === "dividir" ? distributeOwners(preview.leads.length, leads, TEAM.map((u) => u.id), productId) : []
    preview.leads.forEach((l, i) => {
      const ownerId = owner === "dividir" ? owners[i] : owner
      const lead = createLead({
        name: l.name,
        company: l.company,
        contact: l.contact,
        website: l.website,
        valueCents: l.valueCents,
        temperature: l.temperature,
        ownerId,
        productId,
        nextAction: { text: action.trim(), dueDate: dueDate! },
      })
      if (l.note) logInteraction(lead.id, "nota", `Importado de ${fileName}\n${l.note}`)
    })
    if (script && saveScript) {
      const body = script.rows
        .slice(1)
        .filter((r) => r.some((c) => c))
        .map((r) => `${String(r[0] ?? "").trim()}\n${String(r[1] ?? "").trim()}`)
        .join("\n\n")
      const note = createNote()
      updateNote(note.id, { title: `${script.name} — ${fileName.replace(/\.[^.]+$/, "")}`, body })
    }
    toast.success([creating && `${creating} leads importados`, updated && `${updated} atualizados`].filter(Boolean).join(" · ") || "Nada para mudar", {
      description: preview.skipped.length ? `${preview.skipped.length} linhas puladas (vazias ou repetidas).` : undefined,
    })
    reset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar leads de planilha</DialogTitle>
          <DialogDescription>Excel (.xlsx) ou CSV. As colunas são reconhecidas pelo nome; o que não virar campo vai como anotação no lead.</DialogDescription>
        </DialogHeader>

        {!sheets.length ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center transition-colors hover:border-foreground/30 hover:bg-accent/40">
            <FileSpreadsheetIcon className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">Escolher planilha</span>
            <span className="t-desc text-xs">Colunas reconhecidas: Empresa/Nome, WhatsApp/Telefone, E-mail, Site, Segmento, Prioridade, Valor</span>
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <FileSpreadsheetIcon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{fileName}</span>
              {leadSheets.length > 1 && (
                <select value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))} className="h-7 rounded-md border bg-card px-2 text-xs" aria-label="Aba">
                  {leadSheets.map((s, i) => (
                    <option key={s.name} value={i}>
                      Aba: {s.name}
                    </option>
                  ))}
                </select>
              )}
              <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
                trocar
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Produto" hint="rastreia todos no produto">
                <ProductSelect value={productId} onChange={setProductId} />
              </Field>
              <Field label="Valor estimado de cada lead" hint="se a planilha não tiver">
                <MoneyInput value={valueText} onChange={(t) => setValueText(t)} placeholder={moneyInputValue(0) || "0,00"} />
              </Field>
            </div>
            <Field
              label="Responsável"
              hint={
                owner === "dividir" && preview?.leads.length
                  ? (() => {
                      const ids = TEAM.map((u) => u.id)
                      const after = openCounts(leads, ids, productId)
                      for (const o of distributeOwners(preview.leads.length, leads, ids, productId)) after.set(o, after.get(o)! + 1)
                      return `fica ${TEAM.map((u) => `${u.name} ${after.get(u.id)}`).join(" · ")} leads abertos`
                    })()
                  : undefined
              }
            >
              <Segmented
                value={owner}
                onChange={setOwner}
                options={[{ value: "dividir", label: "Dividir igualmente" }, ...TEAM.map((u) => ({ value: u.id, label: `Só ${u.name}` }))]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Próxima ação de todos">
                <Input value={action} onChange={(e) => setAction(e.target.value)} />
              </Field>
              <Field label="Para quando">
                <DueDateField value={dueDate} onChange={setDueDate} />
              </Field>
            </div>
            {!!preview?.existing.length && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" checked={fillExisting} onCheckedChange={(v) => setFillExisting(!!v)} />
                <span>
                  Completar os <span className="font-medium">{preview.existing.length} leads que já existem</span>
                  <span className="t-desc block text-xs">Só preenche o que está vazio (site, WhatsApp, produto). Nada que vocês editaram é sobrescrito.</span>
                </span>
              </label>
            )}
            {script && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saveScript} onCheckedChange={(v) => setSaveScript(!!v)} />
                Salvar a aba <span className="font-medium">“{script.name}”</span> como nota (roteiro de abordagem)
              </label>
            )}

            {preview && (
              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <p className="text-sm font-semibold">
                    {preview.leads.length} novos
                    {!!preview.existing.length && <span className="t-desc font-normal"> · {preview.existing.length} já existem</span>}
                    {preview.skipped.length > 0 && <span className="t-desc font-normal"> · {preview.skipped.length} linhas puladas</span>}
                  </p>
                </div>
                <ul className="max-h-56 divide-y overflow-y-auto">
                  {preview.leads.map((l) => (
                    <li key={l.row} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                      <TemperatureDot lead={{ temperature: l.temperature } as never} />
                      <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                      <span className="t-desc hidden w-40 truncate text-xs sm:block">{l.company}</span>
                      <span className="t-desc w-32 truncate text-right text-xs">{l.contact ?? "—"}</span>
                      <span className="t-desc hidden w-40 truncate text-right text-xs md:block">{l.website?.replace(/^https?:\/\//, "")}</span>
                    </li>
                  ))}
                  {preview.skipped.map((s) => (
                    <li key={`s${s.row}`} className="px-3 py-1.5 text-xs text-muted-foreground">
                      Linha {s.row}: pulada ({s.reason})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => (reset(), onClose())}>
                Cancelar
              </Button>
              <Button
                onClick={run}
                disabled={
                  busy ||
                  !preview ||
                  (!preview.leads.length && !(fillExisting && preview.existing.length)) ||
                  (!!preview.leads.length && (!action.trim() || !dueDate))
                }
              >
                {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
                {preview?.leads.length
                  ? `Importar ${preview.leads.length}${fillExisting && preview.existing.length ? ` e completar ${preview.existing.length}` : ""}`
                  : `Completar ${preview?.existing.length ?? 0} leads`}
              </Button>
            </div>
            <p className={cn("t-desc text-xs", !productId && "text-warning")}>
              {productId ? "Todos os leads entram em “Novo” ligados ao produto escolhido." : "Dica: escolha o produto para acompanhar esses leads na página dele."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
