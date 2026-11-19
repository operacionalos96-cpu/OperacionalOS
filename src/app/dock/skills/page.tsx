"use client"

import { useState } from "react"
import { BotIcon, CheckIcon, ChevronDownIcon, GraduationCapIcon, PlusIcon, SendIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, Empty, Hint, Label, Tag, pick } from "@/components/dock/ui"
import { DockAvatar } from "@/components/dock/dock-avatar"
import { areaLabel, versionOf } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAreas } from "@/lib/modules"

/** Skills: biblioteca da empresa por área, kit da área, as pessoais e as propostas de versão nova. */
export default function DockSkillsPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const areas = useAreas((s) => s.items)
  const [tab, setTab] = useState<"biblioteca" | "kit" | "minhas">("biblioteca")
  const [area, setArea] = useState<string | null>(null)
  const [newSkill, setNewSkill] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", body: "" })
  const areaName = (id: string | null) => areaLabel(id, areas)
  const libAreas = [...new Set(d.skills.filter((s) => s.scope === "area").map((s) => s.areaId!))]
  const kitArea = area ?? libAreas[0] ?? null
  const props = d.proposals.filter((p) => p.status === "aberta")
  const bots = (skillId: string) => d.agentSkills.filter((i) => i.skillId === skillId).length
  const shown = d.skills.filter((s) => (tab === "minhas" ? s.scope === "pessoal" : s.scope === "area") && !s.archived)

  return (
    <div className="grid gap-4">
      {props.map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center gap-3 shadow-[0_0_0_1.5px_var(--highlight-soft)]">
          <Tag className="bg-highlight-soft text-highlight">proposta</Tag>
          <span className="min-w-0 flex-1 text-sm">
            <b>{p.name}</b> <Tag>{p.baseVersion ? `v${versionOf(d, p.skillId!, p.baseVersion)?.label} → v${p.label}` : `nova · v${p.label}`}</Tag>
            <span className="block truncate text-xs text-muted-foreground">{p.whatChanged}</span>
          </span>
          {p.signalCount > 0 && <Tag title="Sinais de quem usa">{p.signalCount}</Tag>}
          <Hint text={p.why || "Publicar esta versão"}><Button size="sm" variant="brand" onClick={() => run((api) => api.decideProposal(p.id, true), `v${p.label} publicada.`)}><CheckIcon />Aprovar</Button></Hint>
          <Hint text="Agora não"><Button size="icon-sm" variant="ghost" aria-label="Recusar" onClick={() => run((api) => api.decideProposal(p.id, false), "Recusada.")}><XIcon /></Button></Hint>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["biblioteca", "kit", "minhas"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={pick(tab === t)}>{t === "biblioteca" ? "Empresa" : t === "kit" ? "Kit da área" : "Minhas"}</button>
        ))}
        <span className="flex-1" />
        <Button variant="outline" onClick={() => setNewSkill(true)}><PlusIcon />Nova skill</Button>
      </div>

      {tab === "kit" ? (
        <>
          <div className="flex flex-wrap gap-1.5">{libAreas.map((a) => <button key={a} onClick={() => setArea(a)} className={pick(kitArea === a)}>{areaName(a)}</button>)}</div>
          {!kitArea && <Empty icon={GraduationCapIcon} text="Nenhuma área montou um kit ainda" />}
          {kitArea && (
            <Card className="grid gap-5 md:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label>Skills</Label>
                {d.skills.filter((s) => s.areaId === kitArea && s.inKit).map((s) => <div key={s.id} className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm"><span className="flex-1">{s.name}</span><Tag>v{versionOf(d, s.id, s.currentVersion)?.label}</Tag></div>)}
              </div>
              <div className="grid content-start gap-2">
                <Label>Bots prontos</Label>
                {d.kitBots.filter((k) => k.areaId === kitArea).map((k) => (
                  <div key={k.id} className="flex items-center gap-3 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
                    <DockAvatar name={k.name} color={k.avatarColor} glyph={k.avatarGlyph} level={0} size={32} />
                    <span className="flex-1">{k.name}</span>
                    <Button size="sm" variant="outline" onClick={() => run((api) => api.createAgentFromKit(k.id), `${k.name} criado.`)}><PlusIcon />Criar</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <>
          {shown.length === 0 && <Empty icon={GraduationCapIcon} text={tab === "minhas" ? "Nenhuma skill sua ainda" : "Nenhuma skill ainda"} />}
          <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => {
              const v = versionOf(d, s.id, s.currentVersion)
              return (
                <Card key={s.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-foreground/[0.06]"><GraduationCapIcon className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.description || areaName(s.areaId)}</span>
                      </span>
                      <Tag title="Bots usando"><BotIcon />{bots(s.id)}</Tag>
                      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-3 grid gap-2 border-t border-border pt-3 text-sm">
                      <div className="flex flex-wrap gap-1.5">
                        {s.areaId && <Tag>{areaName(s.areaId)}</Tag>}
                        {(v?.minLevel ?? 0) > 0 && <Tag title="Nível mínimo do bot">nível {v?.minLevel}</Tag>}
                        {v?.requiredConnectors.map((c) => <Tag key={c} title="App que ela usa">{c}</Tag>)}
                      </div>
                      <ul className="grid gap-1">{d.versions.filter((x) => x.skillId === s.id).sort((a, b) => b.version - a.version).map((x) => <li key={x.version} className="flex gap-2"><Tag>v{x.label}</Tag><span className="min-w-0 flex-1 text-muted-foreground">{x.whatChanged}</span></li>)}</ul>
                      {s.scope === "pessoal" && libAreas.length > 0 && (
                        <div><Button size="sm" variant="outline" onClick={() => run((api) => api.proposeSkill({ areaId: libAreas[0], skillId: null, sourceSkillId: s.id, name: s.name, description: s.description, label: "1.0", whatChanged: "Skill pessoal proposta para a área.", why: "", body: s.description || s.name, minLevel: 0 }), "Proposta enviada.")}><SendIcon />Propor para a área</Button></div>
                      )}
                    </div>
                  </details>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={newSkill} onOpenChange={setNewSkill}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova skill</DialogTitle></DialogHeader>
          <Input aria-label="Nome" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome. Ex.: Meu tom de e-mail" />
          <Input aria-label="Para que serve" value={form.description} maxLength={400} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Para que serve" />
          <Textarea aria-label="Instruções" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Como fazer, passo a passo, com exemplos" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewSkill(false)}>Cancelar</Button>
            <Button variant="brand" disabled={!form.name.trim() || !form.body.trim()} onClick={async () => { const id = await run((api) => api.savePersonalSkill(form), "Skill criada."); if (id) { setNewSkill(false); setForm({ name: "", description: "", body: "" }); setTab("minhas") } }}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
