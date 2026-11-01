"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LayoutGridIcon, NetworkIcon, PenLineIcon, UploadIcon } from "lucide-react"
import { relative } from "@/lib/format"
import { TEMPLATES } from "@/lib/mindmap-templates"
import { BOARD_TEMPLATES } from "@/lib/board-templates"
import { useStore } from "@/lib/store"
import { useMindMaps } from "@/lib/maps"
import { BOARD_MODES, boardColor, boardMode, parseBoard, statsText, type BoardMode } from "@/lib/domain/board"
import { mapProgress } from "@/lib/domain/mindmap"
import type { MindMap } from "@/lib/domain/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState, PageHeader } from "@/components/shared/layout"

type Filter = "todos" | BoardMode

export default function MapsPage() {
  const maps = useMindMaps()
  const createMap = useStore((s) => s.createMap)
  const createMapFrom = useStore((s) => s.createMapFrom)
  const router = useRouter()
  const [picking, setPicking] = useState<BoardMode | null>(null)
  const [filter, setFilter] = useState<Filter>("todos")
  const tasks = useStore((s) => s.tasks)
  const fileRef = useRef<HTMLInputElement>(null)
  const sorted = [...maps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const shown = sorted.filter((m) => filter === "todos" || boardMode(m) === filter)
  const count = (f: Filter) => (f === "todos" ? maps.length : maps.filter((m) => boardMode(m) === f).length)

  async function importFile(file: File) {
    try {
      const result = parseBoard(JSON.parse(await file.text()))
      if (!result.ok) return toast.error("Não deu para importar", { description: result.error })
      const { title, mode, nodes, edges } = result.board
      const map = createMapFrom({ title, mode, nodes, edges })
      toast.success(`“${title}” importado`, { description: result.dropped ? `${result.dropped} item(ns) inválido(s) foram ignorados.` : undefined })
      router.push(`/mapas/${map.id}`)
    } catch {
      toast.error("Não deu para importar", { description: "O arquivo não é um JSON válido." })
    }
  }

  const actions = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void importFile(f)
        }}
      />
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <UploadIcon /> Importar
      </Button>
      <Button variant="outline" onClick={() => setPicking("estruturado")}>
        <NetworkIcon /> Novo mapa estruturado
      </Button>
      <Button variant="brand" onClick={() => setPicking("lousa")}>
        <PenLineIcon /> Nova lousa
      </Button>
    </>
  )

  return (
    <div className="flex flex-col">
      <PageHeader page="/mapas" actions={actions}>
        {maps.length > 0 && (
          <div className="flex gap-2" role="tablist" aria-label="Filtrar por tipo">
            {(["todos", "lousa", "estruturado"] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cn("rounded-full border px-4 py-1.5 text-sm font-medium transition-colors", filter === f ? "border-highlight bg-highlight-soft/40 text-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
              >
                {f === "todos" ? "Todos" : f === "lousa" ? "Lousas" : "Mapas estruturados"} <span className="tabular ml-1.5 rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{count(f)}</span>
              </button>
            ))}
          </div>
        )}
      </PageHeader>
      <div className="page-body">
        {maps.length === 0 ? (
          <EmptyState
            icon={LayoutGridIcon}
            title="Nenhuma lousa ou mapa ainda"
            description="Comece por uma lousa em branco para soltar ideias, ou por um mapa estruturado com modelo pronto."
            action={<div className="flex gap-2">{actions}</div>}
            className="py-20"
          />
        ) : shown.length === 0 ? (
          <EmptyState icon={LayoutGridIcon} title="Nada deste tipo ainda" description="Troque o filtro acima ou crie um novo mapa ou lousa." action={<div className="flex gap-2">{actions}</div>} className="py-16" />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((m) => (
              <li key={m.id}>
                <Link href={`/mapas/${m.id}`} className="block overflow-hidden rounded-2xl border bg-card shadow-card transition-[border-color,translate] hover:-translate-y-px hover:border-foreground/25">
                  {/* Prévia ocupa o topo do card; nome e situação embaixo (mock). */}
                  <div className="bg-muted/25 p-4">
                    <Preview map={m} />
                  </div>
                  <div className="border-t px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <span className={cn("shrink-0 rounded-lg border px-2 py-0.5 text-xs font-semibold", boardMode(m) === "lousa" ? "text-foreground" : "border-brand/60 bg-brand-soft text-brand")}>{BOARD_MODES.find((x) => x.id === boardMode(m))!.short}</span>
                    <p className="truncate text-lg font-semibold">{m.title}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {boardMode(m) === "lousa"
                      ? statsText(m) || "vazia"
                      : (() => {
                          const p = mapProgress(m, tasks)
                          return p.total ? `${p.feito} de ${p.total} feitos` : "vazio"
                        })()}{" "}
                    · editado {relative(m.updatedAt)}
                  </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={picking !== null} onOpenChange={(o) => !o && setPicking(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{picking === "lousa" ? "Nova lousa" : "Novo mapa estruturado"}</DialogTitle>
            <DialogDescription>{BOARD_MODES.find((m) => m.id === picking)?.description ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {(picking === "lousa" ? BOARD_TEMPLATES : TEMPLATES).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  const map = createMap(t.id as never)
                  setPicking(null)
                  router.push(`/mapas/${map.id}`)
                }}
                className="rounded-lg border-2 p-3.5 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
              >
                <p className="text-[15px] font-semibold">{t.title}</p>
                <p className="text-sm text-muted-foreground">{t.description}</p>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Miniatura do mapa: elementos nas posições e tamanhos reais, com as ligações. */
function Preview({ map }: { map: MindMap }) {
  const nodes = map.nodes.filter((n) => n.type !== "drawing" || n.path?.length)
  if (nodes.length === 0) return <div className="grid h-32 place-items-center rounded-lg bg-muted/60 text-sm text-muted-foreground">vazio</div>
  const size = (n: MindMap["nodes"][number]) => ({ w: n.width ?? (n.type === "text" ? 120 : 160), h: n.height ?? (n.type === "text" ? 32 : 44) })
  const x1 = Math.min(...nodes.map((n) => n.x))
  const y1 = Math.min(...nodes.map((n) => n.y))
  const x2 = Math.max(...nodes.map((n) => n.x + size(n).w))
  const y2 = Math.max(...nodes.map((n) => n.y + size(n).h))
  const pad = Math.max(x2 - x1, y2 - y1) * 0.06
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const c = (n: MindMap["nodes"][number]) => ({ x: n.x + size(n).w / 2, y: n.y + size(n).h / 2 })
  return (
    <svg viewBox={`${x1 - pad} ${y1 - pad} ${x2 - x1 + pad * 2} ${y2 - y1 + pad * 2}`} className="h-32 w-full rounded-lg bg-muted/60" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {map.edges.map((e) => {
        const a = byId.get(e.source)
        const b = byId.get(e.target)
        if (!a || !b) return null
        return <line key={e.id} x1={c(a).x} y1={c(a).y} x2={c(b).x} y2={c(b).y} stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={Math.max(x2 - x1, y2 - y1) * 0.006} />
      })}
      {nodes.map((n) => {
        const s = size(n)
        if (n.type === "group") return <rect key={n.id} x={n.x} y={n.y} width={s.w} height={s.h} rx={s.w * 0.02} fill="none" stroke="var(--foreground)" strokeOpacity={0.4} strokeDasharray="8 6" strokeWidth={Math.max(x2 - x1, y2 - y1) * 0.004} />
        if (n.type === "drawing" && n.path) {
          const pts = n.path.reduce<string[]>((acc, v, i) => (i % 2 ? acc : [...acc, `${n.x + v},${n.y + (n.path![i + 1] ?? 0)}`]), [])
          return <polyline key={n.id} points={pts.join(" ")} fill="none" stroke={boardColor(n.hue, "ink")} strokeWidth={Math.max(x2 - x1, y2 - y1) * 0.006} />
        }
        if (n.type === "text") return <rect key={n.id} x={n.x} y={n.y + s.h * 0.4} width={s.w} height={s.h * 0.2} rx={4} fill="var(--foreground)" fillOpacity={0.5} />
        const fill = n.type === "sticky" ? boardColor(n.hue, "solid") : n.hue === undefined ? "var(--foreground)" : boardColor(n.hue, "stroke")
        return <rect key={n.id} x={n.x} y={n.y} width={s.w} height={s.h} rx={Math.min(s.w, s.h) * (n.shape === "ellipse" ? 0.5 : 0.12)} fill={fill} fillOpacity={n.type === "sticky" ? 0.95 : n.hue === undefined ? 0.35 : 0.55} stroke={n.type === "sticky" ? "none" : "var(--foreground)"} strokeOpacity={0.6} strokeWidth={Math.max(x2 - x1, y2 - y1) * 0.003} />
      })}
    </svg>
  )
}
