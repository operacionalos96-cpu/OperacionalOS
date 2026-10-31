"use client"

import { useState } from "react"
import { toast } from "sonner"
import { LockIcon } from "lucide-react"
import { getUser } from "@/config/team"
import type { Area, PersonRef } from "@/lib/domain/areas"
import { moneyInputValue } from "@/lib/format"
import { useAreas, useTeamSettings } from "@/lib/modules"
import { TEAM_SETTINGS_ID } from "@/lib/domain/daily"
import { useStore } from "@/lib/store"
import { useAccess } from "@/lib/use-access"
import { useAreaList, useCeoLimit, usePeople } from "@/lib/use-hzk"
import { useTeam } from "@/lib/use-team"
import { Button } from "@/components/ui/button"
import { Field, MoneyInput } from "@/components/shared/fields"
import { Input } from "@/components/ui/input"
import { PageHeader, Panel } from "@/components/shared/layout"
import { ownerLabel } from "@/components/hzk/item-bits"

/** Configurações (HZK OS): áreas com dono, apoio e aprovador, e o limite de gasto que vai para a CEO. */
export default function SettingsPage() {
  const { canAdmin } = useAccess()
  const areas = useAreaList()
  const people = usePeople()

  return (
    <div className="flex flex-col">
      <PageHeader page="/configuracoes" />
      <div className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6">
        {!canAdmin && (
          <p className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
            <LockIcon className="size-4" /> Só a gestão muda estas configurações. Você pode consultar.
          </p>
        )}
        <Panel title="Áreas da empresa" description="O dono recebe as tarefas da área e decide o que é reversível dentro dela.">
          <ul className="divide-y">
            {areas.map((a) => (
              <AreaRow key={a.id} area={a} editable={canAdmin} ownerName={ownerLabel(a, people)} />
            ))}
          </ul>
        </Panel>
        <CeoLimitPanel editable={canAdmin} />
        <DailyMeetingPanel editable={canAdmin} />
      </div>
    </div>
  )
}

const CEO_VALUE = "cargo:ceo"
const refValue = (r?: PersonRef) => (!r ? "" : "role" in r ? CEO_VALUE : r.memberId)
const refFrom = (v: string): PersonRef | undefined => (!v ? undefined : v === CEO_VALUE ? { role: "ceo" } : { memberId: v })

function AreaRow({ area, editable, ownerName }: { area: Area; editable: boolean; ownerName: string }) {
  const save = useAreas((s) => s.save)
  const team = useTeam()
  const set = (patch: Partial<Area>) => {
    save({ ...area, ...patch })
    toast.success(`${area.name} atualizada`)
  }
  const select = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
  const personOptions = (
    <>
      <option value={CEO_VALUE}>CEO (quem tiver o cargo)</option>
      {team.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </>
  )
  return (
    <li className="grid gap-3 px-4 py-4">
      <div>
        <p className="font-semibold">{area.name}</p>
        {area.description && <p className="t-desc text-sm">{area.description}</p>}
      </div>
      {editable ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Dono">
            <select className={select} value={refValue(area.owner)} onChange={(e) => set({ owner: refFrom(e.target.value) })}>
              <option value="">Sem dono</option>
              {personOptions}
            </select>
          </Field>
          <Field label="Quem aprova">
            <select className={select} value={refValue(area.approver)} onChange={(e) => set({ approver: refFrom(e.target.value) })}>
              <option value="">O próprio dono</option>
              {personOptions}
            </select>
          </Field>
          <Field label="Apoio">
            <select
              className={select}
              multiple
              value={area.supportIds ?? []}
              onChange={(e) => set({ supportIds: [...e.target.selectedOptions].map((o) => o.value) })}
              size={Math.min(3, team.length)}
            >
              {team.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Dono: <span className="font-medium text-foreground">{ownerName}</span>
          {area.supportIds?.length ? ` · apoio: ${area.supportIds.map((id) => getUser(id).name).join(", ")}` : ""}
        </p>
      )}
      {area.approvalNote && <p className="t-desc text-xs">{area.approvalNote}</p>}
    </li>
  )
}

function CeoLimitPanel({ editable }: { editable: boolean }) {
  const limit = useCeoLimit()
  const setCeoLimit = useStore((s) => s.setCeoLimit)
  const [text, setText] = useState(moneyInputValue(limit ?? undefined))
  const [cents, setCents] = useState<number | null>(limit)
  return (
    <Panel title="Limite de gasto para a CEO" description="Decisões com dinheiro acima deste valor vão para a CEO. Vazio = o valor não decide sozinho (contrato, contratação e estratégia continuam indo).">
      <div className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          {editable ? (
            <MoneyInput
              value={text}
              onChange={(t, c) => {
                setText(t)
                setCents(c)
              }}
              placeholder="sem limite"
            />
          ) : (
            <p className="text-sm">{limit == null ? "Sem limite definido" : `R$ ${moneyInputValue(limit)}`}</p>
          )}
        </div>
        {editable && (
          <Button
            onClick={() => {
              setCeoLimit(text.trim() ? cents : null)
              toast.success(text.trim() ? "Limite salvo" : "Limite removido")
            }}
          >
            Salvar limite
          </Button>
        )}
      </div>
    </Panel>
  )
}

/** Reunião diária: horário e link. O botão "Entrar na reunião" da Início usa este link (ADR 0010). */
function DailyMeetingPanel({ editable }: { editable: boolean }) {
  const current = useTeamSettings((s) => s.items.find((x) => x.id === TEAM_SETTINGS_ID))
  const save = useTeamSettings((s) => s.save)
  const [time, setTime] = useState(current?.daily?.time ?? "09:30")
  const [link, setLink] = useState(current?.daily?.link ?? "")
  function submit(e: React.FormEvent) {
    e.preventDefault()
    const url = link.trim()
    if (url && !/^https?:\/\//.test(url)) {
      toast.error("O link precisa começar com https://")
      return
    }
    save({ ...(current ?? { id: TEAM_SETTINGS_ID }), daily: { time, link: url || undefined } })
    toast.success("Reunião diária salva")
  }
  return (
    <Panel title="Reunião diária" description="Quando todos fizerem o check-in, o Pronto libera na Início; com todos prontos, o botão abre este link.">
      <form id="daily" onSubmit={submit} className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
        <Field label="Horário" htmlFor="daily-time">
          <Input id="daily-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!editable} />
        </Field>
        <Field label="Link da reunião (Meet, Zoom…)" htmlFor="daily-link">
          <Input id="daily-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" disabled={!editable} />
        </Field>
        <Button type="submit" disabled={!editable}>
          Salvar
        </Button>
      </form>
    </Panel>
  )
}
