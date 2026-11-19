"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
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
  const path = usePathname()
  useEffect(() => start(), [start])

  const founder = hasMinimum("owner")
  const pend = data ? pendingCount(data, { lead: founder, founder }) : null

  return (
    // Margem do Dock = a margem lateral (16 px no celular, 32 no PC), também embaixo: os painéis vão até perto
    // do fim da janela. O --gutter local alinha o cabeçalho e os painéis na mesma borda.
    <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4 [--gutter:16px] md:pb-8 md:[--gutter:32px]">
      <PageHeader page="/dock" description="">
        <DockNav badges={{ "/dock": pend?.approvals ?? 0, "/dock/skills": pend?.proposals ?? 0, "/dock/apps": pend?.requests ?? 0 }} />
      </PageHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-(--gutter)">
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
        data && (
          // a chave troca a cada tela: o conteúdo novo entra suave em vez de aparecer seco
          <div key={path} className="animate-enter flex min-h-0 flex-1 flex-col">{children}</div>
        )
      )}
      </div>
    </div>
  )
}
