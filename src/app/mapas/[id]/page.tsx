"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, SearchXIcon, Trash2Icon } from "lucide-react"
import { useStore } from "@/lib/store"
import { mapProgress } from "@/lib/domain/mindmap"
import { Button } from "@/components/ui/button"
import { InlineText } from "@/components/shared/inline-edit"
import { EmptyState } from "@/components/shared/layout"
import { MindMapEditor } from "@/components/mindmap/mind-map-editor"

export default function MapPage() {
  const { id } = useParams<{ id: string }>()
  const map = useStore((s) => s.mindMaps.find((m) => m.id === id))
  const renameMap = useStore((s) => s.renameMap)
  const tasks = useStore((s) => s.tasks)
  const router = useRouter()

  if (!map) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Mapa não encontrado"
        action={
          <Button asChild variant="outline">
            <Link href="/mapas">Voltar aos mapas</Link>
          </Button>
        }
        className="py-24"
      />
    )
  }

  function remove() {
    const snapshot = map!
    router.push("/mapas")
    useStore.getState().deleteMap(snapshot.id)
    toast(`Mapa "${snapshot.title}" excluído`, {
      action: {
        label: "Desfazer",
        onClick: () => useStore.getState().restoreMap(snapshot),
      },
    })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b bg-background px-4 py-2 sm:px-6">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar aos mapas">
          <Link href="/mapas">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <InlineText value={map.title} required onSave={(t) => renameMap(map.id, t)} className="max-w-md text-base font-semibold" />
        <MapProgress progress={mapProgress(map, tasks)} />
        <span className="hidden text-xs text-muted-foreground lg:block">Salvo automaticamente</span>
        <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Excluir mapa">
          <Trash2Icon />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <MindMapEditor key={map.id} map={map} />
      </div>
    </div>
  )
}

/** "3 de 7 feitos" + barra. Em andamento aparece à parte para não parecer concluído. */
function MapProgress({ progress }: { progress: ReturnType<typeof mapProgress> }) {
  if (!progress.total) return <span className="ml-auto" />
  const pct = Math.round(progress.pct * 100)
  return (
    <div className="ml-auto flex items-center gap-3" title={`${progress.feito} feitos · ${progress.andamento} em andamento · ${progress.afazer} a fazer`}>
      <div className="hidden text-right sm:block">
        <p className="tabular text-xs font-semibold">
          {progress.feito} de {progress.total} feitos
        </p>
        {progress.andamento > 0 && <p className="text-[11px] text-warning">{progress.andamento} em andamento</p>}
      </div>
      <div className="flex h-2 w-28 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
        <div className="h-full bg-warning/70 transition-[width] duration-500" style={{ width: `${(progress.andamento / progress.total) * 100}%` }} />
      </div>
      <span className="tabular w-9 text-xs font-semibold text-muted-foreground">{pct}%</span>
    </div>
  )
}
