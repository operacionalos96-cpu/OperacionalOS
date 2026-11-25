"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/shared/layout"
import { AreaAccessPanel } from "@/components/org/area-access-panel"
import { TeamOverview } from "@/components/hzk/team-overview"
import { TeamFeedPanel } from "@/components/dashboard/team-panels"
import { TeamWeek } from "@/components/hzk/team-week"
import { SectionTabs } from "@/components/shared/fields"

type TabType = "responsabilidades" | "semana" | "acesso"

/** Abas que saíram daqui: o cadastro (membros, cargos, árvore) mora em Configurações › Pessoas; a agenda, na página Agenda. */
const MOVED: Record<string, string> = {
  agenda: "/agenda",
  membros: "/configuracoes?aba=pessoas",
  cargos: "/configuracoes?aba=pessoas",
  hierarquia: "/configuracoes?aba=pessoas",
}

/**
 * Equipe: o dia a dia do time — o que cada um tem e fez, a semana, e o nível de cada pessoa em cada área
 * (todo mundo consulta o seu; quem gere uma área concede acesso por aqui).
 */
export default function EquipePage() {
  // HZK OS: abre em Responsabilidades (o que cada um tem e o que fez), para a CEO acompanhar o time.
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>("responsabilidades")
  // Link direto para uma aba (ex.: /equipe?aba=semana); os links antigos seguem para onde a aba foi.
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba")
    if (aba && MOVED[aba]) router.replace(MOVED[aba])
    else if (aba === "semana" || aba === "acesso") setActiveTab(aba)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col">
      <PageHeader page="/equipe">
        <SectionTabs
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: "responsabilidades", label: "Responsabilidades" },
            { value: "semana", label: "Semana do time" },
            { value: "acesso", label: "Acesso por área" },
          ]}
        />
      </PageHeader>

      <div className="page-body grid gap-6">
        {/* Responsabilidades e feitos de cada pessoa + o movimento da equipe. */}
        {activeTab === "responsabilidades" && (
          <div className="grid gap-4">
            <TeamOverview />
            <TeamFeedPanel />
          </div>
        )}

        {/* Semana do time (ADR 0011): foco de segunda, retrospectiva de sexta e o que cada um fez. */}
        {activeTab === "semana" && <TeamWeek />}

        {/* Acesso por área (ADR 0020): áreas restritas, concessões e vitrine. */}
        {activeTab === "acesso" && <AreaAccessPanel />}
      </div>
    </div>
  )
}
