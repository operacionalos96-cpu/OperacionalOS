"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { NetworkIcon, PlusIcon } from "lucide-react"
import { mapProgress } from "@/lib/domain/mindmap"
import type { Product } from "@/lib/domain/products"
import { useMindMaps } from "@/lib/maps"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/shared/layout"

/**
 * Mapas que falam deste produto (algum balão ligado a ele). "Criar mapa do produto"
 * usa o modelo Produto com o balão central já ligado — e o produto passa a aparecer
 * nas Conexões do mapa e vice-versa.
 */
export function ProductMapPanel({ product, className }: { product: Product; className?: string }) {
  const maps = useMindMaps().filter((m) => m.nodes.some((n) => n.ref?.type === "product" && n.ref.id === product.id))
  const tasks = useStore((s) => s.tasks)
  const router = useRouter()

  function create() {
    const s = useStore.getState()
    const map = s.createMap("produto")
    const [root, ...rest] = map.nodes
    s.saveMap({ ...map, title: `Produto: ${product.name}`, nodes: [{ ...root, label: product.name, ref: { type: "product", id: product.id } }, ...rest] })
    router.push(`/mapas/${map.id}`)
  }

  return (
    <Panel
      className={className}
      title={
        <span className="flex items-center gap-2">
          <NetworkIcon className="size-4 text-muted-foreground" /> Mapa do produto
        </span>
      }
      aside={
        <Button size="sm" variant="outline" onClick={create}>
          <PlusIcon /> {maps.length ? "Novo" : "Criar mapa"}
        </Button>
      }
    >
      <div className="grid gap-1 p-2">
        {maps.length === 0 ? (
          <p className="t-desc p-2 text-sm">Planeje o produto no visual: público, promessa, entrega, preço e divulgação — já ligado a este produto.</p>
        ) : (
          maps.map((m) => {
            const p = mapProgress(m, tasks)
            return (
              <Link key={m.id} href={`/mapas/${m.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/50">
                <span className="truncate font-medium">{m.title}</span>
                <span className="tabular shrink-0 text-xs text-muted-foreground">{p.total ? `${p.feito} de ${p.total} feitos` : "vazio"}</span>
              </Link>
            )
          })
        )}
      </div>
    </Panel>
  )
}
