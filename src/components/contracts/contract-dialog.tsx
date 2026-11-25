"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { CheckSquareIcon, FileTextIcon, LockIcon, PaperclipIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { getUser } from "@/config/team"
import { ownerOfArea } from "@/lib/domain/areas"
import { CONTRACT_AREA, CONTRACT_KINDS, DEFAULT_NOTICE_DAYS, contractFileProblem, renewalTask, type Contract, type ContractFile, type ContractKind } from "@/lib/domain/contracts"
import { CONTRACT_FILES_AVAILABLE, deleteContractFiles, signedContractUrl, uploadContractFile } from "@/lib/contract-storage"
import { moneyInputValue, relative, today, uid } from "@/lib/format"
import { useContracts } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useUI } from "@/lib/ui-store"
import { useAreaList, usePeople } from "@/lib/use-hzk"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, LeadSelect, MoneyInput, ProductSelect, SubmitRow, submitOnModEnter } from "@/components/shared/fields"

const area = "min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

/**
 * Contrato: criar, ver e editar num lugar só. Quem só lê a área vê os campos travados e pode abrir
 * os arquivos; quem opera a área edita, anexa, encerra e cria a tarefa de renovação.
 * Arquivo só depois de salvar: assim nenhum arquivo fica solto no banco se a pessoa desistir.
 */
