"use client"

import { getUser } from "@/config/team"
import {
  buildHierarchyTree,
  rolesOfMember,
  type MemberRole,
  type OrgMember,
  type OrgRole,
  type OrgTreeNode,
} from "@/lib/domain/org"
import { RoleBadge } from "./role-badge"

function TreeNodeItem({
  node,
  allMembers,
  memberRoles,
  orgRoles,
  depth = 0,
}: {
  node: OrgTreeNode
  allMembers: OrgMember[]
  memberRoles: MemberRole[]
  orgRoles: OrgRole[]
  depth?: number
}) {
  const member = allMembers.find((m) => m.teamId === node.memberId)
  const userMeta = getUser(node.memberId)
  const assignedRoles = rolesOfMember(node.memberId, memberRoles, orgRoles)
  const primaryAssignment = memberRoles.find((mr) => mr.memberId === node.memberId && mr.isPrimary)

  return (
    <div className="relative pl-6">
      {/* Linhas de conexão hierárquica */}
      {depth > 0 && (
        <div className="absolute -left-0.5 top-6 h-px w-6 bg-border" />
      )}
      {depth > 0 && (
        <div className="absolute left-0 top-0 h-full w-px bg-border" />
      )}

      <div className="my-2 flex max-w-md items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-2xs"
            style={{ backgroundColor: userMeta.color }}
          >
            {userMeta.initials}
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              {member?.displayName || userMeta.name}
            </div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {assignedRoles.length === 0 ? (
                <span className="text-[11px] text-muted-foreground italic">Sem cargo</span>
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
        </div>

        {node.subordinates.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {node.subordinates.length} {node.subordinates.length === 1 ? "liderado" : "liderados"}
          </span>
        )}
      </div>

      {node.subordinates.length > 0 && (
        <div className="ml-2 border-l border-border/80 pl-2">
          {node.subordinates.map((subNode) => (
            <TreeNodeItem
              key={subNode.memberId}
              node={subNode}
              allMembers={allMembers}
              memberRoles={memberRoles}
              orgRoles={orgRoles}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OrgTreeView({
  members,
  memberRoles,
  orgRoles,
}: {
  members: OrgMember[]
  memberRoles: MemberRole[]
  orgRoles: OrgRole[]
}) {
  const memberIds = members.map((m) => m.teamId)
  const treeRoots = buildHierarchyTree(memberIds, memberRoles)

  if (treeRoots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum membro cadastrado na hierarquia.
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card/40 p-4 sm:p-6">
      <div className="border-b pb-3">
        <h3 className="font-semibold text-foreground text-sm">Linha de Subordinação e Reporte</h3>
        <p className="text-xs text-muted-foreground">
          Estrutura em árvore mostrando quem reporta para quem nas funções da empresa.
        </p>
      </div>

      <div className="space-y-4 pt-2">
        {treeRoots.map((rootNode) => (
          <TreeNodeItem
            key={rootNode.memberId}
            node={rootNode}
            allMembers={members}
            memberRoles={memberRoles}
            orgRoles={orgRoles}
            depth={0}
          />
        ))}
      </div>
    </div>
  )
}
