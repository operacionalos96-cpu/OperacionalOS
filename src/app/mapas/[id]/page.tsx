"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, SearchXIcon, Trash2Icon } from "lucide-react"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { InlineText } from "@/components/shared/inline-edit"
import { EmptyState } from "@/components/shared/layout"
import { MindMapEditor } from "@/components/mindmap/mind-map-editor"

export default function MapPage() {
  const { id } = useParams<{ id: string }>()
  const map = useStore((s) => s.mindMaps.find((m) => m.id === id))
  const renameMap = useStore((s) => s.renameMap)
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
        <span className="ml-auto hidden text-xs text-muted-foreground sm:block">Salvo automaticamente</span>
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
