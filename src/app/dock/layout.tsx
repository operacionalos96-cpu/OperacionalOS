"use client"

import { useEffect } from "react"
import { ShieldCheckIcon } from "lucide-react"
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
      <PageHeader page="/dock">
        <DockNav badges={{ "/dock": pend?.approvals ?? 0, "/dock/skills": pend?.proposals ?? 0, "/dock/apps": pend?.requests ?? 0 }} />
      </PageHeader>
      {error && <p className="rounded-[15px] bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {loading && !data ? (
        <p className="t-desc">Abrindo o seu Dock…</p>
      ) : data && !data.consent ? (
        <section className="mx-auto grid max-w-xl gap-4 rounded-[20px] bg-card p-6">
          <ShieldCheckIcon className="size-8 text-highlight" />
          <h2 className="t-title text-lg">Antes de começar</h2>
          <ul className="t-desc grid list-disc gap-1.5 pl-5">
            <li>O Dock é seu: só você vê os seus bots e as suas conversas. Nem os founders leem.</li>
            <li>As chaves das IAs ficam no seu PC, no cofre do Windows. Nunca vão para o servidor.</li>
            <li>Bot novo nasce no nível 0 (só conversa). Nesta primeira leva, o máximo é o nível 1 (pastas que você liberar).</li>
            <li>Tudo o que um bot fizer na empresa passa pelo porteiro: ler segue, executar pede você, o sensível sempre pede uma pessoa.</li>
          </ul>
          <div>
            <Button variant="brand" onClick={() => run((api) => api.acceptConsent(), "Pronto. Bem-vindo ao seu Dock.")}>
              Entendi, começar
            </Button>
          </div>
        </section>
      ) : (
        data && children
      )}
    </div>
  )
}
