"use client"

import { useEffect, useState } from "react"
import { ArrowUpCircleIcon, InfinityIcon, LockIcon, PauseIcon, PencilLineIcon, PlayIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AVATAR_COLORS,
  AVATAR_EYES,
  AVATAR_STYLES,
  LEVELS,
  LOCKED_LEVEL_REASON,
  avatarEyes,
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
import { ClassTag, Hint, Label, Tag, pick } from "./ui"

const chip = pick

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
              {s.label}
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
          {AVATAR_EYES.map((e) => (
            <Hint key={e.id} text={`Olhos: ${e.label.toLowerCase()}`}>
              <button aria-label={`Olhos: ${e.label}`} aria-pressed={avatarEyes(a.avatarGlyph) === e.id} onClick={() => run((api) => api.setAvatar(a.id, null, null, e.id))}
                className={cn("rounded-[11px] p-0.5", avatarEyes(a.avatarGlyph) === e.id ? "ring-[1.5px] ring-foreground" : "opacity-70 hover:opacity-100")}>
                <DockAvatar name="" style={a.avatarStyle} color={a.avatarColor} glyph={e.id} level={0} size={30} />
              </button>
            </Hint>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Acesso ao PC</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {LEVELS.map((l) => {
            const locked = !levelReleased(l.n)
            return (
              <Hint key={l.n} text={locked ? LOCKED_LEVEL_REASON : l.text}>
                <button aria-disabled={locked} aria-pressed={a.accessLevel === l.n} onClick={() => !locked && setLevel(l.n)}
                  className={cn("relative grid justify-items-center gap-1 rounded-[11px] px-1 py-2.5 text-center text-xs transition-colors",
                    locked ? "cursor-not-allowed opacity-40" : a.accessLevel === l.n ? "bg-card font-semibold ring-[1.5px] ring-foreground" : "bg-foreground/[0.05] hover:bg-foreground/[0.08]")}>
                  <DockAvatar name="" style={a.avatarStyle} color={a.avatarColor} glyph={a.avatarGlyph} level={l.n} size={34} />
                  {l.title}
                  {locked && <LockIcon className="absolute top-1.5 right-1.5 size-3 text-muted-foreground" />}
                </button>
              </Hint>
            )
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Instruções</Label>
        <Textarea rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="O que faz, como fala, o que nunca faz" />
      </div>

      <div className="grid gap-2">
        <Label>IA</Label>
        <div className="flex flex-wrap gap-2">
          <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value, model: d.connections.find((c) => c.id === e.target.value)?.models[0] ?? "" })}>
            <option value="">Sem IA</option>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.label}{c.status === "sem_cota" ? " · sem cota" : ""}</option>)}
          </select>
          {conn && conn.models.length > 0 && (
            <select className="h-8 rounded-[5px] border border-input bg-card px-2 text-sm" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}>
              {form.model && !conn.models.includes(form.model) && <option>{form.model}</option>}
              {conn.models.map((m) => <option key={m}>{m}</option>)}
            </select>
          )}
          {/* sem a lista de modelos (ainda não chegou do PC ou da nuvem): dá para escrever o nome */}
          {conn && conn.models.length === 0 && (
            <Input aria-label="Modelo" className="h-8 w-64" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value.trim() })} placeholder={conn.provider === "openrouter" ? "Ex.: meta-llama/llama-3.3-70b-instruct:free" : "Nome do modelo"} />
          )}
        </div>
        <Label>Reservas</Label>
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
        <Button variant="brand" onClick={() => run((api) => api.updateAgent(a.id, patch()), "Salvo.")}>Salvar</Button>
        <Button variant="outline" onClick={() => run((api) => api.setPaused(a.id, !a.paused), a.paused ? "Retomado." : "Pausado.")}>
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
      <div className="grid gap-2">
        <Label>Instaladas</Label>
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
                <div className="flex flex-wrap items-center gap-2">
                  <Tag className="bg-warning-soft text-foreground" title={`Pede mais (${cur.minLevel > a.accessLevel ? `nível ${cur.minLevel}` : "outro app"}): ${cur.whatChanged}`}><ArrowUpCircleIcon />v{cur.label}</Tag>
                  <Button size="xs" onClick={() => run((api) => api.ackSkillUpdate(a.id, s.id, "atualizar"))}>Atualizar</Button>
                  <Button size="xs" variant="ghost" onClick={() => run((api) => api.ackSkillUpdate(a.id, s.id, "fixar"))}>Manter</Button>
                </div>
              )}
            </div>
          )
        })}
        {mine.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma</p>}
      </div>
      <div className="grid gap-2">
        <Label>Biblioteca</Label>
        {others.map((s) => {
          const why = skillBlock(d, a, s)
          return (
            <div key={s.id} className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
              <b className="flex-1 font-semibold">{s.name}</b>
              {why && <Tag title={why}><LockIcon /></Tag>}
              <Button size="sm" variant="outline" aria-label={`Instalar ${s.name}`} disabled={!!why?.startsWith("pede nível")} onClick={() => run((api) => api.installSkill(a.id, s.id))}><PlusIcon /></Button>
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
      {mine.map((i) => {
        const c = d.connectors.find((x) => x.id === i.connectorId)
        if (!c) return null
        return (
          <div key={c.id} className="grid gap-2 rounded-[15px] bg-foreground/[0.05] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b className="flex-1 text-sm font-semibold">{c.name}</b>
              <Tag>{c.runsAt === "pc" ? "PC" : "empresa"}</Tag>
              <Hint text={i.readOnly ? "Só leitura. Toque para deixar agir." : "Lê e age. Toque para voltar a só leitura."}><button aria-pressed={!i.readOnly} className={chip(!i.readOnly)} onClick={() => run((api) => api.installConnector(a.id, c.id, !i.readOnly))}><PencilLineIcon className="size-3.5" /></button></Hint>
              <Button size="icon-xs" variant="ghost" aria-label="Tirar app" onClick={() => run((api) => api.uninstallConnector(a.id, c.id))}><Trash2Icon /></Button>
            </div>
            {d.actions.filter((x) => x.connectorId === c.id && x.enabled).map((x) => {
              const on = d.grants.some((g) => g.agentId === a.id && g.connectorId === c.id && g.actionKey === x.actionKey)
              return (
                <div key={x.actionKey} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{x.label}</span>
                  <ClassTag k={x.actionClass} />
                  {grantAllowed(x) && !i.readOnly && (
                    <Hint text={on ? "Sempre permitido (90 dias). Toque para voltar a pedir." : "Sempre permitir esta ação (90 dias)"}>
                      <button aria-pressed={on} aria-label="Sempre permitir" onClick={() => run((api) => api.setGrant(a.id, c.id, x.actionKey, !on))}
                        className={cn("grid size-6 place-items-center rounded-[5px]", on ? "bg-highlight text-white" : "text-muted-foreground hover:bg-foreground/[0.08]")}><InfinityIcon className="size-3.5" /></button>
                    </Hint>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {mine.length === 0 && <p className="text-sm text-muted-foreground">Nenhum</p>}
      <div className="grid gap-2">
        <Label>Adicionar</Label>
        {available.map((c) => {
          const why = connectorBlock(c, a)
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-[11px] bg-foreground/[0.05] px-3 py-2 text-sm">
              <b className="flex-1 font-semibold">{c.name}</b>
              {why && <Tag title={why}><LockIcon /></Tag>}
              <Button size="sm" variant="outline" aria-label={`Instalar ${c.name}`} disabled={!!why} onClick={() => run((api) => api.installConnector(a.id, c.id, true))}><PlusIcon /></Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
