"use client"

import { useState } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BotAvatar, Card, Label } from "@/components/dock/ui"
import type { NewRoutine } from "@/lib/dock/api"
import { useDock } from "@/lib/dock/store"

const WEEK = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]
const when = (r: { kind: string; timeLocal: string; weekday: number | null; monthday: number | null }) =>
  r.kind === "diaria" ? `todo dia, ${r.timeLocal}` : r.kind === "semanal" ? `${WEEK[r.weekday ?? 1]}, ${r.timeLocal}` : `dia ${r.monthday}, ${r.timeLocal}`

/** Rotinas: pedidos que rodam sozinhos. Numa rotina, ação de classe C nunca segue sozinha. */
export default function DockRoutinesPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const [edit, setEdit] = useState<NewRoutine | null>(null)
  const blank = (): NewRoutine => ({ agentId: d.agents[0]?.id ?? "", title: "", prompt: "", kind: "semanal", time: "08:00", weekday: 1, monthday: 1 })

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <p className="t-desc flex-1">Pedidos que rodam sozinhos. Se o PC estiver desligado na hora, rodam quando a Ponte voltar. Ações de classe C sempre esperam você.</p>
        <Button variant="brand" disabled={!d.agents.length} onClick={() => setEdit(blank())}><PlusIcon />Nova rotina</Button>
      </div>
      <Card className="grid gap-1 p-2">
        {d.routines.length === 0 && <p className="t-desc p-3">Nenhuma rotina ainda.</p>}
        {d.routines.map((r) => {
          const a = d.agents.find((x) => x.id === r.agentId)
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-[11px] px-3 py-2 text-sm hover:bg-foreground/[0.04]">
              {a && <BotAvatar d={d} a={a} size={28} />}
              <button className="min-w-0 flex-1 text-left" onClick={() => setEdit({ id: r.id, agentId: r.agentId, title: r.title, prompt: r.prompt, kind: r.kind, time: r.timeLocal, weekday: r.weekday, monthday: r.monthday })}>
                <b>{r.title}</b><span className="block text-xs text-muted-foreground">{a?.name} · {when(r)}</span>
              </button>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" role="switch" checked={r.enabled} onChange={() => run((api) => api.setRoutineEnabled(r.id, !r.enabled))} aria-label={`Ligar ${r.title}`} />ligada
              </label>
            </div>
          )
        })}
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Editar rotina" : "Nova rotina"}</DialogTitle></DialogHeader>
          {edit && (
            <>
              <Label>Bot</Label>
              <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={edit.agentId} onChange={(e) => setEdit({ ...edit, agentId: e.target.value })}>
                {d.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Label>Nome</Label><Input value={edit.title} maxLength={120} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              <Label>O pedido</Label><Textarea rows={4} value={edit.prompt} onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} />
              <Label>Quando</Label>
              <div className="flex flex-wrap gap-2">
                <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as NewRoutine["kind"] })}>
                  <option value="diaria">Todo dia</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option>
                </select>
                {edit.kind === "semanal" && <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={edit.weekday ?? 1} onChange={(e) => setEdit({ ...edit, weekday: +e.target.value })}>{WEEK.map((w, i) => <option key={w} value={i}>{w}</option>)}</select>}
                {edit.kind === "mensal" && <Input type="number" min={1} max={28} className="w-20" value={edit.monthday ?? 1} onChange={(e) => setEdit({ ...edit, monthday: +e.target.value })} />}
                <Input type="time" className="w-28" value={edit.time} onChange={(e) => setEdit({ ...edit, time: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button>
                <Button variant="brand" disabled={!edit.title.trim() || !edit.prompt.trim() || !edit.agentId} onClick={async () => { const id = await run((api) => api.saveRoutine(edit), "Rotina salva."); if (id) setEdit(null) }}>Salvar</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
