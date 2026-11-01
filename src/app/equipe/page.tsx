"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BriefcaseIcon,
  CrownIcon,
  PlusIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAccess } from "@/lib/use-access"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/shared/layout"
import { MemberCard } from "@/components/org/member-card"
import { RoleBadge } from "@/components/org/role-badge"
import { RoleDialog } from "@/components/org/role-dialog"
import { InviteMemberDialog } from "@/components/org/invite-member-dialog"
import { OrgTreeView } from "@/components/org/org-tree-view"
import { TeamOverview } from "@/components/hzk/team-overview"
import { TeamFeedPanel } from "@/components/dashboard/team-panels"
import { TeamWeek } from "@/components/hzk/team-week"
import { SectionTabs } from "@/components/shared/fields"
import type { OrgRole } from "@/lib/domain/org"

type TabType = "responsabilidades" | "semana" | "agenda" | "membros" | "cargos" | "hierarquia"

export default function EquipePage() {
  const { canAdmin } = useAccess()
  const members = useStore((s) => s.orgMembers)
  const orgRoles = useOrgRoles((s) => s.items)
  const memberRoles = useMemberRoles((s) => s.items)

  // HZK OS: abre em Responsabilidades (o que cada um tem e o que fez), para a CEO acompanhar o time.
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>("responsabilidades")
  // Link direto para uma aba (ex.: o guia do dia abre /equipe?aba=agenda).
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba")
    // A agenda agora é a página Agenda (calendário do time).
    if (aba === "agenda") router.replace("/agenda")
    else if (aba === "semana" || aba === "membros" || aba === "cargos" || aba === "hierarquia") setActiveTab(aba)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [creatingRole, setCreatingRole] = useState(false)
  const [roleToEdit, setRoleToEdit] = useState<OrgRole | undefined>()
  const [invitingMember, setInvitingMember] = useState(false)

  // Estatísticas rápidas
  const totalMembers = members.filter((m) => m.active).length
  const totalRoles = orgRoles.filter((r) => r.active).length
  const leadershipCount = members.filter((m) => m.roleLevel === "owner" || m.roleLevel === "admin").length

  const headerActions = (
    <div className="flex items-center gap-2">
      {canAdmin && (
        <>
          <Button variant="outline" onClick={() => setCreatingRole(true)}>
            <PlusIcon /> Novo cargo
          </Button>
          <Button variant="brand" onClick={() => setInvitingMember(true)}>
            <UserPlusIcon /> Adicionar membro
          </Button>
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col">
      <PageHeader page="/equipe"
        actions={headerActions}
      />

      <div className="page-body grid gap-6">
        {/* Métricas da Organização */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Membros ativos" icon={UsersIcon} style={{ "--i": 0 } as React.CSSProperties}>
            <p className="t-value mt-1">{totalMembers}</p>
          </StatCard>
          <StatCard label="Cargos cadastrados" icon={BriefcaseIcon} style={{ "--i": 1 } as React.CSSProperties}>
            <p className="t-value mt-1">{totalRoles}</p>
          </StatCard>
          <StatCard label="Liderança / founders" icon={CrownIcon} style={{ "--i": 2 } as React.CSSProperties}>
            <p className="t-value mt-1">{leadershipCount}</p>
          </StatCard>
        </div>

        {/* Seções da página (abas em cápsula); Agenda leva para a página Agenda. */}
        <SectionTabs
          value={activeTab}
          onChange={(v) => (v === "agenda" ? router.push("/agenda") : setActiveTab(v))}
          options={[
            { value: "responsabilidades", label: "Responsabilidades" },
            { value: "semana", label: "Semana do time" },
            { value: "agenda" as TabType, label: "Agenda" },
            { value: "membros", label: `Membros (${members.length})` },
            { value: "cargos", label: `Cargos e funções (${orgRoles.length})` },
            { value: "hierarquia", label: "Árvore hierárquica" },
          ]}
        />

        {/* Aba 0 (HZK OS): responsabilidades e feitos de cada pessoa */}
        {activeTab === "responsabilidades" && (
          <div className="grid gap-4">
            <TeamOverview />
            {/* Movimento da equipe (antes na Início): o que cada um fez por último. */}
            <TeamFeedPanel />
          </div>
        )}

        {/* Semana do time (ADR 0011): foco de segunda, retrospectiva de sexta e o que cada um fez. */}
        {activeTab === "semana" && <TeamWeek />}

        {/* Aba 1: Membros */}
        {activeTab === "membros" && (
          <div>
            {members.length === 0 ? (
              <EmptyState
                icon={UsersIcon}
                title="Nenhum membro carregado"
                description="Cadastre colaboradores para atribuir responsabilidades e projetos."
                className="py-16"
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {members.map((member) => (
                  <MemberCard
                    key={member.teamId}
                    member={member}
                    memberRoles={memberRoles}
                    orgRoles={orgRoles}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Aba 2: Cargos */}
        {activeTab === "cargos" && (
          <Panel title="Cargos da Empresa">
            <div className="divide-y divide-border">
              {orgRoles.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">Nenhum cargo cadastrado.</p>
              ) : (
                orgRoles.map((role) => {
                  const assignedCount = memberRoles.filter((mr) => mr.roleId === role.id).length
                  return (
                    <div key={role.id} className="flex items-center justify-between p-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <RoleBadge role={role} />
                          <span className="text-xs text-muted-foreground">
                            • {assignedCount} {assignedCount === 1 ? "colaborador" : "colaboradores"}
                          </span>
                        </div>
                        {role.description && (
                          <p className="text-xs text-muted-foreground">{role.description}</p>
                        )}
                      </div>

                      {canAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setRoleToEdit(role)
                            setCreatingRole(true)
                          }}
                        >
                          Editar
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </Panel>
        )}

        {/* Aba 3: Hierarquia */}
        {activeTab === "hierarquia" && (
          <OrgTreeView
            members={members}
            memberRoles={memberRoles}
            orgRoles={orgRoles}
          />
        )}
      </div>

      {creatingRole && (
        <RoleDialog
          open={creatingRole}
          onOpenChange={(open) => {
            setCreatingRole(open)
            if (!open) setRoleToEdit(undefined)
          }}
          roleToEdit={roleToEdit}
        />
      )}

      {invitingMember && (
        <InviteMemberDialog
          open={invitingMember}
          onOpenChange={setInvitingMember}
        />
      )}
    </div>
  )
}
