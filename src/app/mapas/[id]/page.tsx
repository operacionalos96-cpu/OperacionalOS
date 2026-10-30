"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, MaximizeIcon, MinimizeIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { useStore } from "@/lib/store"
import { deleteMapWithRows, migrateMap, restoreMapWithRows, useMindMap, useRowStorageReady } from "@/lib/maps"
import { isRowMap } from "@/lib/domain/map-rows"
import { kindCounts, mapProgress } from "@/lib/domain/mindmap"
import { BOARD_MODES, boardMode, statsText } from "@/lib/domain/board"
import { useUI } from "@/lib/ui-store"
import { WhiteboardEditor } from "@/components/board/whiteboard-editor"
import { BoardMenu } from "@/components/board/board-menu"
import { Button } from "@/components/ui/button"
import { InlineText } from "@/components/shared/inline-edit"
import { NotFound } from "@/components/shared/layout"
import { MindMapEditor } from "@/components/mindmap/mind-map-editor"
import { MapOutline } from "@/components/mindmap/map-outline"
import { cn } from "@/lib/utils"

export default function MapPage() {
  const { id } = useParams<{ id: string }>()
  const map = useMindMap(id)
  const rowsReady = useRowStorageReady()
  const [migrationFailed, setMigrationFailed] = useState(false)
  const [view, setView] = useState<"mapa" | "lista">("mapa")
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
  const leads = useStore((s) => s.leads)
  const router = useRouter()
  const focusMode = useUI((s) => s.focusMode)
  const toggleFocus = () => useUI.getState().set({ focusMode: !focusMode })
  const mode = map ? boardMode(map) : "estruturado"
  const modeInfo = BOARD_MODES.find((m) => m.id === mode)!

  if (!map) {
    return (
      <NotFound title="Mapa não encontrado" backHref="/mapas" backLabel="Voltar aos mapas" />
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
      <header className="flex items-center gap-2 border-b bg-background px-3 py-1.5 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm" aria-label="Voltar aos mapas">
          <Link href="/mapas">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span className={cn("shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold", mode === "lousa" ? "border-info/50 text-info" : "border-brand/50 text-brand")} title={modeInfo.description}>
          {modeInfo.short}
        </span>
        <InlineText value={map.title} required onSave={(t) => renameMap(map.id, t)} className="max-w-md text-base font-semibold" />
        {mode === "estruturado" && (
          <div className="flex shrink-0 rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Visão">
            {(["mapa", "lista"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-md px-3 py-1 font-medium capitalize transition-colors", view === v ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        {mode === "estruturado" ? (
          <>
            <KindSummary counts={kindCounts(map.nodes, (leadId) => leads.find((l) => l.id === leadId)?.stage)} />
            <MapProgress progress={mapProgress(map, tasks)} />
          </>
        ) : (
          <p className="ml-auto hidden min-w-0 truncate text-sm text-muted-foreground lg:block">{statsText(map) || "Lousa vazia"}</p>
        )}
        <span className="hidden text-xs whitespace-nowrap text-muted-foreground xl:block">Salvo automaticamente</span>
        <Button variant="ghost" size="icon-sm" onClick={toggleFocus} aria-pressed={focusMode} aria-label={focusMode ? "Sair do modo foco" : "Modo foco: esconde o menu lateral"} title={focusMode ? "Sair do modo foco" : "Modo foco: tela toda para o quadro"}>
          {focusMode ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
        <BoardMenu map={map} onDelete={remove} />
      </header>
      <div className="min-h-0 flex-1">
        {needsMigration ? (
          <p className="grid h-full place-items-center text-sm text-muted-foreground">Preparando o mapa…</p>
        ) : mode === "lousa" ? (
          <WhiteboardEditor key={`${map.id}-${map.storage ?? "legacy"}`} map={map} />
        ) : view === "lista" ? (
          <MapOutline map={map} />
        ) : (
          // Remonta ao trocar de formato (antigo → por balão).
          <MindMapEditor key={`${map.id}-${map.storage ?? "legacy"}`} map={map} />
        )}
      </div>
    </div>
  )
}

/** "4 tarefas · 2 ideias · 1 venda" (só tipos presentes). */
function KindSummary({ counts }: { counts: ReturnType<typeof kindCounts> }) {
  if (!counts.length) return null
  return (
    <p className="hidden min-w-0 truncate text-xs text-muted-foreground xl:block">
      {counts.map((c) => `${c.count} ${c.count === 1 ? c.label.toLowerCase() : c.plural}`).join(" · ")}
    </p>
  )
}

/** "3 de 7 feitos" + barra. Em andamento aparece à parte para não parecer concluído. */
function MapProgress({ progress }: { progress: ReturnType<typeof mapProgress> }) {
  if (!progress.total) return <span className="ml-auto" />
  const pct = Math.round(progress.pct * 100)
  return (
    <div className="ml-auto flex items-center gap-3" title={`${progress.feito} feitos · ${progress.andamento} em andamento · ${progress.afazer} a fazer`}>
      <div className="hidden text-right sm:block">
        <p className="tabular text-xs font-semibold whitespace-nowrap">
          {progress.feito} de {progress.total} feitos
        </p>
        {progress.andamento > 0 && <p className="text-xs text-warning">{progress.andamento} em andamento</p>}
      </div>
      <div className="flex h-2 w-28 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
        <div className="h-full bg-warning/70 transition-[width] duration-500" style={{ width: `${(progress.andamento / progress.total) * 100}%` }} />
      </div>
      <span className="tabular w-9 text-xs font-semibold text-muted-foreground">{pct}%</span>
    </div>
  )
}
