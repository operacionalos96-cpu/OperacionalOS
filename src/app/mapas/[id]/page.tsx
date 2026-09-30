"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, SearchXIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useStore } from "@/lib/store"
import { deleteMapWithRows, migrateMap, restoreMapWithRows, useMindMap, useRowStorageReady } from "@/lib/maps"
import { isRowMap } from "@/lib/domain/map-rows"
import { mapProgress } from "@/lib/domain/mindmap"
import { Button } from "@/components/ui/button"
import { InlineText } from "@/components/shared/inline-edit"
import { EmptyState } from "@/components/shared/layout"
import { MindMapEditor } from "@/components/mindmap/mind-map-editor"

export default function MapPage() {
  const { id } = useParams<{ id: string }>()
  const map = useMindMap(id)
  const rowsReady = useRowStorageReady()
  const [migrationFailed, setMigrationFailed] = useState(false)
  const needsMigration = !!map && rowsReady && !isRowMap(map) && !migrationFailed

  // Mapa antigo: passa para 1 registro por balão ao abrir (o formato antigo fica de backup).
  useEffect(() => {
    if (!needsMigration || !map) return
    migrateMap(map).catch(() => {
      setMigrationFailed(true)
      toast.error("Não deu para atualizar o formato do mapa", { description: "Ele continua funcionando no formato antigo." })
    })
  }, [needsMigration]) // eslint-disable-line react-hooks/exhaustive-deps
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
    const title = map!.title
    router.push("/mapas")
    const deleted = deleteMapWithRows(map!.id)
    if (!deleted) return
    toast(`Mapa "${title}" excluído`, {
      action: { label: "Desfazer", onClick: () => restoreMapWithRows(deleted) },
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
        {needsMigration ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">Preparando o mapa…</p>
        ) : (
          // Remonta ao trocar de formato (antigo → por balão).
          <MindMapEditor key={`${map.id}-${map.storage ?? "legacy"}`} map={map} />
        )}
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
