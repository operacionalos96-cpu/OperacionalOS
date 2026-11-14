"use client"

import { useState } from "react"
import { BellIcon, DownloadIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, Label, Tag } from "@/components/dock/ui"
import { DockAvatar } from "@/components/dock/dock-avatar"
import { areaLabel, versionOf } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAreas } from "@/lib/modules"
import { useAccess } from "@/lib/use-access"
import { cn } from "@/lib/utils"

/** Skills: biblioteca por área, Kit da área, as pessoais e as propostas de versão nova para o responsável. */
export default function DockSkillsPage() {
  const d = useDock((s) => s.data)!
  const run = useDock((s) => s.run)
  const areas = useAreas((s) => s.items)
  const founder = useAccess().hasMinimum("owner")
  const [tab, setTab] = useState<"biblioteca" | "kit" | "minhas">("biblioteca")
  const [area, setArea] = useState<string | null>(null)
  const [newSkill, setNewSkill] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", body: "" })
  const areaName = (id: string | null) => areaLabel(id, areas)
  const libAreas = [...new Set(d.skills.filter((s) => s.scope === "area").map((s) => s.areaId!))]
  const kitArea = area ?? libAreas[0] ?? null
  const props = d.proposals.filter((p) => p.status === "aberta")
  const bots = (skillId: string) => d.agentSkills.filter((i) => i.skillId === skillId).length

  return (
    <div className="grid gap-4">
      {props.length > 0 && (
        <Card className="grid gap-3 shadow-[0_0_0_1.5px_var(--highlight-soft)]">
          <div className="flex items-center gap-2"><Tag className="bg-highlight-soft text-highlight"><BellIcon />Precisa de você</Tag><b className="text-sm">Propostas de versão nova</b></div>
          {props.map((p) => (
            <div key={p.id} className="grid gap-1.5 text-sm">
              <b>{p.name}{p.baseVersion ? ` · v${versionOf(d, p.skillId!, p.baseVersion)?.label} → v${p.label}` : ` · nova (v${p.label})`}</b>
              <p className="t-desc"><b className="text-foreground">O que muda:</b> {p.whatChanged}{p.why && <><br /><b className="text-foreground">Por quê:</b> {p.why}</>}{p.signalCount > 0 && ` (${p.signalCount} sinais de quem usa)`}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="brand" onClick={() => run((api) => api.decideProposal(p.id, true), `v${p.label} publicada. Os bots recebem com aviso.`)}>Aprovar a v{p.label}</Button>
                <Button size="sm" variant="ghost" onClick={() => run((api) => api.decideProposal(p.id, false), "Proposta recusada.")}>Agora não</Button>
                <span className="text-xs text-muted-foreground">Responsável por {areaName(p.areaId)}{founder ? " (você é founder)" : ""}.</span>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(["biblioteca", "kit", "minhas"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-[11px] px-3 py-1.5 text-sm", tab === t ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground hover:text-foreground")}>
            {t === "biblioteca" ? "Biblioteca da empresa" : t === "kit" ? "Kit da área" : "Minhas skills"}
          </button>
        ))}
        <span className="flex-1" />
        <Button variant="outline" onClick={() => setNewSkill(true)}><PlusIcon />Nova skill pessoal</Button>
      </div>

      {tab === "kit" ? (
        <>
          <p className="t-desc">Quem entra numa área instala o kit e já trabalha no mesmo padrão dos colegas, sem treinar nada.</p>
          <div className="flex flex-wrap gap-1.5">{libAreas.map((a) => <button key={a} onClick={() => setArea(a)} className={cn("rounded-[11px] px-3 py-1.5 text-sm", kitArea === a ? "bg-foreground text-background" : "bg-foreground/[0.06] text-muted-foreground")}>{areaName(a)}</button>)}</div>
          {kitArea && (
            <Card className="grid gap-4 md:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label>Skills do kit</Label>
                {d.skills.filter((s) => s.areaId === kitArea && s.inKit).map((s) => <div key={s.id} className="rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">{s.name} <Tag>v{versionOf(d, s.id, s.currentVersion)?.label}</Tag></div>)}
              </div>
              <div className="grid content-start gap-2">
                <Label>Bots modelo</Label>
                {d.kitBots.filter((k) => k.areaId === kitArea).map((k) => (
                  <div key={k.id} className="flex items-center gap-3 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
                    <DockAvatar name={k.name} color={k.avatarColor} glyph={k.avatarGlyph} level={0} size={28} />
                    <span className="flex-1">{k.name}</span>
                    <Button size="sm" onClick={() => run((api) => api.createAgentFromKit(k.id), `${k.name} criado no nível 0, com as skills do kit.`)}><DownloadIcon />Criar</Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {d.skills.filter((s) => (tab === "minhas" ? s.scope === "pessoal" : s.scope === "area") && !s.archived).map((s) => {
            const v = versionOf(d, s.id, s.currentVersion)
            return (
              <Card key={s.id} className="grid content-start gap-2">
                <div className="flex items-center gap-2"><h3 className="t-title flex-1">{s.name}</h3><Tag>v{v?.label}</Tag></div>
                <p className="t-desc">{s.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Tag>{areaName(s.areaId)}</Tag>
                  {(v?.minLevel ?? 0) > 0 && <Tag>nível {v?.minLevel}+</Tag>}
                  {v?.requiredConnectors.map((c) => <Tag key={c}>usa {c}</Tag>)}
                  <Tag>{bots(s.id)} {bots(s.id) === 1 ? "bot" : "bots"}</Tag>
                </div>
                <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">O que mudou</summary>
                  <ul className="mt-2 grid gap-1">{d.versions.filter((x) => x.skillId === s.id).sort((a, b) => b.version - a.version).map((x) => <li key={x.version}><b>v{x.label}</b> · {x.whatChanged}</li>)}</ul>
                </details>
                {s.scope === "pessoal" && libAreas.length > 0 && (
                  <Button size="sm" variant="outline" onClick={() => run((api) => api.proposeSkill({ areaId: libAreas[0], skillId: null, sourceSkillId: s.id, name: s.name, description: s.description, label: "1.0", whatChanged: "Skill pessoal proposta para a área.", why: "", body: s.description || s.name, minLevel: 0 }), "Proposta enviada ao responsável da área. Sobe o padrão, nunca as suas conversas.")}>Propor para a área</Button>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <p className="t-desc"><b className="text-foreground">Como uma skill melhora:</b> o uso gera aprendizados; o que se repete vira proposta; o responsável da área aprova. Os bots recebem a versão nova com aviso, e quem quiser fica na anterior. Instale numa skill pelo painel do bot, em Conversas.</p>

      <Dialog open={newSkill} onOpenChange={setNewSkill}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova skill pessoal</DialogTitle></DialogHeader>
          <Label>Nome</Label><Input value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Meu tom de e-mail" />
          <Label>Para que serve</Label><Input value={form.description} maxLength={400} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Label>Instruções</Label><Textarea rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Como fazer, passo a passo, e exemplos." />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setNewSkill(false)}>Cancelar</Button>
            <Button variant="brand" disabled={!form.name.trim() || !form.body.trim()} onClick={async () => { const id = await run((api) => api.savePersonalSkill(form), "Skill criada. Só você vê."); if (id) { setNewSkill(false); setForm({ name: "", description: "", body: "" }); setTab("minhas") } }}>Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
