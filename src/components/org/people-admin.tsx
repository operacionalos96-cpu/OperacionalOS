"use client"

import { useState } from "react"
import { BriefcaseIcon, CrownIcon, PlusIcon, UserPlusIcon, UsersIcon } from "lucide-react"
import type { OrgRole } from "@/lib/domain/org"
import { useMemberRoles, useOrgRoles } from "@/lib/modules"
import { useStore } from "@/lib/store"
import { useAccess } from "@/lib/use-access"
import { Button } from "@/components/ui/button"
import { Segmented } from "@/components/shared/fields"
import { EmptyState, Panel, StatCard } from "@/components/shared/layout"
import { InviteMemberDialog } from "./invite-member-dialog"
import { MemberCard } from "./member-card"
import { OrgTreeView } from "./org-tree-view"
import { RoleBadge } from "./role-badge"
import { RoleDialog } from "./role-dialog"

/**
 * Pessoas (aba de Configurações): o cadastro da equipe — membros (em cartões ou na árvore
 * hierárquica) e os cargos. O dia a dia do time (quem faz o quê, a semana) fica na página Equipe.
 */
export function PeopleAdmin() {
  const { canAdmin } = useAccess()
  const members = useStore((s) => s.orgMembers)
  const orgRoles = useOrgRoles((s) => s.items)
  const memberRoles = useMemberRoles((s) => s.items)
  const [view, setView] = useState<"cartoes" | "arvore">("cartoes")
  const [creatingRole, setCreatingRole] = useState(false)
  const [roleToEdit, setRoleToEdit] = useState<OrgRole | undefined>()
  const [invitingMember, setInvitingMember] = useState(false)

  const totalMembers = members.filter((m) => m.active).length
  const totalRoles = orgRoles.filter((r) => r.active).length
  const leadershipCount = members.filter((m) => m.roleLevel === "owner" || m.roleLevel === "admin").length

  return (
    <div className="grid gap-6">
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

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="t-title">Membros</h2>
            {/* Cartões e árvore mostram as mesmas pessoas: é modo de ver, não outra seção. */}
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "cartoes", label: "Cartões" },
                { value: "arvore", label: "Árvore" },
              ]}
            />
          </div>
          {canAdmin && (
            <Button variant="brand" onClick={() => setInvitingMember(true)}>
              <UserPlusIcon /> Adicionar membro
            </Button>
          )}
        </div>
        {members.length === 0 ? (
          <EmptyState icon={UsersIcon} title="Nenhum membro carregado" description="Cadastre colaboradores para atribuir responsabilidades e projetos." className="py-16" />
        ) : view === "cartoes" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((member) => (
              <MemberCard key={member.teamId} member={member} memberRoles={memberRoles} orgRoles={orgRoles} />
            ))}
          </div>
        ) : (
          <OrgTreeView members={members} memberRoles={memberRoles} orgRoles={orgRoles} />
        )}
      </section>

      <Panel
        title="Cargos da empresa"
        aside={
          canAdmin && (
            <Button variant="outline" size="sm" onClick={() => setCreatingRole(true)}>
              <PlusIcon /> Novo cargo
            </Button>
          )
        }
      >
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
                    {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
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
      {invitingMember && <InviteMemberDialog open={invitingMember} onOpenChange={setInvitingMember} />}
    </div>
  )
}
