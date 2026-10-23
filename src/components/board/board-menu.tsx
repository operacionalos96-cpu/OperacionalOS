"use client"

import { CopyIcon, DownloadIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { boardMode, exportBoard } from "@/lib/domain/board"
import type { MindMap } from "@/lib/domain/types"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** Baixa o mapa/lousa como arquivo .json (cópia de segurança; pode ser importado na tela Mapas). */
export function downloadBoard(map: MindMap) {
  const file = exportBoard(map)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${map.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "mapa"}.mapa.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function BoardMenu({ map, onDelete }: { map: MindMap; onDelete: () => void }) {
  const createMapFrom = useStore((s) => s.createMapFrom)
  function duplicate() {
    const copy = createMapFrom({ title: `${map.title} (cópia)`, mode: boardMode(map), nodes: map.nodes, edges: map.edges })
    toast.success("Cópia criada", { action: { label: "Abrir", onClick: () => (window.location.href = `/mapas/${copy.id}`) } })
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Mais ações">
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => downloadBoard(map)}>
          <DownloadIcon /> Exportar arquivo (.json)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={duplicate}>
          <CopyIcon /> Duplicar
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon /> Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
