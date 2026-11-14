"use client"

import { useEffect } from "react"
import { EyeOffIcon, KeyRoundIcon, MessageCircleIcon, ShieldCheckIcon } from "lucide-react"
import { PageHeader } from "@/components/shared/layout"
import { Button } from "@/components/ui/button"
import { DockNav } from "@/components/dock/ui"
import { pendingCount } from "@/lib/domain/dock"
import { useDock } from "@/lib/dock/store"
import { useAccess } from "@/lib/use-access"

/** Casca do HZK Dock: cabeçalho, navegação interna e o termo de uso na primeira vez. */
export default function DockLayout({ children }: { children: React.ReactNode }) {
  const start = useDock((s) => s.start)
  const data = useDock((s) => s.data)
  const loading = useDock((s) => s.loading)
  const error = useDock((s) => s.error)
  const run = useDock((s) => s.run)
  const { hasMinimum } = useAccess()
  useEffect(() => start(), [start])

  const founder = hasMinimum("owner")
  const pend = data ? pendingCount(data, { lead: founder, founder }) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 md:px-8">
      <PageHeader page="/dock" description="">
        <DockNav badges={{ "/dock": pend?.approvals ?? 0, "/dock/skills": pend?.proposals ?? 0, "/dock/apps": pend?.requests ?? 0 }} />
      </PageHeader>
      {error && <p className="rounded-[15px] bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {loading && !data ? (
        <div aria-busy className="h-40 animate-pulse rounded-[20px] bg-card/60" />
      ) : data && !data.consent ? (
        <section className="mx-auto grid w-full max-w-md gap-5 rounded-[20px] bg-card p-6">
          <h2 className="t-title text-lg">Seu Dock</h2>
          <ul className="grid gap-3 text-sm">
            {[
              [EyeOffIcon, "Só você vê seus bots e conversas"],
              [KeyRoundIcon, "As chaves das IAs ficam no seu PC"],
              [MessageCircleIcon, "Bot novo só conversa, até você liberar mais"],
              [ShieldCheckIcon, "Ações na empresa pedem a sua aprovação"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof EyeOffIcon
              return (
                <li key={text as string} className="flex items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-foreground/[0.06]"><I className="size-4" /></span>
                  {text as string}
                </li>
              )
            })}
          </ul>
          <Button variant="brand" onClick={() => run((api) => api.acceptConsent())}>Começar</Button>
        </section>
      ) : (
        data && children
      )}
    </div>
  )
}
