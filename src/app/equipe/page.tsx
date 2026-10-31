"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BriefcaseIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  CrownIcon,
  GitForkIcon,
  PlusIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAccess } from "@/lib/use-access"
import { Button } from "@/components/ui/button"
import { EmptyState, PageHeader, Panel } from "@/components/shared/layout"
import { MemberCard } from "@/components/org/member-card"
import { RoleBadge } from "@/components/org/role-badge"
import { RoleDialog } from "@/components/org/role-dialog"
import { InviteMemberDialog } from "@/components/org/invite-member-dialog"
import { OrgTreeView } from "@/components/org/org-tree-view"
import { TeamOverview } from "@/components/hzk/team-overview"
import { TeamFeedPanel } from "@/components/dashboard/team-panels"
import type { OrgRole } from "@/lib/domain/org"

type TabType = "responsabilidades" | "membros" | "cargos" | "hierarquia"

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
    else if (aba === "membros" || aba === "cargos" || aba === "hierarquia") setActiveTab(aba)
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
          <Button variant="outline" size="sm" onClick={() => setCreatingRole(true)}>
            <PlusIcon className="h-4 w-4 mr-1" />
            Novo Cargo
          </Button>
          <Button size="sm" onClick={() => setInvitingMember(true)}>
            <UserPlusIcon className="h-4 w-4 mr-1" />
            Adicionar Membro
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

      <div className="mx-auto grid w-full max-w-5xl gap-6 p-4 sm:p-6">
        {/* Métricas da Organização */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UsersIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalMembers}</div>
              <div className="text-xs text-muted-foreground">Membros Ativos</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <BriefcaseIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalRoles}</div>
              <div className="text-xs text-muted-foreground">Cargos Cadastrados</div>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-2xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <CrownIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{leadershipCount}</div>
              <div className="text-xs text-muted-foreground">Liderança / Founders</div>
            </div>
          </div>
        </div>

        {/* Seletor de Abas */}
        <div className="flex flex-wrap items-center gap-1 border-b pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("responsabilidades")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "responsabilidades"
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <ClipboardListIcon className="h-3.5 w-3.5" />
            Responsabilidades
          </button>

          <button
            type="button"
            onClick={() => router.push("/agenda")}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
          >
            <CalendarDaysIcon className="h-3.5 w-3.5" />
            Agenda
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("membros")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "membros"
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <UsersIcon className="h-3.5 w-3.5" />
            Membros ({members.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("cargos")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "cargos"
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <BriefcaseIcon className="h-3.5 w-3.5" />
            Cargos & Funções ({orgRoles.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("hierarquia")}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === "hierarquia"
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <GitForkIcon className="h-3.5 w-3.5" />
            Árvore Hierárquica
          </button>
        </div>

        {/* Aba 0 (HZK OS): responsabilidades e feitos de cada pessoa */}
        {activeTab === "responsabilidades" && (
          <div className="grid gap-4">
            <TeamOverview />
            {/* Movimento da equipe (antes na Início): o que cada um fez por último. */}
            <TeamFeedPanel />
          </div>
        )}

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