export function ContractDialog({ contract, canWrite, onOpenChange }: { contract?: Contract; canWrite: boolean; onOpenChange: (open: boolean) => void }) {
  const meId = useStore((s) => s.meId)
  const save = useContracts((s) => s.save)
  const remove = useContracts((s) => s.remove)
  // Depois de criar, o diálogo continua aberto já no contrato salvo (para anexar o arquivo).
  const [savedId, setSavedId] = useState(contract?.id)
  const current = useContracts((s) => s.items.find((c) => c.id === savedId))
  const areas = useAreaList()
  const people = usePeople()

  const [title, setTitle] = useState(contract?.title ?? "")
  const [party, setParty] = useState(contract?.party ?? "")
  const [kind, setKind] = useState<ContractKind>(contract?.kind ?? "cliente")
  const [value, setValue] = useState(moneyInputValue(contract?.valueCents))
  const [valueCents, setValueCents] = useState<number | null>(contract?.valueCents ?? null)
  const [signedAt, setSignedAt] = useState(contract?.signedAt ?? "")
  const [endsAt, setEndsAt] = useState(contract?.endsAt ?? "")
  const [autoRenews, setAutoRenews] = useState(!!contract?.autoRenews)
  const [noticeDays, setNoticeDays] = useState(String(contract?.noticeDays ?? DEFAULT_NOTICE_DAYS))
  const [summary, setSummary] = useState(contract?.summary ?? "")
  const [leadId, setLeadId] = useState(contract?.leadId)
  const [productId, setProductId] = useState(contract?.productId)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const datesWrong = !!signedAt && !!endsAt && endsAt < signedAt
  const valid = title.trim().length > 0 && party.trim().length > 0 && !datesWrong

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || !canWrite) return
    const notice = Math.min(365, Math.max(1, Math.round(Number(noticeDays)) || DEFAULT_NOTICE_DAYS))
    const base: Contract = current ?? { id: uid(), title: "", party: "", kind, files: [], createdById: meId, createdAt: new Date().toISOString() }
    const next = save({
      ...base,
      title: title.trim(),
      party: party.trim(),
      kind,
      valueCents: valueCents ?? undefined,
      signedAt: signedAt || undefined,
      endsAt: endsAt || undefined,
      autoRenews: endsAt ? autoRenews : undefined,
      noticeDays: endsAt ? notice : undefined,
      summary: summary.trim() || undefined,
      leadId,
      productId,
    })
    if (current) {
      toast.success("Contrato salvo")
      onOpenChange(false)
    } else {
      setSavedId(next.id)
      toast.success("Contrato criado", { description: CONTRACT_FILES_AVAILABLE ? "Agora anexe o arquivo assinado." : undefined })
    }
  }

  async function attach(list: FileList | null) {
    if (!current || !list?.length) return
    setBusy(true)
    const added: ContractFile[] = []
    for (const file of Array.from(list)) {
      const problem = contractFileProblem(file)
      if (problem) {
        toast.error(`${file.name}: ${problem}`)
        continue
      }
      try {
        const path = await uploadContractFile(current.id, file)
        added.push({ id: uid(), name: file.name, path, sizeBytes: file.size, uploadedAt: new Date().toISOString(), uploadedBy: meId })
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "não foi possível enviar."}`)
      }
    }
    // Lê de novo: outro campo pode ter sido salvo enquanto o arquivo subia.
    const fresh = useContracts.getState().items.find((c) => c.id === current.id)
    if (fresh && added.length) {
      save({ ...fresh, files: [...fresh.files, ...added] })
      toast.success(added.length === 1 ? "Arquivo anexado" : `${added.length} arquivos anexados`)
    }
    if (fileInput.current) fileInput.current.value = ""
    setBusy(false)
  }

  async function openFile(f: ContractFile) {
    try {
      window.open(await signedContractUrl(f.path), "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Não foi possível abrir o arquivo. Confira se você tem acesso à área de Contratos.")
    }
  }

  async function removeFile(f: ContractFile) {
    if (!current || !window.confirm(`Apagar o arquivo "${f.name}"? Não dá para desfazer.`)) return
    try {
      await deleteContractFiles([f.path])
      save({ ...current, files: current.files.filter((x) => x.id !== f.id) })
      toast(`"${f.name}" apagado`)
    } catch {
      toast.error("Não foi possível apagar o arquivo.")
    }
  }

  function toggleClosed() {
    if (!current) return
    save({ ...current, closedAt: current.closedAt ? undefined : today() })
    toast(current.closedAt ? "Contrato reaberto" : "Contrato encerrado")
  }

  function createRenewalTask() {
    if (!current) return
    const plan = renewalTask(current, new Date())
    if (!plan) return
    const ownerId = ownerOfArea(areas.find((a) => a.id === CONTRACT_AREA), people) ?? meId
    const task = useStore.getState().createTask({ ...plan, ownerId, createdById: meId })
    save({ ...current, renewalTaskId: task.id })
    toast.success("Tarefa de renovação criada", { description: `Para ${getUser(ownerId).name}, na área de Contratos.` })
  }

  async function destroy() {
    if (!current || !window.confirm(`Apagar o contrato "${current.title}" e os arquivos dele? Não dá para desfazer.`)) return
    try {
      await deleteContractFiles(current.files.map((f) => f.path))
    } catch {
      return toast.error("Não foi possível apagar os arquivos; o contrato foi mantido.")
    }
    remove(current.id)
    toast(`"${current.title}" apagado`)
    onOpenChange(false)
  }

  const plan = current ? renewalTask(current, new Date()) : null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{current ? current.title : "Novo contrato"}</DialogTitle>
          <DialogDescription>
            {canWrite ? "O que foi assinado, com quem, quanto vale e até quando." : (
              <span className="inline-flex items-center gap-1.5">
                <LockIcon className="size-3.5" /> Você pode consultar. Só quem opera a área de Contratos edita.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} onKeyDown={submitOnModEnter} className="grid gap-4">
          <fieldset disabled={!canWrite} className="grid gap-4 disabled:opacity-90">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do contrato" htmlFor="k-title">
                <Input id="k-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Coprodução do Curso X" maxLength={120} autoFocus={!contract} required />
              </Field>
              <Field label="Com quem" htmlFor="k-party">
                <Input id="k-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder="Pessoa ou empresa do outro lado" maxLength={120} required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Select value={kind} onValueChange={(v) => setKind(v as ContractKind)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTRACT_KINDS.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Valor total" hint="(opcional)" htmlFor="k-value">
                <MoneyInput id="k-value" value={value} onChange={(text, cents) => (setValue(text), setValueCents(cents))} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assinado em" hint="(vazio = rascunho)" htmlFor="k-signed">
                <Input id="k-signed" type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
              </Field>
              <Field label="Vale até" hint="(vazio = sem prazo)" htmlFor="k-ends">
                <Input id="k-ends" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-invalid={datesWrong} />
              </Field>
            </div>
            {datesWrong && <p className="-mt-2 text-xs text-danger">O fim da vigência não pode ser antes da assinatura.</p>}
            {endsAt && (
              <div className="grid gap-4 rounded-xl bg-muted/60 p-3 sm:grid-cols-2">
                <label className="flex items-start gap-2.5 text-sm">
                  <input type="checkbox" checked={autoRenews} onChange={(e) => setAutoRenews(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                  <span>
                    <span className="font-medium">Renova sozinho</span>
                    <span className="block text-xs text-muted-foreground">Se ninguém avisar antes, o contrato continua valendo.</span>
                  </span>
                </label>
                <Field label="Avisar quantos dias antes" htmlFor="k-notice">
                  <Input id="k-notice" type="number" min={1} max={365} value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} />
                </Field>
              </div>
            )}
            <Field label="O que foi combinado" hint="(em palavras simples)" htmlFor="k-summary">
              <textarea id="k-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={4000} placeholder="Ex.: 40% do líquido para a HZK; pagamento todo dia 10; exclusividade por 12 meses." className={area} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente ou negócio ligado" hint="(opcional)">
                <LeadSelect value={leadId} onChange={setLeadId} includeClosed placeholder="Nenhum" />
              </Field>
              <Field label="Produto ligado" hint="(opcional)">
                <ProductSelect value={productId} onChange={setProductId} placeholder="Nenhum" />
              </Field>
            </div>
          </fieldset>

          {/* Arquivos: fora do fieldset, porque quem só consulta também abre. */}
          <section className="grid gap-2 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <PaperclipIcon className="size-4 text-muted-foreground" /> Arquivos
              </h3>
              {current && canWrite && CONTRACT_FILES_AVAILABLE && (
                <>
                  <input ref={fileInput} type="file" multiple hidden accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(e) => void attach(e.target.files)} />
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                    {busy ? "Enviando…" : "Anexar arquivo"}
                  </Button>
                </>
              )}
            </div>
            {!current ? (
              <p className="text-xs text-muted-foreground">Salve o contrato para anexar o PDF assinado.</p>
            ) : !CONTRACT_FILES_AVAILABLE ? (
              <p className="text-xs text-muted-foreground">A demonstração local não guarda arquivos. No app de verdade, o PDF fica num espaço privado da área de Contratos.</p>
            ) : current.files.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum arquivo ainda. PDF, Word (.docx) ou foto, até 20 MB.</p>
            ) : (
              <ul className="grid gap-1">
                {current.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50">
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <button type="button" onClick={() => void openFile(f)} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline">
                      {f.name}
                    </button>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {getUser(f.uploadedBy).name} · {relative(f.uploadedAt)}
                    </span>
                    {canWrite && (
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Apagar ${f.name}`} onClick={() => void removeFile(f)}>
                        <Trash2Icon />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {current && canWrite && (
            <div className="flex flex-wrap items-center gap-2">
              {plan && (
                <Button type="button" size="sm" variant="outline" onClick={createRenewalTask}>
                  <CheckSquareIcon /> Criar tarefa de renovação
                </Button>
              )}
              {current.renewalTaskId && (
                <Button type="button" size="sm" variant="ghost" onClick={() => useUI.getState().set({ taskDetail: current.renewalTaskId })}>
                  <CheckSquareIcon /> Ver tarefa de renovação
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={toggleClosed}>
                {current.closedAt ? (
                  <>
                    <RotateCcwIcon /> Reabrir
                  </>
                ) : (
                  <>
                    <LockIcon /> Encerrar contrato
                  </>
                )}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={() => void destroy()}>
                <Trash2Icon /> Apagar
              </Button>
            </div>
          )}

          {canWrite ? (
            <SubmitRow onCancel={() => onOpenChange(false)} submitLabel={current ? "Salvar" : "Criar contrato"} disabled={!valid} />
          ) : (
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
