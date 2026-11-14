"use client"

import { useEffect, useState } from "react"
import { LockIcon, PauseIcon, PlayIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AVATAR_COLORS,
  AVATAR_ICONS,
  AVATAR_STYLES,
  LEVELS,
  LOCKED_LEVEL_REASON,
  connectorBlock,
  effectiveVersion,
  grantAllowed,
  levelReleased,
  skillBlock,
  updateWaiting,
  versionOf,
  type AccessLevel,
  type DockAgent,
  type DockData,
} from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { cn } from "@/lib/utils"
import { DockAvatar } from "./dock-avatar"
import { ClassTag, Label, Tag } from "./ui"

const chip = (on: boolean) => cn("rounded-[11px] px-3 py-1.5 text-sm transition-colors", on ? "bg-foreground font-medium text-background" : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/10 hover:text-foreground")

/** Configurar: nome, instruções, IA e reservas, aparência e nível de acesso (os anéis). */
export function BotSettings({ d, a }: { d: DockData; a: DockAgent }) {
  const run = useDock((s) => s.run)
  const [form, setForm] = useState({ name: a.name, title: a.title, instructions: a.instructions, connectionId: a.connectionId ?? "", model: a.model ?? "" })
  useEffect(() => setForm({ name: a.name, title: a.title, instructions: a.instructions, connectionId: a.connectionId ?? "", model: a.model ?? "" }), [a.id, a.name, a.title, a.instructions, a.connectionId, a.model])
  const conn = d.connections.find((c) => c.id === form.connectionId)
  const usable = d.connections.filter((c) => c.status !== "desligada")
  const patch = (extra: Partial<{ backupModels: DockAgent["backupModels"] }> = {}) => ({
    name: form.name.trim() || a.name, title: form.title.trim() || a.title, instructions: form.instructions,
    connectionId: form.connectionId || null, model: form.model || null, backupModels: extra.backupModels ?? a.backupModels, canCreateAgents: a.canCreateAgents,
  })
  const setLevel = (n: AccessLevel) => run((api) => api.setAccess(a.id, n), `Nível ${n}: ${LEVELS[n].title}.`)

  return (
    <div className="grid gap-5">
      <div className="flex items-center gap-4">
        <DockAvatar name={form.name || a.name} style={a.avatarStyle} color={a.avatarColor} glyph={a.avatarGlyph} level={a.accessLevel} size={88} />
        <div className="grid flex-1 gap-2">
          <Input aria-label="Nome" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input aria-label="Para que serve" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Aparência</Label>
        <div className="flex flex-wrap gap-1.5">
          {AVATAR_STYLES.map((s) => (
            <button key={s.id} className={chip(a.avatarStyle === s.id)} onClick={() => run((api) => api.setAvatar(a.id, s.id, null, null))}>
              {s.label}{s.id === "constelacao" ? " (padrão)" : ""}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {AVATAR_COLORS.map((c) => (
            <button key={c.id} aria-label={c.label} title={c.label} aria-pressed={a.avatarColor === c.id}
              className={cn("size-7 rounded-full ring-offset-2 ring-offset-card", a.avatarColor === c.id && "ring-2 ring-foreground")}
              style={{ background: c.hex }} onClick={() => run((api) => api.setAvatar(a.id, null, c.id, null))} />
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {[{ id: "", label: "Letra" }, ...AVATAR_ICONS.map((i) => ({ id: i, label: i === "lupa" ? "Lupa" : i === "codigo" ? "Código" : "Gráfico" }))].map((g) => (
            <button key={g.id || "letra"} className={chip(a.avatarGlyph === g.id || (!g.id && a.avatarGlyph.length <= 1))} onClick={() => run((api) => api.setAvatar(a.id, null, null, g.id))}>{g.label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Nível de acesso no PC (os anéis)</Label>
        <div className="grid gap-1.5">
          {LEVELS.map((l) => {
            const locked = !levelReleased(l.n)
            return (
              <button key={l.n} disabled={locked} aria-pressed={a.accessLevel === l.n} onClick={() => setLevel(l.n)} title={locked ? LOCKED_LEVEL_REASON : l.text}
                className={cn("flex items-center gap-3 rounded-[11px] px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                  a.accessLevel === l.n ? "bg-card ring-[1.5px] ring-foreground" : "bg-foreground/[0.05] hover:bg-foreground/[0.08]")}>
                <DockAvatar name="" style={a.avatarStyle} color={a.avatarColor} glyph=" " level={l.n} size={30} />
                <span className="flex-1"><b className="font-semibold">{l.n} · {l.title}</b><br /><span className="text-xs text-muted-foreground">{locked ? LOCKED_LEVEL_REASON : l.text}</span></span>
                {locked && <LockIcon className="size-4 text-muted-foreground" />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Instruções</Label>
        <Textarea rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="O que ele faz, como fala, o que nunca faz…" />
      </div>

      <div className="grid gap-2">
        <Label>IA principal</Label>
        <div className="flex flex-wrap gap-2">
          <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value, model: d.connections.find((c) => c.id === e.target.value)?.models[0] ?? "" })}>
            <option value="">Sem IA</option>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.label}{c.status === "sem_cota" ? " (sem cota agora)" : ""}</option>)}
          </select>
          {conn && conn.models.length > 0 && (
            <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
              {conn.models.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
        </div>
        <Label>Reservas quando a cota acabar (em ordem, até 8)</Label>
        {a.backupModels.length === 0 && <p className="t-desc">Sem reserva: se a cota acabar, o bot espera.</p>}
        {a.backupModels.map((b, i) => (
          <div key={i} className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-1.5 text-sm">
            <span className="tabular grid size-5 place-items-center rounded-full bg-card text-xs font-semibold">{i + 1}</span>
            <span className="flex-1">{d.connections.find((c) => c.id === b.connectionId)?.label ?? "?"} · {b.model}</span>
            <Button size="icon-xs" variant="ghost" aria-label="Tirar reserva" onClick={() => run((api) => api.updateAgent(a.id, patch({ backupModels: a.backupModels.filter((_, j) => j !== i) })))}><Trash2Icon /></Button>
          </div>
        ))}
        {a.backupModels.length < 8 && (
          <div className="flex flex-wrap gap-1.5">
            {usable.filter((c) => c.id !== form.connectionId && !a.backupModels.some((b) => b.connectionId === c.id)).map((c) => (
              <Button key={c.id} size="sm" variant="outline" onClick={() => run((api) => api.updateAgent(a.id, patch({ backupModels: [...a.backupModels, { connectionId: c.id, model: c.models[0] ?? "padrão" }] })))}>
                <PlusIcon />{c.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="brand" onClick={() => run((api) => api.updateAgent(a.id, patch()), "Salvo. As instruções viraram uma versão nova.")}>Salvar</Button>
        <Button variant="outline" onClick={() => run((api) => api.setPaused(a.id, !a.paused), a.paused ? "Retomado." : "Pausado: as mensagens esperam na fila.")}>
          {a.paused ? <PlayIcon /> : <PauseIcon />}{a.paused ? "Retomar" : "Pausar"}
        </Button>
      </div>
    </div>
  )
}

/** Skills do bot: instaladas (com aviso de versão nova) e as da biblioteca que ele pode receber. */
export function BotSkills({ d, a }: { d: DockData; a: DockAgent }) {
  const run = useDock((s) => s.run)
  const mine = d.agentSkills.filter((i) => i.agentId === a.id)
  const others = d.skills.filter((s) => !s.archived && !mine.some((i) => i.skillId === s.id))
  return (
    <div className="grid gap-4">
      <p className="t-desc">As skills ficam presas ao bot e funcionam com qualquer IA: trocar a IA não perde nada.</p>
      <div className="grid gap-2">
        <Label>Instaladas ({mine.length})</Label>
        {mine.map((i) => {
          const s = d.skills.find((x) => x.id === i.skillId)
          if (!s) return null
          const eff = effectiveVersion(d, i, a.accessLevel)
          const waiting = updateWaiting(d, i, a.accessLevel)
          const cur = versionOf(d, s.id, s.currentVersion)
          return (
            <div key={i.skillId} className="grid gap-1.5 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <b className="flex-1 font-semibold">{s.name}</b>
                <Tag>v{eff ? versionOf(d, s.id, eff)?.label : "—"}</Tag>
                {i.pinnedVersion !== null && <Tag>fixada</Tag>}
                <Button size="icon-xs" variant="ghost" aria-label="Tirar skill" onClick={() => run((api) => api.uninstallSkill(a.id, s.id))}><Trash2Icon /></Button>
              </div>
              {waiting && cur && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <TriangleAlertIcon className="size-3.5 text-warning" /> Versão {cur.label} pede mais ({cur.minLevel > a.accessLevel ? `nível ${cur.minLevel}` : "outro app"}): {cur.whatChanged}
                  <Button size="xs" onClick={() => run((api) => api.ackSkillUpdate(a.id, s.id, "atualizar"))}>Atualizar</Button>
                  <Button size="xs" variant="outline" onClick={() => run((api) => api.ackSkillUpdate(a.id, s.id, "fixar"))}>Ficar nesta</Button>
                </div>
              )}
            </div>
          )
        })}
        {mine.length === 0 && <p className="t-desc">Nenhuma ainda.</p>}
      </div>
      <div className="grid gap-2">
        <Label>Da biblioteca</Label>
        {others.map((s) => {
          const why = skillBlock(d, a, s)
          return (
            <div key={s.id} className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
              <span className="flex-1"><b className="font-semibold">{s.name}</b>{why && <span className="block text-xs text-muted-foreground">{why}</span>}</span>
              <Button size="sm" disabled={!!why?.startsWith("pede nível")} onClick={() => run((api) => api.installSkill(a.id, s.id), `${s.name} instalada.`)}>Instalar</Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Apps do bot: só os que ele recebeu; ações por classe; "sempre permitir" só na C. */
export function BotApps({ d, a }: { d: DockData; a: DockAgent }) {
  const run = useDock((s) => s.run)
  const mine = d.agentConnectors.filter((i) => i.agentId === a.id)
  const available = d.connectors.filter((c) => !mine.some((i) => i.connectorId === c.id) && c.status === "aprovado" && c.wave === 1)
  return (
    <div className="grid gap-4">
      <p className="t-desc">O bot só usa os apps que recebeu. Tudo o que toca a empresa passa pelo porteiro.</p>
      {mine.map((i) => {
        const c = d.connectors.find((x) => x.id === i.connectorId)
        if (!c) return null
        return (
          <div key={c.id} className="grid gap-2 rounded-[15px] bg-foreground/[0.05] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className="flex-1 text-sm font-semibold">{c.name}</b>
              <Tag>{c.runsAt === "pc" ? "no seu PC" : "na empresa"}</Tag>
              <button className={chip(i.readOnly)} onClick={() => run((api) => api.installConnector(a.id, c.id, !i.readOnly))}>{i.readOnly ? "Só leitura" : "Leitura e ação"}</button>
              <Button size="icon-xs" variant="ghost" aria-label="Tirar app" onClick={() => run((api) => api.uninstallConnector(a.id, c.id))}><Trash2Icon /></Button>
            </div>
            {d.actions.filter((x) => x.connectorId === c.id && x.enabled).map((x) => {
              const on = d.grants.some((g) => g.agentId === a.id && g.connectorId === c.id && g.actionKey === x.actionKey)
              return (
                <div key={x.actionKey} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{x.label}</span>
                  <ClassTag k={x.actionClass} />
                  {grantAllowed(x) && !i.readOnly && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" checked={on} onChange={() => run((api) => api.setGrant(a.id, c.id, x.actionKey, !on))} />
                      sempre permitir
                    </label>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {mine.length === 0 && <p className="t-desc">Nenhum app.</p>}
      <div className="grid gap-2">
        <Label>Adicionar</Label>
        {available.map((c) => {
          const why = connectorBlock(c, a)
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
              <span className="flex-1"><b className="font-semibold">{c.name}</b>{why && <span className="block text-xs text-muted-foreground">{why}</span>}</span>
              <Button size="sm" disabled={!!why} onClick={() => run((api) => api.installConnector(a.id, c.id, true), `${c.name} instalado em só leitura.`)}>Instalar</Button>
            </div>
          )
        })}
      </div>
      <p className="t-desc">Na classe C dá para “sempre permitir” por ação, neste bot, por 90 dias. A classe D sempre pede uma pessoa.</p>
    </div>
  )
}
