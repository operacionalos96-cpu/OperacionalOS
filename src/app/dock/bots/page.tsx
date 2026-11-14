"use client"

import { useState } from "react"
import Link from "next/link"
import { BlocksIcon, CpuIcon, GraduationCapIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BotAvatar, StateTag, Tag, agentState, pick } from "@/components/dock/ui"
import { DockAvatar } from "@/components/dock/dock-avatar"
import { areaLabel } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAreas } from "@/lib/modules"
import { cn } from "@/lib/utils"

/** Bots: a galeria com os avatares (os anéis contam o nível) e o "Novo bot", do kit da área ou do zero. */
export default function DockBotsPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const areas = useAreas((s) => s.items)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"kit" | "zero">("kit")
  const [kit, setKit] = useState<string | null>(d.kitBots[0]?.id ?? null)
  const [name, setName] = useState("")
  const [title, setTitle] = useState("")
  const areaName = (id: string) => areaLabel(id, areas)
  const k = d.kitBots.find((x) => x.id === kit)

  async function create() {
    const id = mode === "kit" && k
      ? await run((api) => api.createAgentFromKit(k.id, name.trim() || undefined), "Bot criado.")
      : await run((api) => api.createAgent({ name: name.trim(), title: title.trim() || "Bot", instructions: "", connectionId: d.connections[0]?.id ?? null, model: d.connections[0]?.models[0] ?? null }), "Bot criado.")
    if (id) setOpen(false)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {d.agents.map((a) => (
        <Link key={a.id} href="/dock" className="group grid justify-items-center gap-3 rounded-[15px] bg-card p-5 text-center transition-shadow hover:shadow-[var(--shadow-lift)]">
          <BotAvatar d={d} a={a} size={72} />
          <div className="min-w-0">
            <h3 className="t-title truncate">{a.name}</h3>
            <p className="truncate text-sm text-muted-foreground">{a.title}</p>
          </div>
          <div className="flex min-h-5 flex-wrap items-center justify-center gap-1.5">
            <StateTag state={agentState(d, a)} />
            <Tag><CpuIcon />{d.connections.find((c) => c.id === a.connectionId)?.label ?? "sem IA"}</Tag>
            <Tag title="Skills"><GraduationCapIcon />{d.agentSkills.filter((i) => i.agentId === a.id).length}</Tag>
            <Tag title="Apps"><BlocksIcon />{d.agentConnectors.filter((i) => i.agentId === a.id).length}</Tag>
          </div>
        </Link>
      ))}
      <button onClick={() => setOpen(true)} className="grid min-h-44 place-items-center rounded-[15px] border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
        <span className="grid justify-items-center gap-2 text-sm"><PlusIcon className="size-6" />Novo bot</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Novo bot</DialogTitle></DialogHeader>
          <div className="flex gap-1.5">
            {(["kit", "zero"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={pick(mode === m)}>{m === "kit" ? "Da área" : "Do zero"}</button>
            ))}
          </div>
          {mode === "kit" && (
            <div className="grid max-h-64 gap-1.5 overflow-auto">
              {d.kitBots.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum modelo ainda</p>}
              {d.kitBots.map((x) => (
                <button key={x.id} aria-pressed={kit === x.id} onClick={() => setKit(x.id)}
                  className={cn("flex items-center gap-3 rounded-[11px] px-3 py-2 text-left text-sm", kit === x.id ? "bg-card ring-[1.5px] ring-foreground" : "bg-foreground/[0.05]")}>
                  <DockAvatar name={x.name} color={x.avatarColor} glyph={x.avatarGlyph} level={0} size={30} />
                  <span className="min-w-0 flex-1"><b>{x.name}</b><span className="block truncate text-xs text-muted-foreground">{areaName(x.areaId)} · {x.title}</span></span>
                  <Tag title="Skills que já vêm"><GraduationCapIcon />{x.skillIds.length}</Tag>
                </button>
              ))}
            </div>
          )}
          <Input aria-label="Nome" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={mode === "kit" ? (k?.name ?? "Nome") : "Nome"} />
          {mode === "zero" && <Input aria-label="Para que serve" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Para que serve" />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="brand" disabled={mode === "zero" ? !name.trim() : !k} onClick={create}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
