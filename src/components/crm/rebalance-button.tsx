"use client"

import { useMemo } from "react"
import { toast } from "sonner"
import { ScaleIcon } from "lucide-react"
import { getUser } from "@/config/team"
import { useTeam } from "@/lib/use-team"
import { openCounts, rebalance } from "@/lib/domain/distribution"
import { useStore } from "@/lib/store"
import { Button } from "@/components/ui/button"

/**
 * Aparece só quando a divisão está desigual. Move leads ainda em "Novo" de quem
 * tem mais para quem tem menos, até ficar meio a meio. Tem desfazer.
 */
export function RebalanceButton({ productId }: { productId?: string }) {
  const leads = useStore((s) => s.leads)
  const updateLead = useStore((s) => s.updateLead)
  // Lista viva: quem entrou depois também recebe leads (antes ficava congelada na abertura do app).
  const TEAM = useTeam()
  const ids = useMemo(() => TEAM.map((u) => u.id), [TEAM])
  const moves = useMemo(() => rebalance(leads, ids, productId), [leads, ids, productId])
  if (!moves.length) return null

  function run() {
    const before = moves.map((m) => ({ id: m.leadId, ownerId: leads.find((l) => l.id === m.leadId)!.ownerId }))
    for (const m of moves) updateLead(m.leadId, { ownerId: m.ownerId })
    const after = openCounts(useStore.getState().leads, ids, productId)
    toast.success(`${moves.length} leads redistribuídos`, {
      description: TEAM.map((u) => `${u.name}: ${after.get(u.id)}`).join(" · "),
      action: { label: "Desfazer", onClick: () => before.forEach((b) => useStore.getState().updateLead(b.id, { ownerId: b.ownerId })) },
    })
  }

  const target = getUser(moves[0].ownerId).name
  return (
    <Button variant="outline" size={productId ? "sm" : "default"} onClick={run} title={`Passa ${moves.length} leads ainda em “Novo” para ${target}, deixando meio a meio`}>
      <ScaleIcon /> Dividir igualmente
    </Button>
  )
}
