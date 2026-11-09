"use client"

import { useState } from "react"
import { EyeIcon, LockIcon, LockOpenIcon, ShieldIcon, XIcon } from "lucide-react"
import { useAreas } from "@/lib/modules"
import { useAreaList } from "@/lib/use-hzk"
import { useStore } from "@/lib/store"
import { useAreaAccess } from "@/lib/use-area-access"
import {
  AREA_LEVEL_LABELS,
  areaLevel,
  grantActive,
  grantableLevels,
  canGrant,
  type AreaLevel,
} from "@/lib/domain/area-access"
import type { Area } from "@/lib/domain/areas"
import type { OrgMember } from "@/lib/domain/org"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Panel } from "@/components/shared/layout"

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
const selectClass = "h-9 rounded-md border border-input bg-transparent px-2 text-sm"

/**
 * Acesso por área (ADR 0020): founders restringem áreas e concedem acesso; quem gere uma área
 * (construtor) concede até "operar". A tela só mostra o que a pessoa pode fazer; quem decide é o banco.
 */
export function AreaAccessPanel() {
  const sorted = useAreaList()
  const saveArea = useAreas((s) => s.save)
  const members = useStore((s) => s.orgMembers)
  const meId = useStore((s) => s.meId)
  const meLevel = useStore((s) => s.meRoleLevel)
  const { grants, loaded, grant, revoke } = useAreaAccess()
  const now = new Date()
  const me = { id: meId, level: meLevel }
  const isOwner = meLevel === "owner"

  return (
    <div className="grid gap-4">
      <Panel
        icon={ShieldIcon}
        title="Acesso por área"
        description="Uma área restrita só entrega os dados aos founders e a quem recebeu acesso. Os demais veem a área na vitrine: nome, dono e para que serve, sem os dados."
      >
        <p className="px-5 py-3 text-xs text-muted-foreground">
          {isOwner
            ? "Você é founder: restringe e libera áreas e concede qualquer nível."
            : "Você vê seu nível em cada área. Quem gere uma área pode chamar pessoas para ela até o nível “Operar”."}
          {!loaded && " Carregando acessos…"}
        </p>
      </Panel>

      {sorted.map((area) => (
        <AreaRow
          key={area.id}
          area={area}
          myLevel={areaLevel(me, area, grants, now)}
          isOwner={isOwner}
          meId={meId}
          members={members}
          grants={grants.filter((g) => g.areaId === area.id)}
          now={now}
          onToggleRestricted={() => saveArea({ ...area, restricted: !area.restricted })}
          onGrant={(memberId, level, expiresAt) => grant({ memberId, areaId: area.id, level, expiresAt, grantedBy: meId })}
          onRevoke={revoke}
          canManage={(level) => canGrant({ level: meLevel }, areaLevel(me, area, grants, now), level)}
          options={grantableLevels({ level: meLevel }, areaLevel(me, area, grants, now))}
        />
      ))}
    </div>
  )
}

function AreaRow({
  area,
  myLevel,
  isOwner,
  meId,
  members,
  grants,
  now,
  onToggleRestricted,
  onGrant,
  onRevoke,
  canManage,
  options,
}: {
  area: Area
  myLevel: AreaLevel
  isOwner: boolean
  meId: string
  members: OrgMember[]
  grants: ReturnType<typeof useAreaAccess>["grants"]
  now: Date
  onToggleRestricted: () => void
  onGrant: (memberId: string, level: AreaLevel, expiresAt?: string) => Promise<boolean>
  onRevoke: (id: string) => void
  canManage: (level: AreaLevel) => boolean
  options: AreaLevel[]
}) {
  const [confirming, setConfirming] = useState(false)
  const candidates = members.filter((m) => m.active && m.roleLevel !== "owner" && m.teamId !== meId)
  const [memberId, setMemberId] = useState("")
  const [level, setLevel] = useState<AreaLevel | "">("")
  const [until, setUntil] = useState("")
  const nameOf = (id: string) => members.find((m) => m.teamId === id)?.displayName ?? id

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!memberId || !level) return
    const ok = await onGrant(memberId, level, until ? new Date(`${until}T23:59:59`).toISOString() : undefined)
    if (ok) {
      setMemberId("")
      setLevel("")
      setUntil("")
    }
  }

  return (
    <Panel
      title={
        <span className="flex flex-wrap items-center gap-2">
          {area.name}
          {area.restricted ? (
            <Badge variant="secondary" className="gap-1"><LockIcon className="size-3" /> Restrita</Badge>
          ) : (
            <Badge variant="outline">Aberta</Badge>
          )}
        </span>
      }
      description={area.description}
      aside={
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {myLevel === "vitrine" && <EyeIcon className="size-3.5" />}
          Seu nível: <strong className="text-foreground">{AREA_LEVEL_LABELS[myLevel]}</strong>
        </span>
      }
    >
      <div className="grid gap-3 px-5 py-4">
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            {confirming ? (
              <>
                <span className="text-sm">
                  {area.restricted
                    ? "Liberar a área? Todos os membros voltam a ver os dados dela."
                    : "Restringir a área? Quem não tiver acesso deixa de ver os dados dela."}
                </span>
                <Button size="sm" variant={area.restricted ? "outline" : "destructive"} onClick={() => { onToggleRestricted(); setConfirming(false) }}>
                  {area.restricted ? "Liberar" : "Restringir"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
                {area.restricted ? <><LockOpenIcon /> Liberar área</> : <><LockIcon /> Restringir área</>}
              </Button>
            )}
          </div>
        )}

        {grants.length > 0 && (
          <ul className="divide-y rounded-md border">
            {grants.map((g) => {
              const active = grantActive(g, now)
              return (
                <li key={g.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{nameOf(g.memberId)}</span>
                  <Badge variant={active ? "secondary" : "outline"}>{AREA_LEVEL_LABELS[g.level]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {g.expiresAt ? (active ? `até ${fmtDate(g.expiresAt)}` : `venceu em ${fmtDate(g.expiresAt)}`) : "sem prazo"}
                  </span>
                  {canManage(g.level) && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Retirar acesso de ${nameOf(g.memberId)}`} onClick={() => onRevoke(g.id)}>
                      <XIcon />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {options.length > 0 && candidates.length > 0 && (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Pessoa
              <select id={`acesso-pessoa-${area.id}`} className={selectClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Escolha…</option>
                {candidates.map((m) => <option key={m.teamId} value={m.teamId}>{m.displayName ?? m.email}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Nível
              <select id={`acesso-nivel-${area.id}`} className={selectClass} value={level} onChange={(e) => setLevel(e.target.value as AreaLevel)}>
                <option value="">Escolha…</option>
                {options.map((l) => <option key={l} value={l}>{AREA_LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Até (opcional)
              <Input id={`acesso-ate-${area.id}`} type="date" className="h-9 w-40" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <Button type="submit" size="sm" disabled={!memberId || !level}>Conceder acesso</Button>
          </form>
        )}
      </div>
    </Panel>
  )
}
