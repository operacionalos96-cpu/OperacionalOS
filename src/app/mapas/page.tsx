"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { NetworkIcon, PlusIcon } from "lucide-react"
import { relative } from "@/lib/format"
import { TEMPLATES } from "@/lib/mindmap-templates"
import { useStore } from "@/lib/store"
import { useMindMaps } from "@/lib/maps"
import { ideaNodes, mapProgress } from "@/lib/domain/mindmap"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState, PageHeader } from "@/components/shared/layout"

export default function MapsPage() {
  const maps = useMindMaps()
  const createMap = useStore((s) => s.createMap)
  const router = useRouter()
  const [picking, setPicking] = useState(false)
  const tasks = useStore((s) => s.tasks)
  const sorted = [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const newButton = (
    <Button onClick={() => setPicking(true)}>
      <PlusIcon /> Novo mapa
    </Button>
  )

  return (
    <div className="flex flex-col">
      <PageHeader title="Mapas" description="Pense no visual. Transforme ideias em tarefas ou leads com um clique." actions={newButton} />
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        {sorted.length === 0 ? (
          <EmptyState
            icon={NetworkIcon}
            title="Nenhum mapa ainda"
            description="Comece por um modelo — por exemplo, a estratégia da operação — e ajuste ao seu jeito."
            action={newButton}
            className="py-20"
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((m) => (
              <li key={m.id}>
                <Link href={`/mapas/${m.id}`} className="block rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20">
                  <MiniPreview nodes={ideaNodes(m.nodes)} />
                  <p className="mt-3 truncate text-sm font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {(() => {
                      const p = mapProgress(m, tasks)
                      return p.total ? `${p.feito} de ${p.total} feitos · ` : ""
                    })()}
                    editado {relative(m.updatedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo mapa</DialogTitle>
            <DialogDescription>Escolha um ponto de partida.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  const map = createMap(t.id)
                  setPicking(false)
                  router.push(`/mapas/${map.id}`)
                }}
                className="rounded-lg border p-3 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
              >
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Silhueta do mapa: pontos nas posições reais dos nós. */
function MiniPreview({ nodes }: { nodes: { x: number; y: number }[] }) {
  if (nodes.length === 0) return <div className="h-24 rounded-lg bg-muted" />
  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const w = Math.max(maxX - minX, 1)
  const h = Math.max(maxY - minY, 1)
  return (
    <div className="relative h-24 rounded-lg bg-muted/60">
      {nodes.map((n, i) => (
        <span
          key={i}
          className="absolute h-1.5 w-4 rounded-full bg-foreground/40"
          style={{ left: `${8 + ((n.x - minX) / w) * 80}%`, top: `${12 + ((n.y - minY) / h) * 70}%` }}
        />
      ))}
    </div>
  )
}
