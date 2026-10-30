"use client"

import { useState } from "react"
import { ShieldIcon, UserCheckIcon, ArrowUpRightIcon } from "lucide-react"
import { getUser } from "@/config/team"
import {
  ROLE_LEVELS,
  leaderOfMember,
  rolesOfMember,
  type MemberRole,
  type OrgMember,
  type OrgRole,
} from "@/lib/domain/org"
import { useAccess } from "@/lib/use-access"
import { Button } from "@/components/ui/button"
import { AssignRoleDialog } from "./assign-role-dialog"
import { RoleBadge } from "./role-badge"

export function MemberCard({
  member,
  memberRoles,
  orgRoles,
}: {
  member: OrgMember
  memberRoles: MemberRole[]
  orgRoles: OrgRole[]
}) {
  const { canAdmin } = useAccess()
  const [editingRoles, setEditingRoles] = useState(false)

  const userMeta = getUser(member.teamId)
  const assignedRoles = rolesOfMember(member.teamId, memberRoles, orgRoles)
  const primaryAssignment = memberRoles.find((mr) => mr.memberId === member.teamId && mr.isPrimary)
  const leaderId = leaderOfMember(member.teamId, memberRoles)
  const leaderMeta = leaderId ? getUser(leaderId) : null
  const levelMeta = ROLE_LEVELS.find((rl) => rl.id === member.roleLevel) ?? ROLE_LEVELS[2]

  return (
    <div className="flex flex-col justify-between rounded-xl border bg-card p-4 shadow-2xs transition-shadow hover:shadow-xs">
      <div className="space-y-3">
        {/* Topo: Avatar, Nome, E-mail e Nível de Acesso */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-xs"
              style={{ backgroundColor: userMeta.color }}
            >
              {userMeta.initials}
            </div>
            <div>
              <h3 className="font-semibold text-foreground leading-tight">
                {member.displayName || userMeta.name}
              </h3>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>
          </div>

          <div
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border"
            title={levelMeta.description}
          >
            <ShieldIcon className="h-3 w-3 text-muted-foreground" />
            <span>{levelMeta.label}</span>
          </div>
        </div>

        {/* Cargos atribuídos */}
        <div className="space-y-1.5 pt-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Cargos & Funções
          </div>
          <div className="flex flex-wrap gap-1.5">
            {assignedRoles.length === 0 ? (
              <span className="text-xs italic text-muted-foreground">Sem cargos atribuídos</span>
            ) : (
              assignedRoles.map((role) => (
                <RoleBadge
                  key={role.id}
                  role={role}
                  isPrimary={primaryAssignment?.roleId === role.id}
                />
              ))
            )}
          </div>
        </div>

        {/* Hierarquia: Superior imediato */}
        {leaderMeta && (
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <ArrowUpRightIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Responde a:</span>
            <span className="font-medium text-foreground">{leaderMeta.name}</span>
          </div>
        )}
      </div>

      {/* Ação: Gerenciar Cargos */}
      {canAdmin && (
        <div className="mt-4 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setEditingRoles(true)}
          >
            <UserCheckIcon className="h-3.5 w-3.5 mr-1" />
            Gerenciar Cargos & Hierarquia
          </Button>
        </div>
      )}

      {editingRoles && (
        <AssignRoleDialog
          open={editingRoles}
          onOpenChange={setEditingRoles}
          targetMember={member}
        />
      )}
    </div>
  )
}
