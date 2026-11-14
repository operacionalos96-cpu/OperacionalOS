"use client"

import { useState } from "react"
import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BotAvatar, Card, Label, LevelTag, StateTag, Tag, agentState } from "@/components/dock/ui"
import { DockAvatar } from "@/components/dock/dock-avatar"
import { areaLabel } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAreas } from "@/lib/modules"
import { cn } from "@/lib/utils"

const ORIGIN = { do_zero: "do zero", modelo_pessoal: "modelo pessoal", modelo_area: "modelo da área", proposto_por_bot: "proposto por um bot" }

/** Bots: a galeria com os avatares e o "Novo bot" (do zero ou do Kit da área; sempre nasce no nível 0). */
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
      ? await run((api) => api.createAgentFromKit(k.id, name.trim() || undefined), "Bot criado no nível 0, com as skills do kit.")
      : await run((api) => api.createAgent({ name: name.trim(), title: title.trim() || "Bot", instructions: "", connectionId: d.connections[0]?.id ?? null, model: d.connections[0]?.models[0] ?? null }), "Bot criado no nível 0.")
    if (id) setOpen(false)
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <p className="t-desc flex-1">{d.agents.length} de 20 bots. Os <b>anéis</b> mostram o nível de acesso no seu PC: sem anel = só conversa.</p>
        <Button variant="brand" onClick={() => setOpen(true)}><PlusIcon />Novo bot</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {d.agents.map((a) => (
          <Card key={a.id} className="grid content-start gap-3">
            <div className="flex items-start gap-3">
              <BotAvatar d={d} a={a} size={64} />
              <div className="min-w-0 flex-1"><h3 className="t-title truncate">{a.name}</h3><p className="t-desc">{a.title}</p></div>
              <StateTag state={agentState(d, a)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <LevelTag level={a.accessLevel} />
              <Tag>{d.connections.find((c) => c.id === a.connectionId)?.label ?? "sem IA"}</Tag>
              <Tag>{d.agentSkills.filter((i) => i.agentId === a.id).length} skills</Tag>
              <Tag>{d.agentConnectors.filter((i) => i.agentId === a.id).length} apps</Tag>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" asChild><Link href="/dock">Conversar</Link></Button>
              <span className="flex-1 text-right text-xs text-muted-foreground">{ORIGIN[a.origin]}</span>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Novo bot</DialogTitle></DialogHeader>
          <div className="flex gap-1.5">
            {(["kit", "zero"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn("rounded-[11px] px-3 py-1.5 text-sm", mode === m ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground")}>
                {m === "kit" ? "Modelo da área" : "Do zero"}
              </button>
            ))}
          </div>
          {mode === "kit" && (
            <div className="grid max-h-64 gap-1.5 overflow-auto">
              {d.kitBots.length === 0 && <p className="t-desc">Nenhuma área montou um kit ainda.</p>}
              {d.kitBots.map((x) => (
                <button key={x.id} aria-pressed={kit === x.id} onClick={() => setKit(x.id)}
                  className={cn("flex items-center gap-3 rounded-[11px] px-3 py-2 text-left text-sm", kit === x.id ? "bg-card ring-[1.5px] ring-foreground" : "bg-foreground/[0.05]")}>
                  <DockAvatar name={x.name} color={x.avatarColor} glyph={x.avatarGlyph} level={0} size={30} />
                  <span className="flex-1"><b>{x.name}</b><span className="block text-xs text-muted-foreground">{areaName(x.areaId)} · {x.title} · {x.skillIds.length} skills</span></span>
                  {x.suggestedLevel > 0 && <Tag title="O bot nasce no 0; você sobe depois">sugere nível {x.suggestedLevel}</Tag>}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-2">
            <Label>Nome (qualquer um)</Label>
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={mode === "kit" ? k?.name : "Ex.: Ana, Pesquisa 1, Big Boss…"} />
            {mode === "zero" && <><Label>Para que serve</Label><Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></>}
          </div>
          <p className="t-desc">Todo bot nasce no nível 0 (só conversa). Depois você sobe para o nível 1 no Configurar; os níveis 2 e 3 chegam com a área isolada do Windows.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="brand" disabled={mode === "zero" ? !name.trim() : !k} onClick={create}>Criar bot</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
