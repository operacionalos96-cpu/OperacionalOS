"use client"

import { useState } from "react"
import { toast } from "sonner"
import { LockIcon } from "lucide-react"
import { getUser } from "@/config/team"
import type { Area, PersonRef } from "@/lib/domain/areas"
import { moneyInputValue } from "@/lib/format"
import { useAreas } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAccess } from "@/lib/use-access"
import { useAreaList, useCeoLimit, usePeople } from "@/lib/use-hzk"
import { useTeam } from "@/lib/use-team"
import { Button } from "@/components/ui/button"
import { Field, MoneyInput } from "@/components/shared/fields"
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
